import { NextRequest } from "next/server";
import { signToken } from "@/lib/auth";
import { PATCH as updateRequestStatus } from "@/app/api/requests/status/route";
import { GET as getRequest } from "@/app/api/requests/[id]/route";
import prisma from "@/lib/prisma";

const tenantId = `completion-verify-${Date.now()}`;

process.env.DISABLE_SOCKET_EMIT = "true";

function check(name: string, condition: unknown) {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

function statusRequest(token: string, requestId: string) {
  return new NextRequest("http://localhost/api/requests/status", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: `fixoo_token=${token}`,
    },
    body: JSON.stringify({ requestId, status: "COMPLETED" }),
  });
}

async function cleanup() {
  const tenants = { startsWith: "completion-verify-" };
  await prisma.partnerActivity.deleteMany({ where: { tenantId: tenants } });
  await prisma.requestStatusHistory.deleteMany({ where: { tenantId: tenants } });
  await prisma.transaction.deleteMany({ where: { tenantId: tenants } });
  await prisma.serviceRequest.deleteMany({ where: { tenantId: tenants } });
  await prisma.partner.deleteMany({ where: { tenantId: tenants } });
  await prisma.service.deleteMany({ where: { tenantId: tenants } });
  await prisma.vehicleType.deleteMany({ where: { tenantId: tenants } });
  await prisma.user.deleteMany({ where: { tenantId: tenants } });
}

async function main() {
  await cleanup();

  const duplicateTransactions = await prisma.$queryRaw<Array<{ requestId: string; count: number }>>`
    SELECT "requestId", COUNT(*)::int AS count
    FROM transactions
    GROUP BY "requestId"
    HAVING COUNT(*) > 1
  `;
  const transactionIndexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'transactions'
  `;
  const indexNames = new Set(transactionIndexes.map((index) => index.indexname));

  check("live database has no duplicate transactions by request", duplicateTransactions.length === 0);
  check("requestId unique index is deployed", indexNames.has("transactions_requestId_key"));
  check(
    "tenantId/requestId unique index is deployed",
    indexNames.has("transactions_tenantId_requestId_key")
  );

  const [customer, partner, vehicleType, service] = await Promise.all([
    prisma.user.create({
      data: {
        tenantId,
        phone: `9${String(Date.now()).slice(-9)}`,
        name: "Completion Test Customer",
      },
    }),
    prisma.partner.create({
      data: {
        tenantId,
        phone: `8${String(Date.now()).slice(-9)}`,
        name: "Completion Test Partner",
        shopName: "Completion Test Shop",
        applicationStatus: "APPROVED",
        isApproved: true,
        isSuspended: false,
        isOnline: true,
      },
    }),
    prisma.vehicleType.create({
      data: {
        tenantId,
        name: "COMPLETION_TEST_VEHICLE",
        displayName: "Completion Test Vehicle",
        sortOrder: 99,
      },
    }),
    prisma.service.create({
      data: {
        tenantId,
        name: "COMPLETION_TEST_SERVICE",
        displayName: "Completion Test Service",
      },
    }),
  ]);

  const request = await prisma.serviceRequest.create({
    data: {
      tenantId,
      userId: customer.id,
      partnerId: partner.id,
      serviceId: service.id,
      vehicleTypeId: vehicleType.id,
      status: "REPAIR_IN_PROGRESS",
      latitude: 25.2138,
      longitude: 75.8648,
      serviceFee: 199,
      platformFee: 20,
      totalAmount: 219,
      startedAt: new Date(),
    },
  });

  const token = signToken({
    id: partner.id,
    phone: partner.phone,
    role: "partner",
    tenantId,
  });

  const concurrentResponses = await Promise.all([
    updateRequestStatus(statusRequest(token, request.id)),
    updateRequestStatus(statusRequest(token, request.id)),
  ]);
  const concurrentStatuses = concurrentResponses.map((response) => response.status).sort();
  if (concurrentStatuses.join(",") !== "200,409") {
    const bodies = await Promise.all(
      concurrentResponses.map((response) => response.clone().text())
    );
    console.error("Concurrent completion responses:", concurrentStatuses, bodies);
  }

  const countAfterConcurrent = await prisma.transaction.count({
    where: { tenantId, requestId: request.id },
  });

  const repeatedResponse = await updateRequestStatus(statusRequest(token, request.id));
  const countAfterRepeat = await prisma.transaction.count({
    where: { tenantId, requestId: request.id },
  });

  const refreshResponse = await getRequest(
    new NextRequest(`http://localhost/api/requests/${request.id}`, {
      headers: { Cookie: `fixoo_token=${token}` },
    }),
    { params: Promise.resolve({ id: request.id }) }
  );
  const countAfterRefresh = await prisma.transaction.count({
    where: { tenantId, requestId: request.id },
  });
  const updatedPartner = await prisma.partner.findFirstOrThrow({
    where: { tenantId, id: partner.id },
    select: { completedJobs: true },
  });

  check("concurrent completion has one success and one conflict", concurrentStatuses.join(",") === "200,409");
  check("concurrent completion creates exactly one transaction", countAfterConcurrent === 1);
  check("repeated COMPLETED request is rejected", repeatedResponse.status === 400);
  check("repeated COMPLETED request creates no transaction", countAfterRepeat === 1);
  check("refresh GET succeeds", refreshResponse.status === 200);
  check("refresh GET creates no transaction", countAfterRefresh === 1);
  check("partner completedJobs increments exactly once", updatedPartner.completedJobs === 1);
}

main()
  .finally(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await cleanup();
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
