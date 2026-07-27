import { expireOverdueRequests } from "@/server/request-expiry";
import prisma from "@/lib/prisma";

const tenantId = `expiry-verify-${Date.now()}`;
const verificationTenants = { startsWith: "expiry-verify-" };

function check(name: string, condition: unknown) {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

async function cleanup() {
  await prisma.notification.deleteMany({ where: { tenantId: verificationTenants } });
  await prisma.requestStatusHistory.deleteMany({ where: { tenantId: verificationTenants } });
  await prisma.partnerBroadcast.deleteMany({ where: { tenantId: verificationTenants } });
  await prisma.serviceRequest.deleteMany({ where: { tenantId: verificationTenants } });
  await prisma.partner.deleteMany({ where: { tenantId: verificationTenants } });
  await prisma.service.deleteMany({ where: { tenantId: verificationTenants } });
  await prisma.vehicleType.deleteMany({ where: { tenantId: verificationTenants } });
  await prisma.user.deleteMany({ where: { tenantId: verificationTenants } });
}

async function main() {
  await cleanup();

  const customer = await prisma.user.create({
    data: {
      tenantId,
      phone: `9${String(Date.now()).slice(-9)}`,
      name: "Expiry Worker Verification",
    },
  });
  const vehicleType = await prisma.vehicleType.create({
    data: {
      tenantId,
      name: "EXPIRY_TEST_VEHICLE",
      displayName: "Expiry Test Vehicle",
      sortOrder: 99,
    },
  });
  const service = await prisma.service.create({
    data: {
      tenantId,
      name: "EXPIRY_TEST_SERVICE",
      displayName: "Expiry Test Service",
    },
  });
  const partner = await prisma.partner.create({
    data: {
      tenantId,
      phone: `8${String(Date.now()).slice(-9)}`,
      name: "Expiry Test Partner",
      shopName: "Expiry Test Shop",
      isApproved: true,
      isOnline: true,
    },
  });
  const request = await prisma.serviceRequest.create({
    data: {
      tenantId,
      userId: customer.id,
      serviceId: service.id,
      vehicleTypeId: vehicleType.id,
      latitude: 25.2138,
      longitude: 75.8648,
      serviceFee: 100,
      platformFee: 20,
      totalAmount: 120,
      status: "REQUESTED",
      expiresAt: new Date(Date.now() - 1_000),
    },
  });
  await prisma.partnerBroadcast.create({
    data: {
      tenantId,
      requestId: request.id,
      partnerId: partner.id,
    },
  });

  const first = await expireOverdueRequests({ prisma, tenantId });
  const second = await expireOverdueRequests({ prisma, tenantId });

  const [updatedRequest, broadcast, historyCount, notificationCount] = await Promise.all([
    prisma.serviceRequest.findFirstOrThrow({ where: { id: request.id, tenantId } }),
    prisma.partnerBroadcast.findFirstOrThrow({ where: { requestId: request.id, tenantId } }),
    prisma.requestStatusHistory.count({
      where: { requestId: request.id, tenantId, toStatus: "EXPIRED" },
    }),
    prisma.notification.count({
      where: { requestId: request.id, tenantId, type: "REQUEST_EXPIRED" },
    }),
  ]);

  check("first cycle expires exactly one request", first.expired === 1);
  check("second cycle is idempotent", second.expired === 0);
  check("request status is EXPIRED", updatedRequest.status === "EXPIRED");
  check("broadcast response is TIMEOUT", broadcast.response === "TIMEOUT");
  check("one status history row exists", historyCount === 1);
  check("one customer notification exists", notificationCount === 1);
}

main()
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
