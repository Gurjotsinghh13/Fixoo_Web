import { NextRequest } from "next/server";
import { signToken } from "@/lib/auth";
import { POST as createRequest } from "@/app/api/requests/create/route";
import { getActiveRequestStatuses } from "@/lib/request-lifecycle";
import prisma from "@/lib/prisma";

const tenantId = `active-request-verify-${Date.now()}`;

process.env.DISABLE_SOCKET_EMIT = "true";

function check(name: string, condition: unknown) {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

function createCall(token: string, body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/requests/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `fixoo_token=${token}`,
    },
    body: JSON.stringify(body),
  });
}

// Holds every active-request findFirst for `userId` until `parties` of them have
// returned, so each concurrent call sees "no active request" before any create runs.
// This forces the TOCTOU window open instead of relying on timing.
let barrier: { userId: string; parties: number; arrived: number; release: () => void; ready: Promise<void> } | null =
  null;

function armBarrier(userId: string, parties: number) {
  let release = () => {};
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  barrier = { userId, parties, arrived: 0, release, ready };
}

prisma.$use(async (params, next) => {
  const result = await next(params);
  const where = params.args?.where;
  if (
    barrier &&
    params.model === "ServiceRequest" &&
    params.action === "findFirst" &&
    where?.userId === barrier.userId &&
    where?.status?.in
  ) {
    const current = barrier;
    current.arrived += 1;
    if (current.arrived >= current.parties) current.release();
    await current.ready;
  }
  return result;
});

async function cleanup() {
  const tenants = { startsWith: "active-request-verify-" };
  await prisma.partnerBroadcast.deleteMany({ where: { request: { tenantId: tenants } } });
  await prisma.requestStatusHistory.deleteMany({ where: { tenantId: tenants } });
  await prisma.serviceRequest.deleteMany({ where: { tenantId: tenants } });
  await prisma.servicePricing.deleteMany({ where: { tenantId: tenants } });
  await prisma.service.deleteMany({ where: { tenantId: tenants } });
  await prisma.vehicleType.deleteMany({ where: { tenantId: tenants } });
  await prisma.user.deleteMany({ where: { tenantId: tenants } });
}

async function main() {
  await cleanup();

  const duplicateActive = await prisma.$queryRaw<Array<{ tenantId: string; userId: string; count: number }>>`
    SELECT "tenantId", "userId", COUNT(*)::int AS count
    FROM service_requests
    WHERE status::text = ANY(${getActiveRequestStatuses()})
    GROUP BY "tenantId", "userId"
    HAVING COUNT(*) > 1
  `;
  const indexes = await prisma.$queryRaw<Array<{ indexdef: string }>>`
    SELECT indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'one_active_request_per_user'
  `;

  check("live database has no customer with multiple active requests", duplicateActive.length === 0);
  check("one_active_request_per_user partial unique index is deployed", indexes.length === 1);
  const indexdef = indexes[0].indexdef;
  check(
    "index covers exactly the statuses from getActiveRequestStatuses()",
    getActiveRequestStatuses().every((status) => indexdef.includes(`'${status}'`)) &&
      ["COMPLETED", "CANCELLED", "EXPIRED"].every((status) => !indexdef.includes(`'${status}'`))
  );

  const [vehicleType, service] = await Promise.all([
    prisma.vehicleType.create({
      data: { tenantId, name: "ACTIVE_VERIFY_VEHICLE", displayName: "Active Verify Vehicle", sortOrder: 99 },
    }),
    prisma.service.create({
      data: { tenantId, name: "ACTIVE_VERIFY_SERVICE", displayName: "Active Verify Service" },
    }),
  ]);
  await prisma.servicePricing.create({
    data: { tenantId, serviceId: service.id, vehicleTypeId: vehicleType.id, serviceFee: 199, platformFee: 20 },
  });
  const body = {
    serviceId: service.id,
    vehicleTypeId: vehicleType.id,
    latitude: 25.2138,
    longitude: 75.8648,
  };

  async function runScenario(label: string, phoneSuffix: string, forceRace: boolean) {
    const customer = await prisma.user.create({
      data: { tenantId, phone: `9${phoneSuffix}${String(Date.now()).slice(-8)}`, name: `${label} customer` },
    });
    const token = signToken({ id: customer.id, phone: customer.phone, role: "customer", tenantId });

    if (forceRace) armBarrier(customer.id, 2);
    const responses = await Promise.all([
      createRequest(createCall(token, body)),
      createRequest(createCall(token, body)),
    ]);
    barrier = null;

    const results = await Promise.all(
      responses.map(async (response) => ({ status: response.status, body: await response.json() }))
    );
    console.log(`[${label}] responses:`, JSON.stringify(results.map((r) => ({ status: r.status, body: r.body }))));

    const rows = await prisma.serviceRequest.findMany({
      where: { tenantId, userId: customer.id },
      select: { id: true, status: true },
    });
    console.log(`[${label}] service_requests rows for customer:`, JSON.stringify(rows));

    const statuses = results.map((r) => r.status).sort();
    const winner = results.find((r) => r.status === 200);
    const loser = results.find((r) => r.status === 409);
    check(`[${label}] one 200 and one 409 (no 500)`, statuses.join(",") === "200,409");
    check(`[${label}] exactly one ServiceRequest row created`, rows.length === 1);
    check(
      `[${label}] 409 body keeps existing contract`,
      loser?.body.success === false && loser?.body.error === "You already have an active request"
    );
    // Dispatch expires the winner immediately when no partners are online (as in this
    // fixture), so by the time the loser looks it up it may no longer be active.
    check(
      `[${label}] 409 requestId is the winning request, or absent if it already left the active set`,
      loser?.body.requestId === undefined ||
        (loser?.body.requestId === winner?.body.data.requestId && loser?.body.requestId === rows[0]?.id)
    );
    return { customer, token, requestId: rows[0].id };
  }

  await runScenario("natural-race", "1", false);
  const forced = await runScenario("forced-race", "2", true);

  // The partial index must not block a new request once the previous one is no longer active.
  await prisma.serviceRequest.update({
    where: { id: forced.requestId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  const afterCancel = await createRequest(createCall(forced.token, body));
  check("new request allowed after previous one is CANCELLED", afterCancel.status === 200);
  const activeAfterCancel = await prisma.serviceRequest.count({
    where: { tenantId, userId: forced.customer.id, status: { in: getActiveRequestStatuses() } },
  });
  check("customer has exactly one active request after re-request", activeAfterCancel === 1);
}

main()
  .finally(async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await cleanup();
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
