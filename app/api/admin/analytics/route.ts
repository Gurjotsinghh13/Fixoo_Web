import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/authorization";
import { expireOverdueRequestsForTenant } from "@/lib/request-lifecycle";
import { startOfIndiaDay, startOfIndiaMonth, startOfIndiaWeek } from "@/lib/india-time";
import { ACCRUED_TRANSACTION_STATUSES } from "@/lib/financial";

export async function GET(req: NextRequest) {
  try {
    const authz = await requireAdmin(req);
    if (!authz.ok) return authz.response;
    const { tenantId } = authz;

    await expireOverdueRequestsForTenant(tenantId);

    const now = new Date();
    const todayStart = startOfIndiaDay(now);
    const weekStart = startOfIndiaWeek(now);
    const monthStart = startOfIndiaMonth(now);

    const [
      requestsToday,
      requestsWeek,
      completedToday,
      cancelledToday,
      expiredToday,
      activePartners,
      totalPartners,
      pendingPartners,
      approvedPartners,
      rejectedPartners,
      suspendedPartners,
      revenueToday,
      revenueWeek,
      revenueMonth,
      activeRequests,
      failedRequests,
      partnerNoShows,
      customerNoShows,
      pendingPayments,
      recentActivity,
      recentRequests,
      recentFeedback,
    ] = await prisma.$transaction([
      prisma.serviceRequest.count({ where: { tenantId, createdAt: { gte: todayStart } } }),
      prisma.serviceRequest.count({ where: { tenantId, createdAt: { gte: weekStart } } }),
      prisma.serviceRequest.count({ where: { tenantId, status: "COMPLETED", completedAt: { gte: todayStart } } }),
      prisma.serviceRequest.count({ where: { tenantId, status: "CANCELLED", cancelledAt: { gte: todayStart } } }),
      prisma.serviceRequest.count({ where: { tenantId, status: "EXPIRED", createdAt: { gte: todayStart } } }),
      prisma.partner.count({
        where: {
          tenantId,
          applicationStatus: "APPROVED",
          isOnline: true,
          isApproved: true,
          isSuspended: false,
        },
      }),
      prisma.partner.count({
        where: {
          tenantId,
          applicationStatus: "APPROVED",
          isApproved: true,
          isSuspended: false,
        },
      }),
      prisma.partner.count({ where: { tenantId, applicationStatus: "PENDING" } }),
      prisma.partner.count({ where: { tenantId, applicationStatus: "APPROVED" } }),
      prisma.partner.count({ where: { tenantId, applicationStatus: "REJECTED" } }),
      prisma.partner.count({ where: { tenantId, applicationStatus: "SUSPENDED" } }),
      prisma.transaction.aggregate({
        where: {
          tenantId,
          status: { in: [...ACCRUED_TRANSACTION_STATUSES] },
          request: { status: "COMPLETED", completedAt: { gte: todayStart } },
        },
        _sum: { platformFee: true },
      }),
      prisma.transaction.aggregate({
        where: {
          tenantId,
          status: { in: [...ACCRUED_TRANSACTION_STATUSES] },
          request: { status: "COMPLETED", completedAt: { gte: weekStart } },
        },
        _sum: { platformFee: true },
      }),
      prisma.transaction.aggregate({
        where: {
          tenantId,
          status: { in: [...ACCRUED_TRANSACTION_STATUSES] },
          request: { status: "COMPLETED", completedAt: { gte: monthStart } },
        },
        _sum: { platformFee: true },
      }),
      prisma.serviceRequest.count({
        where: {
          tenantId,
          status: { in: ["REQUESTED", "ACCEPTED", "ON_THE_WAY", "ARRIVED", "REPAIR_IN_PROGRESS"] },
        },
      }),
      prisma.serviceRequest.count({
        where: {
          tenantId,
          OR: [
            { status: "EXPIRED" },
            { noShowType: { not: null } },
            { supportStatus: { not: null } },
          ],
        },
      }),
      prisma.serviceRequest.count({ where: { tenantId, noShowType: "PARTNER" } }),
      prisma.serviceRequest.count({ where: { tenantId, noShowType: "CUSTOMER" } }),
      prisma.transaction.count({
        where: { tenantId, status: { in: ["PENDING_PAYMENT", "COMPLETED"] } },
      }),
      prisma.activityLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.serviceRequest.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          user: { select: { phone: true, name: true } },
          partner: { select: { name: true, shopName: true } },
          service: true,
          vehicleType: true,
        },
      }),
      prisma.customerFeedback.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          request: {
            include: {
              service: { select: { displayName: true } },
              vehicleType: { select: { displayName: true } },
            },
          },
          partner: { select: { name: true, shopName: true } },
          user: { select: { phone: true, name: true } },
        },
      }),
    ]);

    const completionRate =
      requestsToday > 0 ? Math.round((completedToday / requestsToday) * 100) : 0;

    return NextResponse.json({
      success: true,
      data: {
        requests: {
          today: requestsToday,
          thisWeek: requestsWeek,
          completedToday,
          cancelledToday,
          expiredToday,
          completionRate,
          active: activeRequests,
          failed: failedRequests,
          partnerNoShows,
          customerNoShows,
        },
        partners: {
          active: activePartners,
          total: totalPartners,
          pending: pendingPartners,
          approved: approvedPartners,
          rejected: rejectedPartners,
          suspended: suspendedPartners,
        },
        revenue: {
          today: Number(revenueToday._sum.platformFee || 0),
          thisWeek: Number(revenueWeek._sum.platformFee || 0),
          thisMonth: Number(revenueMonth._sum.platformFee || 0),
          pendingPayments,
        },
        recentActivity: recentActivity.map((item) => ({
          id: item.id,
          action: item.action,
          entity: item.entity,
          entityId: item.entityId,
          createdAt: item.createdAt.toISOString(),
        })),
        recentRequests: recentRequests.map((r) => ({
          id: r.id,
          status: r.status,
          service: r.service.displayName,
          vehicleType: r.vehicleType.displayName,
          customerPhone: r.user.phone,
          partnerName: r.partner?.name,
          totalAmount: Number(r.totalAmount),
          area: r.area,
          createdAt: r.createdAt.toISOString(),
        })),
        recentFeedback: recentFeedback.map((item) => ({
          id: item.id,
          requestId: item.requestId,
          rating: item.rating,
          comment: item.comment,
          customerPhone: item.user.phone,
          partnerName: item.partner?.name,
          service: item.request.service.displayName,
          vehicleType: item.request.vehicleType.displayName,
          createdAt: item.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error("Admin analytics error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
