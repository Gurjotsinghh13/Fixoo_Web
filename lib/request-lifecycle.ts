import prisma from "@/lib/prisma";
import { emitToAdmin, emitToCustomer, emitToTenantPartners } from "@/server/emitter";
import { expireOverdueRequests } from "@/server/request-expiry";

const ACTIVE_REQUEST_STATUSES = [
  "REQUESTED",
  "ACCEPTED",
  "ON_THE_WAY",
  "ARRIVED",
  "REPAIR_IN_PROGRESS",
] as const;

export function getActiveRequestStatuses() {
  return [...ACTIVE_REQUEST_STATUSES];
}

export async function expireOverdueRequestsForTenant(tenantId: string, userId?: string) {
  const result = await expireOverdueRequests({
    prisma,
    tenantId,
    userId,
    onExpired: async (request) => {
      const payload = {
        requestId: request.id,
        status: "EXPIRED",
        timestamp: new Date().toISOString(),
      };
      emitToCustomer(request.userId, "request:expired", payload);
      emitToTenantPartners(request.tenantId, "request:expired", payload);
      emitToAdmin("admin:request_status", payload, request.tenantId);
    },
  });

  return result.expired;
}
