import type { PrismaClient } from "@prisma/client";

export type ExpiredRequest = {
  id: string;
  tenantId: string;
  userId: string;
  expiresAt: Date | null;
};

export type ExpiryResult = {
  scanned: number;
  expired: number;
  requests: ExpiredRequest[];
};

export const DEFAULT_BATCH_SIZE: number;
export const EXPIRY_REASON: string;

export function expireOverdueRequests(options: {
  prisma: PrismaClient;
  now?: Date;
  batchSize?: number;
  tenantId?: string;
  userId?: string;
  onExpired?: (request: ExpiredRequest) => void | Promise<void>;
}): Promise<ExpiryResult>;
