const { expireOverdueRequests, DEFAULT_BATCH_SIZE } = require("./request-expiry");
const prisma = require("./prisma");

const INTERVAL_MS = 15_000;
const BATCH_SIZE = Number(process.env.EXPIRY_WORKER_BATCH_SIZE || DEFAULT_BATCH_SIZE);
const MAX_BATCHES_PER_CYCLE = Number(process.env.EXPIRY_WORKER_MAX_BATCHES || 10);
const SOCKET_INTERNAL_URL =
  process.env.SOCKET_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  "http://localhost:3001";
const SOCKET_INTERNAL_SECRET =
  process.env.SOCKET_INTERNAL_SECRET ||
  (process.env.NODE_ENV === "production" ? undefined : "fixoo-dev-internal-secret");

let stopping = false;
let timer = null;

if (!SOCKET_INTERNAL_SECRET) {
  console.error("SOCKET_INTERNAL_SECRET is required for the expiry worker in production");
  process.exit(1);
}

async function emit(room, event, data) {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${SOCKET_INTERNAL_URL}/emit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-socket-secret": SOCKET_INTERNAL_SECRET,
        },
        body: JSON.stringify({ room, event, data }),
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) {
        throw new Error(`Socket server returned ${response.status}`);
      }
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
  }

  throw lastError;
}

async function emitExpiryEvents(request) {
  const payload = {
    requestId: request.id,
    status: "EXPIRED",
    timestamp: new Date().toISOString(),
  };

  await Promise.all([
    emit(`customer:${request.userId}`, "request:expired", payload),
    emit(`tenant:${request.tenantId}:partners`, "request:expired", payload),
    emit(`admin:${request.tenantId}`, "admin:request_status", payload),
  ]);
}

async function runCycle() {
  const startedAt = Date.now();
  let totalExpired = 0;
  let batches = 0;

  do {
    const result = await expireOverdueRequests({
      prisma,
      batchSize: BATCH_SIZE,
      onExpired: emitExpiryEvents,
    });

    totalExpired += result.expired;
    batches += 1;

    if (result.scanned < BATCH_SIZE) break;
  } while (!stopping && batches < MAX_BATCHES_PER_CYCLE);

  if (totalExpired > 0) {
    console.log(
      `Expiry worker processed ${totalExpired} request(s) in ${Date.now() - startedAt}ms`
    );
  }
}

async function tick() {
  try {
    await runCycle();
  } catch (error) {
    console.error("Expiry worker cycle failed:", error);
  } finally {
    if (!stopping) timer = setTimeout(tick, INTERVAL_MS);
  }
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  if (timer) clearTimeout(timer);
  console.log(`Expiry worker stopping after ${signal}`);
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

async function start() {
  console.log(`Fixoo expiry worker started; polling every ${INTERVAL_MS / 1000}s`);
  await tick();
}

if (require.main === module) {
  start().catch(async (error) => {
    console.error("Expiry worker failed to start:", error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
}

module.exports = {
  INTERVAL_MS,
  emitExpiryEvents,
  runCycle,
};
