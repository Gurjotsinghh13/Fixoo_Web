import prisma from "@/lib/prisma";
import { haversineDistance } from "@/lib/geo";
import { emitToPartner, emitToCustomer, emitToAdmin, emitToTenantPartners } from "@/server/emitter";
import { getTenantId } from "@/lib/tenant";
import { getActiveRequestStatuses } from "@/lib/request-lifecycle";
import { APPROVED_PARTNER_WHERE } from "@/lib/partner-approval";

const DISPATCH_RADII = [3, 5, 8, 10]; // km
const ACCEPT_TIMEOUT = 60 * 1000; // 60 seconds

/**
 * Main dispatch function - called after request is created
 * Broadcasts to nearby partners without relying on long-lived request timers.
 */
export async function dispatchRequest(requestId: string, requestTenantId?: string): Promise<void> {
  const tenantId = getTenantId(requestTenantId);
  const request = await prisma.serviceRequest.findFirst({
    where: { id: requestId, tenantId },
    include: {
      service: true,
      vehicleType: true,
      user: true,
    },
  });

  if (!request) {
    console.error("Dispatch: Request not found", requestId);
    return;
  }

  if (request.status !== "REQUESTED") return;

  const partners = await prisma.partner.findMany({
    where: {
      tenantId,
      ...APPROVED_PARTNER_WHERE,
      isOnline: true,
      location: { isNot: null },
      vehicleTypes: {
        some: { tenantId, vehicleTypeId: request.vehicleTypeId },
      },
      requests: {
        none: {
          tenantId,
          status: { in: getActiveRequestStatuses().filter((status) => status !== "REQUESTED") },
        },
      },
    },
    include: { location: true },
  });

  const partnersByDistance = partners
    .map((partner) => {
      if (!partner.location) return null;
      const distance = haversineDistance(
        request.latitude,
        request.longitude,
        partner.location.latitude,
        partner.location.longitude
      );
      return { partner, distance };
    })
    .filter((entry): entry is { partner: (typeof partners)[number]; distance: number } => Boolean(entry))
    .sort((a, b) => a.distance - b.distance);

  const selectedRadius = DISPATCH_RADII.find((radius) =>
    partnersByDistance.some((entry) => entry.distance <= radius)
  );

  if (!selectedRadius) {
    await prisma.serviceRequest.updateMany({
      where: { id: requestId, tenantId },
      data: { status: "EXPIRED" },
    });

    emitToCustomer(request.userId, "request:no_partners", {
      requestId,
      message: "No partners available right now. Please try again.",
    });
    return;
  }

  const nearbyPartners = partnersByDistance.filter((entry) => entry.distance <= selectedRadius);
  const expiresAt = new Date(Date.now() + ACCEPT_TIMEOUT);

  await prisma.serviceRequest.updateMany({
    where: { id: requestId, tenantId, status: "REQUESTED" },
    data: {
      searchRadius: selectedRadius,
      expiresAt,
    },
  });

  const broadcastPayload = {
    requestId: request.id,
    serviceName: request.service.displayName,
    vehicleType: request.vehicleType.displayName,
    area: request.area || request.address || "Kota",
    earning: Number(request.serviceFee),
    expiresAt: expiresAt.getTime(),
  };

  for (const { partner, distance } of nearbyPartners) {
    await prisma.partnerBroadcast.upsert({
      where: {
        tenantId_requestId_partnerId: {
          tenantId,
          requestId: request.id,
          partnerId: partner.id,
        },
      },
      update: { sentAt: new Date(), response: null, respondedAt: null },
      create: {
        tenantId,
        requestId: request.id,
        partnerId: partner.id,
      },
    });

    emitToPartner(partner.id, "request:broadcast", {
      ...broadcastPayload,
      distance: parseFloat(distance.toFixed(1)),
    });
  }

    emitToAdmin("admin:new_request", {
      requestId,
      partnersNotified: nearbyPartners.length,
      radius: selectedRadius,
  }, tenantId);
}

/**
 * Atomically accept a request - prevents race conditions.
 */
export async function acceptRequest(
  requestId: string,
  partnerId: string,
  requestTenantId?: string
): Promise<boolean> {
  const tenantId = getTenantId(requestTenantId);
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const partner = await tx.partner.findFirst({
          where: {
            id: partnerId,
            tenantId,
            ...APPROVED_PARTNER_WHERE,
            isOnline: true,
          },
          select: { id: true },
        });
        if (!partner) throw new Error("Partner not eligible");

        const activeJob = await tx.serviceRequest.findFirst({
          where: {
            tenantId,
            partnerId,
            status: {
              in: getActiveRequestStatuses().filter((status) => status !== "REQUESTED"),
            },
          },
          select: { id: true },
        });
        if (activeJob) throw new Error("Partner is busy");

        const broadcast = await tx.partnerBroadcast.findFirst({
          where: { tenantId, requestId, partnerId, response: null },
          select: { id: true },
        });
        if (!broadcast) throw new Error("Request not available to partner");

        const acceptedAt = new Date();
        const accepted = await tx.serviceRequest.updateMany({
          where: {
            id: requestId,
            tenantId,
            status: "REQUESTED",
            partnerId: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: acceptedAt } }],
          },
          data: { status: "ACCEPTED", partnerId, acceptedAt },
        });
        if (accepted.count !== 1) throw new Error("Request already taken or expired");

        await tx.requestStatusHistory.create({
          data: {
            tenantId,
            requestId,
            fromStatus: "REQUESTED",
            toStatus: "ACCEPTED",
            actorRole: "partner",
            actorId: partnerId,
          },
        });
        await tx.partnerBroadcast.updateMany({
          where: { tenantId, requestId, partnerId, response: null },
          data: { response: "ACCEPTED", respondedAt: acceptedAt },
        });
        await tx.partnerBroadcast.updateMany({
          where: { tenantId, requestId, partnerId: { not: partnerId }, response: null },
          data: { response: "REJECTED", respondedAt: acceptedAt },
        });
        await tx.partner.updateMany({
          where: { id: partnerId, tenantId },
          data: { totalJobs: { increment: 1 } },
        });
        await tx.partnerActivity.create({
          data: {
            tenantId,
            partnerId,
            type: "ACCEPTED_REQUEST",
            note: "Request accepted",
            metadata: { requestId },
          },
        });

        return tx.serviceRequest.findFirstOrThrow({
          where: { id: requestId, tenantId },
          include: {
            partner: {
              select: {
                id: true,
                name: true,
                shopName: true,
                phone: true,
                rating: true,
                totalJobs: true,
              },
            },
            service: true,
            vehicleType: true,
          },
        });
      },
      { isolationLevel: "Serializable", maxWait: 30_000, timeout: 30_000 }
    );

    // Notify customer
    emitToCustomer(result.userId, "request:accepted", {
      requestId,
      partnerName: result.partner!.name,
      shopName: result.partner!.shopName,
      partnerPhone: result.partner!.phone,
      rating: result.partner!.rating,
      eta: `${result.service?.displayName}`,
    });

    // Dismiss from all other partners
    emitToTenantPartners(tenantId, "request:taken", { requestId });

    return true;
  } catch {
    return false;
  }
}
