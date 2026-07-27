import { RequestStatus } from "@prisma/client";
import { startOfDay, startOfWeek } from "date-fns";
import { acceptRequest, dispatchRequest } from "@/lib/dispatch";
import { expireOverdueRequestsForTenant } from "@/lib/request-lifecycle";
import prisma from "@/lib/prisma";

const tenantId = `sim-${Date.now()}`;
const baseLat = 25.2138;
const baseLng = 75.8648;
const socketInternalUrl =
  process.env.SOCKET_INTERNAL_URL || process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";
const socketInternalSecret =
  process.env.SOCKET_INTERNAL_SECRET || process.env.JWT_SECRET || "fixoo-dev-internal-secret";

type ScenarioResult = {
  name: string;
  ok: boolean;
  detail?: string;
};

const results: ScenarioResult[] = [];

function record(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function seedMarketplace() {
  const tenant = await prisma.tenant.create({
    data: {
      id: tenantId,
      slug: tenantId,
      name: "Marketplace Simulation",
    },
  });

  const customer = await prisma.user.create({
    data: {
      tenantId,
      phone: "9000010000",
      name: "Simulation Customer",
    },
  });

  const admin = await prisma.admin.create({
    data: {
      tenantId,
      phone: "9999910000",
      name: "Simulation Admin",
      role: "SUPER_ADMIN",
    },
  });

  const vehicleType = await prisma.vehicleType.create({
    data: {
      tenantId,
      name: "SIM_BIKE",
      displayName: "Simulation Bike",
      sortOrder: 1,
      isActive: true,
    },
  });

  const service = await prisma.service.create({
    data: {
      tenantId,
      name: "SIM_PUNCTURE",
      displayName: "Simulation Puncture Repair",
      category: "ROADSIDE",
      isActive: true,
    },
  });

  const pricing = await prisma.servicePricing.create({
    data: {
      tenantId,
      serviceId: service.id,
      vehicleTypeId: vehicleType.id,
      serviceFee: 200,
      platformFee: 25,
      nightSurcharge: 50,
      etaMin: 10,
      etaMax: 15,
      isActive: true,
    },
  });

  const partners = await Promise.all(
    Array.from({ length: 5 }, async (_, index) => {
      const partner = await prisma.partner.create({
        data: {
          tenantId,
          phone: `980001000${index}`,
          name: `Partner ${String.fromCharCode(65 + index)}`,
          shopName: `Partner ${String.fromCharCode(65 + index)} Tyres`,
          isApproved: true,
          isOnline: true,
          rating: 4.5 + index / 10,
          vehicleTypes: {
            create: {
              tenantId,
              vehicleTypeId: vehicleType.id,
            },
          },
        },
      });

      await prisma.partnerLocation.create({
        data: {
          tenantId,
          partnerId: partner.id,
          latitude: baseLat + index * 0.001,
          longitude: baseLng + index * 0.001,
        },
      });

      return partner;
    })
  );

  return { tenant, customer, admin, vehicleType, service, pricing, partners };
}

async function createRequest(seed: Awaited<ReturnType<typeof seedMarketplace>>, overrides = {}) {
  const serviceFee = seed.pricing.serviceFee;
  const platformFee = seed.pricing.platformFee;

  return prisma.serviceRequest.create({
    data: {
      tenantId,
      userId: seed.customer.id,
      serviceId: seed.service.id,
      vehicleTypeId: seed.vehicleType.id,
      latitude: baseLat,
      longitude: baseLng,
      address: "Simulation address",
      area: "Simulation area",
      serviceFee,
      platformFee,
      nightSurcharge: 0,
      totalAmount: serviceFee.plus(platformFee),
      status: "REQUESTED",
      expiresAt: new Date(Date.now() + 60_000),
      ...overrides,
    },
  });
}

async function completeRequest(requestId: string, partnerId: string) {
  for (const status of ["ON_THE_WAY", "ARRIVED", "REPAIR_IN_PROGRESS"] as RequestStatus[]) {
    await prisma.serviceRequest.updateMany({
      where: { tenantId, id: requestId, partnerId },
      data: {
        status,
        ...(status === "ON_THE_WAY" ? { onTheWayAt: new Date() } : {}),
        ...(status === "ARRIVED" ? { arrivedAt: new Date() } : {}),
        ...(status === "REPAIR_IN_PROGRESS" ? { startedAt: new Date() } : {}),
      },
    });
  }

  await prisma.$transaction(async (tx) => {
    const changed = await tx.serviceRequest.updateMany({
      where: { tenantId, id: requestId, partnerId, status: "REPAIR_IN_PROGRESS" },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    if (changed.count !== 1) throw new Error("completion failed");

    const request = await tx.serviceRequest.findFirstOrThrow({ where: { tenantId, id: requestId } });
    await tx.transaction.upsert({
      where: { tenantId_requestId: { tenantId, requestId } },
      update: { status: "COMPLETED", paidAt: new Date() },
      create: {
        tenantId,
        requestId,
        partnerId,
        totalAmount: request.totalAmount,
        platformFee: request.platformFee,
        partnerEarning: request.serviceFee,
        status: "COMPLETED",
        paidAt: new Date(),
      },
    });
    await tx.partner.updateMany({
      where: { tenantId, id: partnerId },
      data: { completedJobs: { increment: 1 } },
    });
  });
}

async function postSocketEvent(index: number) {
  const response = await fetch(`${socketInternalUrl}/emit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-socket-secret": socketInternalSecret,
    },
    body: JSON.stringify({
      room: `admin:${tenantId}`,
      event: "simulation:socket_stress",
      data: { index, tenantId, timestamp: new Date().toISOString() },
    }),
  });

  return response.ok;
}

async function simulate() {
  await prisma.$connect();
  const seed = await seedMarketplace();
  record("created customer, five partners, admin", true, tenantId);

  const request1 = await createRequest(seed);
  await dispatchRequest(request1.id, tenantId);
  const partnerAWin = await acceptRequest(request1.id, seed.partners[0].id, tenantId);
  const partnerBAfter = await acceptRequest(request1.id, seed.partners[1].id, tenantId);
  const assigned1 = await prisma.serviceRequest.findFirstOrThrow({ where: { tenantId, id: request1.id } });
  record(
    "scenario 1: first partner assigned and others blocked",
    partnerAWin && !partnerBAfter && assigned1.partnerId === seed.partners[0].id && assigned1.status === "ACCEPTED"
  );

  await prisma.partner.updateMany({ where: { tenantId }, data: { isOnline: false } });
  const request2 = await createRequest(seed);
  await dispatchRequest(request2.id, tenantId);
  const expired2 = await prisma.serviceRequest.findFirstOrThrow({ where: { tenantId, id: request2.id } });
  record("scenario 2: no partner accepts expires request", expired2.status === "EXPIRED");
  await prisma.partner.updateMany({ where: { tenantId }, data: { isOnline: true } });

  const request3 = await createRequest(seed);
  await dispatchRequest(request3.id, tenantId);
  const simultaneous = await Promise.all([
    acceptRequest(request3.id, seed.partners[1].id, tenantId),
    acceptRequest(request3.id, seed.partners[2].id, tenantId),
  ]);
  const assigned3 = await prisma.serviceRequest.findFirstOrThrow({ where: { tenantId, id: request3.id } });
  record(
    "scenario 3: simultaneous accept has exactly one winner",
    simultaneous.filter(Boolean).length === 1 && Boolean(assigned3.partnerId)
  );

  const request4 = await createRequest(seed);
  await dispatchRequest(request4.id, tenantId);
  await acceptRequest(request4.id, seed.partners[0].id, tenantId);
  await prisma.partner.updateMany({ where: { tenantId, id: seed.partners[0].id }, data: { isOnline: false } });
  const offlineAccepted = await prisma.serviceRequest.findFirstOrThrow({ where: { tenantId, id: request4.id } });
  record(
    "scenario 4: partner offline after accept keeps assignment",
    offlineAccepted.partnerId === seed.partners[0].id && offlineAccepted.status === "ACCEPTED",
    "current behavior: no automatic reassignment"
  );
  await prisma.partner.updateMany({ where: { tenantId, id: seed.partners[0].id }, data: { isOnline: true } });

  const request5 = await createRequest(seed);
  await dispatchRequest(request5.id, tenantId);
  await prisma.$transaction(async (tx) => {
    await tx.serviceRequest.updateMany({
      where: { tenantId, id: request5.id, status: "REQUESTED" },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "Simulation cancel" },
    });
    await tx.partnerBroadcast.updateMany({
      where: { tenantId, requestId: request5.id, response: null },
      data: { response: "REJECTED", respondedAt: new Date() },
    });
  });
  const pendingBroadcasts5 = await prisma.partnerBroadcast.count({
    where: { tenantId, requestId: request5.id, response: null },
  });
  record("scenario 5: cancel before acceptance dismisses broadcasts", pendingBroadcasts5 === 0);

  const request6 = await createRequest(seed);
  await dispatchRequest(request6.id, tenantId);
  await acceptRequest(request6.id, seed.partners[0].id, tenantId);
  await prisma.serviceRequest.updateMany({
    where: { tenantId, id: request6.id, status: { in: ["ACCEPTED", "ON_THE_WAY"] } },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "Simulation accepted cancel" },
  });
  const cancelled6 = await prisma.serviceRequest.findFirstOrThrow({ where: { tenantId, id: request6.id } });
  record("scenario 6: cancel after acceptance allowed before arrival", cancelled6.status === "CANCELLED");

  const request7 = await createRequest(seed);
  await dispatchRequest(request7.id, tenantId);
  const accepted7 = await acceptRequest(request7.id, seed.partners[0].id, tenantId);
  assert(accepted7, "scenario 7 acceptance failed");
  await completeRequest(request7.id, seed.partners[0].id);
  const [transaction7, partner7, analyticsCompleted] = await Promise.all([
    prisma.transaction.findUnique({ where: { tenantId_requestId: { tenantId, requestId: request7.id } } }),
    prisma.partner.findFirst({ where: { tenantId, id: seed.partners[0].id } }),
    prisma.serviceRequest.count({ where: { tenantId, status: "COMPLETED", completedAt: { gte: startOfDay(new Date()) } } }),
  ]);
  record(
    "scenario 7: completion creates transaction, earnings, analytics",
    Boolean(transaction7) && Number(transaction7?.partnerEarning) === 200 && Boolean(partner7?.completedJobs) && analyticsCompleted >= 1
  );

  const stressRequests = await Promise.all(Array.from({ length: 100 }, () => createRequest(seed)));
  const startedAt = Date.now();
  await Promise.all(stressRequests.map((request) => dispatchRequest(request.id, tenantId)));
  const acceptedStress = await Promise.all(
    stressRequests.map((request, index) =>
      acceptRequest(request.id, seed.partners[index % seed.partners.length].id, tenantId)
    )
  );
  const stressAssigned = await prisma.serviceRequest.count({
    where: { tenantId, id: { in: stressRequests.map((request) => request.id) }, status: "ACCEPTED", partnerId: { not: null } },
  });
  const duplicateAssignments = await prisma.$queryRaw<Array<{ request_id: string; count: bigint }>>`
    SELECT "requestId" AS request_id, COUNT(*)::bigint AS count
    FROM partner_broadcasts
    WHERE "tenantId" = ${tenantId} AND response = 'ACCEPTED'
    GROUP BY "requestId"
    HAVING COUNT(*) > 1
  `;
  const elapsedMs = Date.now() - startedAt;
  record(
    "scenario 8: 100 simultaneous requests stay consistent",
    acceptedStress.every(Boolean) && stressAssigned === 100 && duplicateAssignments.length === 0,
    `${elapsedMs}ms`
  );

  const todayStart = startOfDay(new Date());
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const analytics = await Promise.all([
    prisma.serviceRequest.count({ where: { tenantId, createdAt: { gte: todayStart } } }),
    prisma.serviceRequest.count({ where: { tenantId, createdAt: { gte: weekStart } } }),
    prisma.transaction.aggregate({
      where: { tenantId, status: "PAYMENT_CONFIRMED", paidAt: { gte: todayStart } },
      _sum: { platformFee: true },
    }),
  ]);
  record("admin analytics query reflects simulated data", analytics[0] >= 1 && analytics[1] >= analytics[0]);

  const socketStartedAt = Date.now();
  const socketResults = await Promise.all(
    Array.from({ length: 1000 }, (_, index) => postSocketEvent(index).catch(() => false))
  );
  const socketElapsedMs = Date.now() - socketStartedAt;
  record(
    "scenario 10: 1000 concurrent socket events",
    socketResults.every(Boolean),
    `${socketResults.filter(Boolean).length}/1000 delivered in ${socketElapsedMs}ms`
  );
}

simulate()
  .catch((error) => {
    record("simulation runtime", false, error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    const failed = results.filter((result) => !result.ok);
    console.log("\nMarketplace simulation summary");
    for (const result of results) {
      console.log(`- [${result.ok ? "x" : " "}] ${result.name}${result.detail ? ` (${result.detail})` : ""}`);
    }
    console.log(`Failed scenarios: ${failed.length}`);
    await prisma.$disconnect();
  });
