import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePartner } from "@/lib/authorization";
import {
  addIndiaDays,
  indiaDateKey,
  startOfIndiaDay,
  startOfIndiaMonth,
  startOfIndiaWeek,
} from "@/lib/india-time";
import { ACCRUED_TRANSACTION_STATUSES } from "@/lib/financial";

export async function GET(req: NextRequest) {
  try {
    const authz = await requirePartner(req, { approved: true });
    if (!authz.ok) return authz.response;
    const { tenantId, user } = authz;

    const now = new Date();
    const todayStart = startOfIndiaDay(now);
    const weekStart = startOfIndiaWeek(now);
    const monthStart = startOfIndiaMonth(now);
    const sevenDaysStart = addIndiaDays(todayStart, -6);
    const reportingStart = new Date(
      Math.min(weekStart.getTime(), monthStart.getTime(), sevenDaysStart.getTime())
    );

    const reportingTxns = await prisma.transaction.findMany({
      where: {
        tenantId,
        partnerId: user.id,
        status: { in: [...ACCRUED_TRANSACTION_STATUSES] },
        request: {
          status: "COMPLETED",
          completedAt: { gte: reportingStart },
        },
      },
      select: {
        partnerEarning: true,
        requestId: true,
        request: { select: { completedAt: true } },
      },
    });

    const allJobs = await prisma.serviceRequest.findMany({
      where: { tenantId, partnerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { service: true, vehicleType: true, transaction: true },
    });

    const completedJobs = await prisma.serviceRequest.findMany({
      where: {
        tenantId,
        partnerId: user.id,
        status: "COMPLETED",
        completedAt: { gte: reportingStart },
      },
      select: { id: true, completedAt: true },
    });

    const partner = await prisma.partner.findFirst({
      where: { id: user.id, tenantId },
      select: { totalJobs: true, completedJobs: true, acceptanceRate: true, rating: true },
    });

    const [broadcasts, feedbackCount, completedJobsAllTime] = await prisma.$transaction([
      prisma.partnerBroadcast.findMany({
        where: { tenantId, partnerId: user.id },
        select: { sentAt: true, response: true, respondedAt: true },
      }),
      prisma.customerFeedback.count({ where: { tenantId, partnerId: user.id } }),
      prisma.serviceRequest.count({
        where: { tenantId, partnerId: user.id, status: "COMPLETED" },
      }),
    ]);

    const completedAt = (transaction: (typeof reportingTxns)[number]) =>
      transaction.request.completedAt!;
    const todayTxns = reportingTxns.filter((transaction) => completedAt(transaction) >= todayStart);
    const weekTxns = reportingTxns.filter((transaction) => completedAt(transaction) >= weekStart);
    const monthTxns = reportingTxns.filter((transaction) => completedAt(transaction) >= monthStart);
    const todayJobs = completedJobs.filter((job) => job.completedAt! >= todayStart);
    const todayEarnings = todayTxns.reduce((s, t) => s + Number(t.partnerEarning), 0);
    const weekEarnings = weekTxns.reduce((s, t) => s + Number(t.partnerEarning), 0);
    const monthEarnings = monthTxns.reduce((s, t) => s + Number(t.partnerEarning), 0);
    const responded = broadcasts.filter((broadcast) => broadcast.respondedAt);
    const accepted = broadcasts.filter((broadcast) => broadcast.response === "ACCEPTED").length;
    const responseTimes = responded
      .map((broadcast) =>
        broadcast.respondedAt
          ? Math.round((broadcast.respondedAt.getTime() - broadcast.sentAt.getTime()) / 1000)
          : null
      )
      .filter((value): value is number => value !== null && value >= 0);
    const averageResponseTime =
      responseTimes.length > 0
        ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length)
        : null;
    const acceptanceRate =
      broadcasts.length > 0 ? Math.round((accepted / broadcasts.length) * 100) : partner?.acceptanceRate || 0;

    // Daily breakdown for chart (last 7 days)
    const dailyBreakdown = Array.from({ length: 7 }, (_, i) => {
      const dayStart = addIndiaDays(sevenDaysStart, i);
      const dayEnd = addIndiaDays(dayStart, 1);

      const dayTxns = reportingTxns.filter(
        (transaction) =>
          completedAt(transaction) >= dayStart && completedAt(transaction) < dayEnd
      );
      const dayJobs = completedJobs.filter(
        (job) => job.completedAt! >= dayStart && job.completedAt! < dayEnd
      );

      return {
        date: indiaDateKey(dayStart),
        earnings: dayTxns.reduce((s, t) => s + Number(t.partnerEarning), 0),
        jobs: dayJobs.length,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        earnings: {
          today: todayEarnings,
          thisWeek: weekEarnings,
          thisMonth: monthEarnings,
        },
        stats: {
          totalJobs: partner?.totalJobs || 0,
          completedJobs: completedJobsAllTime,
          jobsToday: todayJobs.length,
          acceptanceRate,
          averageResponseTimeSeconds: averageResponseTime,
          rating: partner?.rating || 0,
          ratingCount: feedbackCount,
        },
        dailyBreakdown,
        recentJobs: allJobs.map((j) => ({
          id: j.id,
          status: j.status,
          service: j.service.displayName,
          vehicleType: j.vehicleType.displayName,
          earning: j.transaction
            ? Number(j.transaction.partnerEarning)
            : Number(j.totalAmount) - Number(j.platformFee),
          area: j.area,
          createdAt: j.createdAt.toISOString(),
          completedAt: j.completedAt?.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error("Earnings error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch earnings" },
      { status: 500 }
    );
  }
}
