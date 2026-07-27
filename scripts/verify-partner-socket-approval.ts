import { spawn, type ChildProcess } from "node:child_process";
import { io, type Socket } from "socket.io-client";
import { signToken } from "@/lib/auth";
import prisma from "@/lib/prisma";

const port = 3101;
const socketUrl = `http://127.0.0.1:${port}`;
const suffix = String(Date.now()).slice(-8);
let partnerId = "";
let child: ChildProcess | null = null;

function check(name: string, condition: unknown) {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

async function waitForHealth() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${socketUrl}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Socket server did not start");
}

function connectPartner(token: string) {
  return new Promise<{ connected: boolean; socket: Socket }>((resolve) => {
    const socket = io(socketUrl, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
      timeout: 5_000,
    });
    socket.once("connect", () => resolve({ connected: true, socket }));
    socket.once("connect_error", () => resolve({ connected: false, socket }));
  });
}

async function main() {
  const partner = await prisma.partner.create({
    data: {
      tenantId: "default",
      phone: `95${suffix}`,
      name: "Socket Approval Test",
      shopName: "Socket Approval Shop",
      applicationStatus: "PENDING",
      isApproved: false,
      isSuspended: false,
      isOnline: false,
    },
  });
  partnerId = partner.id;
  const token = signToken({
    id: partner.id,
    phone: partner.phone,
    role: "partner",
    tenantId: "default",
  });

  child = spawn(process.execPath, ["server/socket-server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "development",
      SOCKET_PORT: String(port),
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", () => {});
  child.stderr?.on("data", (data) => process.stderr.write(data));
  await waitForHealth();

  const pending = await connectPartner(token);
  check("socket rejects PENDING partner", !pending.connected);
  pending.socket.close();

  await prisma.partner.update({
    where: { id: partner.id },
    data: {
      applicationStatus: "APPROVED",
      isApproved: true,
      isSuspended: false,
    },
  });
  const approved = await connectPartner(token);
  check("socket accepts APPROVED partner", approved.connected);

  const disconnected = new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), 5_000);
    approved.socket.once("disconnect", () => {
      clearTimeout(timeout);
      resolve(true);
    });
  });

  await prisma.partner.update({
    where: { id: partner.id },
    data: {
      applicationStatus: "SUSPENDED",
      isApproved: false,
      isSuspended: true,
      isOnline: false,
    },
  });

  const internalSecret =
    process.env.SOCKET_INTERNAL_SECRET || "fixoo-dev-internal-secret";
  const revokeResponse = await fetch(`${socketUrl}/emit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-socket-secret": internalSecret,
    },
    body: JSON.stringify({
      room: `partner:${partner.id}`,
      event: "partner:access_revoked",
      data: { applicationStatus: "SUSPENDED" },
    }),
  });
  check("socket accepts internal access revocation", revokeResponse.ok);
  check("suspension disconnects active partner socket", await disconnected);

  const suspended = await connectPartner(token);
  check("socket rejects SUSPENDED partner", !suspended.connected);
  suspended.socket.close();
}

main()
  .finally(async () => {
    child?.kill();
    if (partnerId) {
      await prisma.partner.deleteMany({ where: { id: partnerId } });
    }
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
