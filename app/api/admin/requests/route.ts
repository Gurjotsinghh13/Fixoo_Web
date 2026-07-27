import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/authorization";
import { expireOverdueRequestsForTenant } from "@/lib/request-lifecycle";
import type { RequestStatus } from "@/types";

const ACTIVE_STATUSES: RequestStatus[] = [
  "REQUESTED",
  "ACCEPTED",
  "ON_THE_WAY",
  "ARRIVED",
  "REPAIR_IN_PROGRESS",
];

function parseDate(value: string | null, endOfDay = false) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  else date.setHours(0, 0, 0, 0);
  return date;
}

export async function GET(req: NextRequest) {
  try {
    const authz = await requireAdmin(req);
    if (!authz.ok) return authz.response;
    const { tenantId } = authz;

    await expireOverdueRequestsForTenant(tenantId);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "all";
    const from = parseDate(searchParams.get("from"));
    const to = parseDate(searchParams.get("to"), true);

    const where: Record<string, unknown> = { tenantId };
    if (status === "active") where.status = { in: ACTIVE_STATUSES };
    else if (status === "failed") {
      where.OR = [
        { status: "EXPIRED" },
        { noShowType: { not: null } },
      ];
    }
    else if (status !== "all") where.status = status;

    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }

    const [requests, statusCounts] = await Promise.all([
      prisma.serviceRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          user: { select: { id: true, name: true, phone: true } },
          partner: { select: { id: true, name: true, shopName: true, phone: true } },
          service: { select: { displayName: true } },
          vehicleType: { select: { displayName: true } },
          transaction: {
            select: {
              id: true,
              status: true,
              totalAmount: true,
              platformFee: true,
              partnerEarning: true,
              paidAt: true,
            },
          },
          _count: { select: { broadcasts: true } },
        },
      }),
      prisma.serviceRequest.groupBy({
        by: ["status"],
        where: { tenantId },
        _count: { _all: true },
      }),
    ]);

    const counts = statusCounts.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row._count._all;
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      data: {
        counts: {
          all: Object.values(counts).reduce((sum, count) => sum + count, 0),
          active: ACTIVE_STATUSES.reduce((sum, key) => sum + (counts[key] || 0), 0),
          completed: counts.COMPLETED || 0,
          cancelled: counts.CANCELLED || 0,
          expired: counts.EXPIRED || 0,
          byStatus: counts,
        },
        requests: requests.map((request) => ({
          id: request.id,
          status: request.status,
          customer: request.user,
          partner: request.partner,
          service: request.service.displayName,
          vehicleType: request.vehicleType.displayName,
          area: request.area,
          address: request.address,
          totalAmount: Number(request.totalAmount),
          serviceFee: Number(request.serviceFee),
          platformFee: Number(request.platformFee),
          broadcastsSent: request._count.broadcasts,
          transaction: request.transaction
            ? {
                ...request.transaction,
                totalAmount: Number(request.transaction.totalAmount),
                platformFee: Number(request.transaction.platformFee),
                partnerEarning: Number(request.transaction.partnerEarning),
                paidAt: request.transaction.paidAt?.toISOString(),
              }
            : null,
          createdAt: request.createdAt.toISOString(),
          acceptedAt: request.acceptedAt?.toISOString(),
          completedAt: request.completedAt?.toISOString(),
          cancelledAt: request.cancelledAt?.toISOString(),
          cancelReason: request.cancelReason,
          noShowType: request.noShowType,
          noShowReason: request.noShowReason,
          noShowAt: request.noShowAt?.toISOString(),
          expiresAt: request.expiresAt?.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error("Admin requests GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch requests" }, { status: 500 });
  }
}
