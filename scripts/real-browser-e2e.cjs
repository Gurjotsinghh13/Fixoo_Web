const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const WebSocket = require("ws");
const prisma = require("../server/prisma");

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const appUrl = "http://localhost:3000";
const customerPhone = "9000000001";
const partnerPhone = "9800000002";
const adminPhone = "9999999999";
const activeStatuses = ["REQUESTED", "ACCEPTED", "ON_THE_WAY", "ARRIVED", "REPAIR_IN_PROGRESS"];

const results = [];

function result(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resetE2eState() {
  const customer = await prisma.user.findFirst({
    where: { phone: customerPhone },
    select: { id: true, tenantId: true },
  });
  const partner = await prisma.partner.findFirst({
    where: { phone: partnerPhone },
    select: { id: true, tenantId: true },
  });

  if (customer) {
    await prisma.serviceRequest.updateMany({
      where: {
        tenantId: customer.tenantId,
        userId: customer.id,
        status: { in: activeStatuses },
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: "Reset before real-browser E2E validation",
      },
    });
  }

  if (partner) {
    await prisma.partner.updateMany({
      where: { id: partner.id, tenantId: partner.tenantId },
      data: { isOnline: false },
    });
  }
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, options);
  return res.json();
}

class CdpPage {
  constructor(label, port) {
    this.label = label;
    this.port = port;
    this.id = 0;
    this.pending = new Map();
    this.events = {};
    this.consoleErrors = [];
    this.networkErrors = [];
    this.socketFrames = [];
    this.otpBodies = [];
    this.requestUrls = new Map();
  }

  async connect(url) {
    const versionUrl = `http://127.0.0.1:${this.port}/json/version`;
    for (let i = 0; i < 60; i++) {
      try {
        await requestJson(versionUrl);
        break;
      } catch {
        await sleep(250);
      }
    }

    const target = await requestJson(`http://127.0.0.1:${this.port}/json/new?${encodeURIComponent(url)}`, {
      method: "PUT",
    });
    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      this.ws.once("open", resolve);
      this.ws.once("error", reject);
    });
    this.ws.on("message", async (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
        return;
      }
      if (msg.method) {
        (this.events[msg.method] || []).forEach((handler) => handler(msg.params));
        this.handleEvent(msg.method, msg.params).catch(() => {});
      }
    });

    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("Network.enable");
    await this.send("Log.enable");
    await this.send("Browser.grantPermissions", {
      origin: appUrl,
      permissions: ["geolocation"],
    }).catch(() => {});
    await this.send("Emulation.setGeolocationOverride", {
      latitude: 25.2138,
      longitude: 75.8648,
      accuracy: 10,
    }).catch(() => {});
  }

  async handleEvent(method, params) {
    if (method === "Runtime.exceptionThrown") {
      this.consoleErrors.push(`exception: ${params.exceptionDetails?.text || "Runtime exception"}`);
    }
    if (method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(params.type)) {
      const text = (params.args || []).map((arg) => arg.value || arg.description || "").join(" ");
      this.consoleErrors.push(text);
    }
    if (method === "Log.entryAdded" && ["error", "warning"].includes(params.entry?.level)) {
      this.consoleErrors.push(params.entry.text);
    }
    if (method === "Network.responseReceived") {
      const { response, requestId } = params;
      if (response.status >= 400) {
        this.networkErrors.push(`${response.status} ${response.url}`);
      }
      if (response.url.includes("/api/auth/send-otp")) {
        this.lastOtpRequestId = requestId;
      }
    }
    if (method === "Network.requestWillBeSent") {
      this.requestUrls.set(params.requestId, params.request.url);
    }
    if (
      method === "Network.loadingFinished" &&
      (params.requestId === this.lastOtpRequestId ||
        this.requestUrls.get(params.requestId)?.includes("/api/auth/send-otp"))
    ) {
      try {
        const body = await this.send("Network.getResponseBody", { requestId: params.requestId });
        this.otpBodies.push(body.body);
      } catch {}
    }
    if (method === "Network.loadingFailed") {
      if (params.errorText !== "net::ERR_ABORTED") {
        this.networkErrors.push(`${params.errorText} ${params.blockedReason || ""}`.trim());
      }
    }
    if (method === "Network.webSocketFrameReceived" || method === "Network.webSocketFrameSent") {
      const payload = params.response?.payloadData || params.payloadData || "";
      if (payload.includes("request:")) this.socketFrames.push(payload);
    }
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${method} timed out`));
        }
      }, 15000);
    });
  }

  on(method, handler) {
    this.events[method] ||= [];
    this.events[method].push(handler);
  }

  async eval(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.text ||
        result.exceptionDetails.exception?.description ||
        "Runtime evaluation failed"
      );
    }
    return result.result?.value;
  }

  async goto(url) {
    await this.send("Page.navigate", { url });
    await this.waitFor(() => document.readyState === "complete" || document.readyState === "interactive", 30000);
  }

  async waitFor(fn, timeout = 15000) {
    const source = `(${fn.toString()})()`;
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const value = await this.eval(source).catch(() => false);
      if (value) return value;
      await sleep(250);
    }
    throw new Error(`${this.label}: waitFor timed out`);
  }

  async describeState() {
    const [url, text, otpValues] = await Promise.all([
      this.url().catch(() => ""),
      this.visibleText().catch(() => ""),
      this.eval(`
        (() => [...document.querySelectorAll('input[inputmode="numeric"][type="text"]')]
          .map((input) => input.value)
          .join(''))()
      `).catch(() => ""),
    ]);
    return [
      `url=${url}`,
      `text=${JSON.stringify(text.slice(0, 800))}`,
      `otpValues=${otpValues}`,
      `network=${this.networkErrors.join(" | ")}`,
      `console=${this.consoleErrors.join(" | ")}`,
    ].join("\n");
  }

  async waitForStep(label, fn, timeout = 15000) {
    try {
      return await this.waitFor(fn, timeout);
    } catch (error) {
      throw new Error(`${this.label}: ${label} timed out\n${await this.describeState()}`);
    }
  }

  async visibleText() {
    return this.eval(`document.body.innerText`);
  }

  async url() {
    return this.eval(`location.href`);
  }

  async setInput(selector, value) {
    await this.send("Page.bringToFront").catch(() => {});
    await this.eval(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error('missing input ${selector}');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      })()
    `);
  }

  async fillOtp(otp) {
    await this.eval(`
      (() => {
        const inputs = [...document.querySelectorAll('input[inputmode="numeric"][type="text"]')];
        if (inputs.length < 6) throw new Error('missing otp inputs');
        const otp = ${JSON.stringify(otp)};
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        inputs.slice(0, otp.length).forEach((input, index) => {
          setter.call(input, otp[index]);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: otp[index] }));
        });
      })()
    `);
  }

  async clickText(text) {
    await this.send("Page.bringToFront").catch(() => {});
    const point = await this.eval(`
      (() => {
        const text = ${JSON.stringify(text)};
        const el = [...document.querySelectorAll('button,a')]
          .find((node) => node.textContent && node.textContent.includes(text));
        if (!el) throw new Error('missing clickable text: ' + text);
        const rect = el.getBoundingClientRect();
        if (!el.disabled) el.click();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, disabled: Boolean(el.disabled) };
      })()
    `);
    if (!point) {
      throw new Error(`${this.label}: ${text} click target missing\n${await this.describeState()}`);
    }
    if (point.disabled) {
      const debug = await this.eval(`
        (() => {
          const input = document.querySelector('input[type="tel"]');
          const button = [...document.querySelectorAll('button,a')]
            .find((node) => node.textContent && node.textContent.includes(${JSON.stringify(text)}));
          return {
            inputValue: input?.value,
            inputLength: input?.value?.length,
            activeTag: document.activeElement?.tagName,
            activeValue: document.activeElement?.value,
            reactKeys: input ? Reflect.ownKeys(input).map(String).filter((key) => key.toLowerCase().includes('react') || key.toLowerCase().includes('value')) : [],
            rootKeys: Reflect.ownKeys(document.body).map(String).filter((key) => key.toLowerCase().includes('react')).slice(0, 10),
            buttonDisabled: button?.disabled,
            buttonText: button?.textContent,
          };
        })()
      `).catch((error) => ({ debugError: error.message }));
      throw new Error(`${this.label}: ${text} is disabled ${JSON.stringify(debug)}`);
    }
  }

  async waitForOtp() {
    const started = Date.now();
    while (Date.now() - started < 45000) {
      for (const body of this.otpBodies) {
        try {
          const parsed = JSON.parse(body);
          if (parsed.devOtp) return parsed.devOtp;
        } catch {}
      }
      const text = await this.visibleText().catch(() => "");
      const match = text.match(/Dev OTP:\s*(\d{6})/);
      if (match) return match[1];
      await sleep(250);
    }
    const text = await this.visibleText().catch(() => "");
    throw new Error(`${this.label}: OTP not observed. Text=${text.slice(0, 500)} Network=${this.networkErrors.join(" | ")}`);
  }

  close() {
    this.ws?.close();
  }
}

function launchChrome(label, port) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `fixoo-${label}-`));
  const child = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${dir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-popup-blocking",
    "--use-fake-ui-for-media-stream",
    "about:blank",
  ], { stdio: "ignore", detached: false });
  return { child, dir };
}

async function login(page, pathName, phone, expectedPath) {
  await page.goto(`${appUrl}${pathName}`);
  await page.waitForStep("phone input", () => Boolean(document.querySelector('input[type="tel"]')));
  await sleep(3000);
  await page.setInput('input[type="tel"]', phone);
  await page.waitForStep("phone value", () => document.querySelector('input[type="tel"]')?.value?.length === 10);
  await page.clickText("Send OTP");
  const otp = await page.waitForOtp();
  await page.waitForStep("verify step", () => document.body.innerText.includes("Verify"));
  await page.fillOtp(otp);
  await page.waitForStep(
    `redirect to ${expectedPath}`,
    new Function(`return location.pathname.startsWith(${JSON.stringify(expectedPath)})`),
    20000
  );
}

async function main() {
  await resetE2eState();
  const launches = [
    launchChrome("customer", 9331),
    launchChrome("partner", 9332),
    launchChrome("admin", 9333),
  ];
  const customer = new CdpPage("customer", 9331);
  const partner = new CdpPage("partner", 9332);
  const admin = new CdpPage("admin", 9333);

  try {
    await Promise.all([
      customer.connect(`${appUrl}/login`),
      partner.connect(`${appUrl}/partner/login`),
      admin.connect(`${appUrl}/login`),
    ]);

    await login(partner, "/partner/login", partnerPhone, "/partner/dashboard");
    result("Partner login", true);
    const initialPartnerText = await partner.visibleText();
    if (!initialPartnerText.includes("Waiting for requests") && !initialPartnerText.includes("You're receiving requests")) {
      await partner.clickText("GO ONLINE");
    }
    await partner.waitForStep(
      "partner online state",
      () => document.body.innerText.includes("Waiting for requests") || document.body.innerText.includes("You're receiving requests"),
      30000
    );
    result("Partner dashboard online", true);

    await login(customer, "/login", customerPhone, "/home");
    result("Customer login", true);
    await customer.waitForStep(
      "request help button enabled",
      () => {
        const button = [...document.querySelectorAll("button")]
          .find((node) => node.textContent && node.textContent.includes("Request Help Now"));
        return Boolean(button && !button.disabled);
      },
      30000
    );
    await customer.clickText("Request Help Now");
    await customer.waitForStep("navigate to request page", () => location.pathname === "/request", 15000);
    await customer.waitForStep(
      "confirm button enabled",
      () => {
        const button = [...document.querySelectorAll("button")]
          .find((node) => node.textContent && node.textContent.includes("Confirm"));
        return Boolean(button && !button.disabled);
      },
      30000
    );
    await customer.clickText("Confirm");
    await customer.waitForStep("navigate to tracking page", () => location.pathname.startsWith("/tracking/"), 60000);
    const trackingUrl = await customer.url();
    const requestId = trackingUrl.split("/tracking/")[1]?.split(/[?#]/)[0];
    result("Customer creates request and stays on tracking", Boolean(requestId), requestId);

    await partner.waitForStep("receive request broadcast", () => document.body.innerText.toLowerCase().includes("new request"), 45000);
    result("Partner receives broadcast", true);
    await partner.clickText("Accept");
    await partner.waitForStep("navigate to partner job", () => location.pathname.startsWith("/partner/job/"), 30000);
    result("Partner accepts request", true);
    await customer.waitForStep(
      "customer accepted update",
      () => document.body.innerText.includes("Partner is coming") || document.body.innerText.includes("Partner assigned"),
      30000
    );
    result("Customer remains on tracking after accept", (await customer.url()).includes(`/tracking/${requestId}`));
    result("Customer sees accepted update", true);

    await partner.waitForStep("on the way action visible", () => document.body.innerText.includes("I'm on my way"), 30000);
    await partner.clickText("I'm on my way");
    await customer.waitForStep("customer on the way update", () => document.body.innerText.includes("on the way"), 30000);
    result("Partner updates ON_THE_WAY", true);

    await partner.waitForStep("arrived action visible", () => document.body.innerText.includes("I've arrived"), 30000);
    await partner.clickText("I've arrived");
    await customer.waitForStep("customer arrived update", () => document.body.innerText.includes("arrived"), 30000);
    result("Partner updates ARRIVED", true);

    await partner.waitForStep("start repair action visible", () => document.body.innerText.includes("Start repair"), 30000);
    await partner.clickText("Start repair");
    await customer.waitForStep("customer repair progress update", () => document.body.innerText.includes("Repair in progress"), 30000);
    result("Partner updates REPAIR_IN_PROGRESS", true);

    await partner.waitForStep("complete action visible", () => document.body.innerText.includes("Mark as completed"), 30000);
    await partner.clickText("Mark as completed");
    await customer.waitForStep(
      "customer completion update",
      () => document.body.innerText.includes("Repair completed") || document.body.innerText.includes("All done"),
      30000
    );
    result("Partner completes request", true);

    await login(admin, "/admin/login", adminPhone, "/admin/dashboard");
    await admin.waitForStep(
      "admin dashboard analytics visible",
      () => document.body.innerText.includes("Fixoo Admin") && document.body.innerText.includes("Recent Requests"),
      60000
    );
    const adminUrl = await admin.url();
    const adminText = await admin.visibleText();
    result("Admin UI accessible with seeded admin", adminUrl.includes("/admin/dashboard"), adminUrl);
    result("Admin sees completed request", adminText.includes("COMPLETED") && adminText.includes("Test Partner"));

    const allPages = [customer, partner, admin];
    const consoleErrors = allPages.flatMap((page) => page.consoleErrors.map((err) => `${page.label}: ${err}`));
    const networkErrors = allPages.flatMap((page) => page.networkErrors.map((err) => `${page.label}: ${err}`));
    const socketFrames = allPages.flatMap((page) => page.socketFrames.map((frame) => `${page.label}: ${frame.slice(0, 160)}`));

    console.log("\n---E2E_JSON_START---");
    console.log(JSON.stringify({
      results,
      consoleErrors,
      networkErrors,
      socketFrames,
      urls: {
        customer: await customer.url(),
        partner: await partner.url(),
        admin: await admin.url(),
      },
    }, null, 2));
    console.log("---E2E_JSON_END---");

    process.exitCode = results.every((entry) => entry.ok) && consoleErrors.length === 0 && networkErrors.length === 0 ? 0 : 1;
  } finally {
    customer.close();
    partner.close();
    admin.close();
    for (const launch of launches) {
      launch.child.kill();
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  result("E2E runtime", false, error.message);
  console.log("\n---E2E_JSON_START---");
  console.log(JSON.stringify({ results, error: error.stack }, null, 2));
  console.log("---E2E_JSON_END---");
  process.exitCode = 1;
});
