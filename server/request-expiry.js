const DEFAULT_BATCH_SIZE = 100;
const EXPIRY_REASON = "Request expired before partner acceptance";

/**
 * Atomically expires overdue requests.
 *
 * The status update is the claim: only the process that changes REQUESTED to
 * EXPIRED writes the related broadcasts, history, and notification records.
 */
async function expireOverdueRequests({
  prisma,
  now = new Date(),
  batchSize = DEFAULT_BATCH_SIZE,
  tenantId,
  userId,
  onExpired,
}) {
  const candidates = await prisma.serviceRequest.findMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      ...(userId ? { userId } : {}),
      status: "REQUESTED",
      expiresAt: { lt: now },
    },
    select: {
      id: true,
      tenantId: true,
      userId: true,
      expiresAt: true,
    },
    orderBy: { expiresAt: "asc" },
    take: batchSize,
  });

  const expiredRequests = [];

  for (const candidate of candidates) {
    const expired = await prisma.$transaction(async (tx) => {
      const claimed = await tx.serviceRequest.updateMany({
        where: {
          id: candidate.id,
          tenantId: candidate.tenantId,
          status: "REQUESTED",
          expiresAt: { lt: now },
        },
        data: { status: "EXPIRED" },
      });

      if (claimed.count !== 1) return null;

      await tx.partnerBroadcast.updateMany({
        where: {
          tenantId: candidate.tenantId,
          requestId: candidate.id,
          response: null,
        },
        data: {
          response: "TIMEOUT",
          respondedAt: now,
        },
      });

      await tx.requestStatusHistory.create({
        data: {
          tenantId: candidate.tenantId,
          requestId: candidate.id,
          fromStatus: "REQUESTED",
          toStatus: "EXPIRED",
          actorRole: "system",
          reason: EXPIRY_REASON,
        },
      });

      await tx.notification.create({
        data: {
          tenantId: candidate.tenantId,
          userId: candidate.userId,
          requestId: candidate.id,
          type: "REQUEST_EXPIRED",
          title: "Request expired",
          body: "No partner accepted your request in time. Please try again.",
        },
      });

      return candidate;
    });

    if (!expired) continue;
    expiredRequests.push(expired);

    if (onExpired) {
      try {
        await onExpired(expired);
      } catch (error) {
        console.error(`Expiry event delivery failed for ${expired.id}:`, error);
      }
    }
  }

  return {
    scanned: candidates.length,
    expired: expiredRequests.length,
    requests: expiredRequests,
  };
}

module.exports = {
  DEFAULT_BATCH_SIZE,
  EXPIRY_REASON,
  expireOverdueRequests,
};
