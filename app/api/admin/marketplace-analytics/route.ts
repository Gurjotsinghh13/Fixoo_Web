import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/authorization";
import { expireOverdueRequestsForTenant } from "@/lib/request-lifecycle";
import { subDays, subMonths, subWeeks } from "date-fns";
import { ACCRUED_TRANSACTION_STATUSES } from "@/lib/financial";
import {
  addIndiaDays,
  indiaDateKey,
  indiaMonthKey,
  startOfIndiaDay,
  startOfIndiaMonth,
  startOfIndiaWeek,
} from "@/lib/india-time";

const FUNNEL_STATUSES = ["REQUESTED", "ACCEPTED", "ARRIVED", "COMPLETED", "CANCELLED"] as const;

function secondsBetween(start?: Date | null, end?: Date | null) {
  if (!start || !end) return null;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
}

function average(values: Array<number | null>) {
  const valid = values.filter((value): value is number => typeof value === "number");
  if (!valid.length) return null;
  return Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}

function pincodeFrom(address?: string | null) {
  return address?.match(/\b\d{6}\b/)?.[0] || "Unknown";
}

function localityFrom(area?: string | null, address?: string | null) {
  return area || address?.split(",")[0]?.trim() || "Unknown";
}

function increment(map: Map<string, number>, key: string, by = 1) {
  map.set(key, (map.get(key) || 0) + by);
}

export async function GET(req: NextRequest) {
  try {
    const authz = await requireAdmin(req);
    if (!authz.ok) return authz.response;
    const { tenantId } = authz;

    await expireOverdueRequestsForTenant(tenantId);

    const now = new Date();
    const dailyStart = startOfIndiaDay(subDays(now, 13));
    const weeklyStart = startOfIndiaWeek(subWeeks(now, 7));
    const monthlyStart = startOfIndiaMonth(subMonths(now, 5));

    const [requests, transactions, partners, broadcasts] = await prisma.$transaction([
      prisma.serviceRequest.findMany({
        where: { tenantId, createdAt: { gte: monthlyStart } },
        include: {
          partner: { select: { id: true, name: true, shopName: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.transaction.findMany({
        where: {
          tenantId,
          status: { in: [...ACCRUED_TRANSACTION_STATUSES] },
          request: { status: "COMPLETED", completedAt: { gte: monthlyStart } },
        },
        include: { request: { select: { completedAt: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.partner.findMany({
        where: { tenantId, isApproved: true },
        select: { id: true, name: true, shopName: true },
      }),
      prisma.partnerBroadcast.findMany({
        where: { tenantId, sentAt: { gte: monthlyStart } },
        select: { partnerId: true, response: true, sentAt: true, respondedAt: true },
      }),
    ]);

    const dailyRequests = Array.from({ length: 14 }, (_, index) => {
      const date = addIndiaDays(dailyStart, index);
      const key = indiaDateKey(date);
      return { date: key, requests: 0, completed: 0, cancelled: 0 };
    });
    const dailyByKey = new Map(dailyRequests.map((item) => [item.date, item]));

    const weeklyRequests = Array.from({ length: 8 }, (_, index) => {
      const date = addIndiaDays(weeklyStart, index * 7);
      const key = indiaDateKey(date);
      return { week: key, requests: 0, completed: 0, cancelled: 0 };
    });
    const weeklyByKey = new Map(weeklyRequests.map((item) => [item.week, item]));

    const funnelCounts = new Map<string, number>();
    const areaCounts = new Map<string, number>();
    const localityCounts = new Map<string, number>();
    const pincodeCounts = new Map<string, number>();

    for (const request of requests) {
      const dailyKey = indiaDateKey(request.createdAt);
      const weekKey = indiaDateKey(startOfIndiaWeek(request.createdAt));

      if (request.createdAt >= dailyStart) {
        const daily = dailyByKey.get(dailyKey);
        if (daily) {
          daily.requests += 1;
          if (request.status === "COMPLETED") daily.completed += 1;
          if (request.status === "CANCELLED") daily.cancelled += 1;
        }
      }

      if (request.createdAt >= weeklyStart) {
        const weekly = weeklyByKey.get(weekKey);
        if (weekly) {
          weekly.requests += 1;
          if (request.status === "COMPLETED") weekly.completed += 1;
          if (request.status === "CANCELLED") weekly.cancelled += 1;
        }
      }

      if (FUNNEL_STATUSES.includes(request.status as (typeof FUNNEL_STATUSES)[number])) {
        increment(funnelCounts, request.status);
      }

      increment(areaCounts, request.area || "Unknown");
      increment(localityCounts, localityFrom(request.area, request.address));
      increment(pincodeCounts, pincodeFrom(request.address));
    }

    const dailyRevenue = Array.from({ length: 14 }, (_, index) => {
      const date = addIndiaDays(dailyStart, index);
      return { date: indiaDateKey(date), gross: 0, platformFees: 0, partnerEarnings: 0 };
    });
    const dailyRevenueByKey = new Map(dailyRevenue.map((item) => [item.date, item]));

    const weeklyRevenue = Array.from({ length: 8 }, (_, index) => {
      const date = addIndiaDays(weeklyStart, index * 7);
      return { week: indiaDateKey(date), gross: 0, platformFees: 0, partnerEarnings: 0 };
    });
    const weeklyRevenueByKey = new Map(weeklyRevenue.map((item) => [item.week, item]));

    const monthlyRevenue = Array.from({ length: 6 }, (_, index) => {
      const date = startOfIndiaMonth(subMonths(now, 5 - index));
      return { month: indiaMonthKey(date), gross: 0, platformFees: 0, partnerEarnings: 0 };
    });
    const monthlyRevenueByKey = new Map(monthlyRevenue.map((item) => [item.month, item]));

    for (const transaction of transactions) {
      const gross = Number(transaction.totalAmount);
      const platformFees = Number(transaction.platformFee);
      const partnerEarnings = Number(transaction.partnerEarning);
      const recognizedAt = transaction.request.completedAt || transaction.createdAt;
      const dailyKey = indiaDateKey(recognizedAt);
      const weekKey = indiaDateKey(startOfIndiaWeek(recognizedAt));
      const monthKey = indiaMonthKey(recognizedAt);

      const day = dailyRevenueByKey.get(dailyKey);
      if (day) {
        day.gross += gross;
        day.platformFees += platformFees;
        day.partnerEarnings += partnerEarnings;
      }

      const week = weeklyRevenueByKey.get(weekKey);
      if (week) {
        week.gross += gross;
        week.platformFees += platformFees;
        week.partnerEarnings += partnerEarnings;
      }

      const month = monthlyRevenueByKey.get(monthKey);
      if (month) {
        month.gross += gross;
        month.platformFees += platformFees;
        month.partnerEarnings += partnerEarnings;
      }
    }

    const broadcastsByPartner = new Map<string, { received: number; accepted: number; totalResponseMs: number }>();
    for (const broadcast of broadcasts) {
      const current = broadcastsByPartner.get(broadcast.partnerId) || {
        received: 0,
        accepted: 0,
        totalResponseMs: 0,
      };
      current.received += 1;
      if (broadcast.response === "ACCEPTED") {
        current.accepted += 1;
        current.totalResponseMs += Math.max(
          0,
          (broadcast.respondedAt?.getTime() || broadcast.sentAt.getTime()) - broadcast.sentAt.getTime()
        );
      }
      broadcastsByPartner.set(broadcast.partnerId, current);
    }

    const requestsByPartner = new Map<string, { completed: number }>();
    for (const request of requests) {
      if (!request.partnerId) continue;
      const current = requestsByPartner.get(request.partnerId) || { completed: 0 };
      if (request.status === "COMPLETED") current.completed += 1;
      requestsByPartner.set(request.partnerId, current);
    }

    const earningsByPartner = new Map<string, number>();
    for (const transaction of transactions) {
      increment(earningsByPartner, transaction.partnerId, Number(transaction.partnerEarning));
    }

    const topPartners = partners
      .map((partner) => {
        const broadcastStats = broadcastsByPartner.get(partner.id);
        const accepted = broadcastStats?.accepted || 0;
        const received = broadcastStats?.received || 0;
        return {
          id: partner.id,
          name: partner.name,
          shopName: partner.shopName,
          jobsCompleted: requestsByPartner.get(partner.id)?.completed || 0,
          acceptanceRate: received ? Math.round((accepted / received) * 100) : 0,
          responseTimeSeconds: accepted
            ? Math.round((broadcastStats!.totalResponseMs / accepted) / 1000)
            : null,
          earnings: earningsByPartner.get(partner.id) || 0,
        };
      })
      .sort((a, b) => b.jobsCompleted - a.jobsCompleted || b.earnings - a.earnings)
      .slice(0, 10);

    const failedReasons = {
      expired: requests.filter((request) => request.status === "EXPIRED").length,
      partnerNoShow: requests.filter((request) => request.noShowType === "PARTNER").length,
      customerNoShow: requests.filter((request) => request.noShowType === "CUSTOMER").length,
      cancelled: requests.filter((request) => request.status === "CANCELLED" && !request.noShowType).length,
    };

    return NextResponse.json({
      success: true,
      data: {
        requestCharts: {
          daily: dailyRequests,
          weekly: weeklyRequests,
          funnel: FUNNEL_STATUSES.map((status) => ({
            status,
            count: funnelCounts.get(status) || 0,
          })),
        },
        timings: {
          avgAcceptanceTimeSeconds: average(
            requests.map((request) => secondsBetween(request.createdAt, request.acceptedAt))
          ),
          avgArrivalTimeSeconds: average(
            requests.map((request) => secondsBetween(request.acceptedAt, request.arrivedAt))
          ),
          avgCompletionTimeSeconds: average(
            requests.map((request) => secondsBetween(request.createdAt, request.completedAt))
          ),
        },
        topPartners,
        demand: {
          byArea: Array.from(areaCounts.entries())
            .map(([area, count]) => ({ area, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 20),
          byLocality: Array.from(localityCounts.entries())
            .map(([locality, count]) => ({ locality, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 20),
          byPincode: Array.from(pincodeCounts.entries())
            .map(([pincode, count]) => ({ pincode, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 20),
        },
        revenue: {
          grossTransactionValue: transactions.reduce((sum, txn) => sum + Number(txn.totalAmount), 0),
          platformFees: transactions.reduce((sum, txn) => sum + Number(txn.platformFee), 0),
          partnerEarnings: transactions.reduce((sum, txn) => sum + Number(txn.partnerEarning), 0),
          daily: dailyRevenue,
          weekly: weeklyRevenue,
          monthly: monthlyRevenue,
        },
        failedRequests: failedReasons,
      },
    });
  } catch (error) {
    console.error("Marketplace analytics error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch marketplace analytics" }, { status: 500 });
  }
}
