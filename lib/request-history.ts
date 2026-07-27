import prisma from "@/lib/prisma";

type HistoryInput = {
  tenantId: string;
  requestId: string;
  fromStatus?: string | null;
  toStatus: string;
  actorRole: "customer" | "partner" | "admin" | "system";
  actorId?: string | null;
  adminId?: string | null;
  reason?: string | null;
};

export function recordRequestHistory(input: HistoryInput) {
  return prisma.requestStatusHistory
    .create({
      data: {
        tenantId: input.tenantId,
        requestId: input.requestId,
        fromStatus: input.fromStatus || null,
        toStatus: input.toStatus,
        actorRole: input.actorRole,
        actorId: input.actorId || null,
        adminId: input.adminId || null,
        reason: input.reason || null,
      },
    })
    .catch((error) => {
      console.error("Request history write failed:", error);
    });
}
