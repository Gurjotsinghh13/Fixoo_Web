import prisma from "../lib/prisma";
import { startOfIndiaDay, startOfIndiaMonth, startOfIndiaWeek } from "../lib/india-time";
import { ACCRUED_TRANSACTION_STATUSES } from "../lib/financial";

async function main() {
  const tenantId = "default";
  const now = new Date();
  const todayStart = startOfIndiaDay(now);
  const weekStart = startOfIndiaWeek(now);
  const monthStart = startOfIndiaMonth(now);
  const statuses = [
    "REQUESTED",
    "ACCEPTED",
    "ON_THE_WAY",
    "ARRIVED",
    "REPAIR_IN_PROGRESS",
    "COMPLETED",
  ] as const;

  const counts = Object.fromEntries(
    await Promise.all(
      statuses.map(async (status) => [
        status,
        await prisma.serviceRequest.count({ where: { tenantId, status } }),
      ])
    )
  );

  const completed = await prisma.serviceRequest.findMany({
    where: { tenantId, status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    take: 20,
    select: {
      id: true,
      status: true,
      partnerId: true,
      completedAt: true,
      transaction: {
        select: {
          id: true,
          status: true,
          totalAmount: true,
          partnerEarning: true,
          platformFee: true,
          paymentMethod: true,
          paidAt: true,
        },
      },
    },
  });

  const allCompletedTransactions = await prisma.transaction.findMany({
    where: { tenantId, request: { status: "COMPLETED" } },
    select: {
      id: true,
      requestId: true,
      partnerId: true,
      status: true,
      totalAmount: true,
      partnerEarning: true,
      platformFee: true,
      paymentMethod: true,
      paidAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const summarize = (since: Date) => {
    const rows = allCompletedTransactions.filter((item) => item.createdAt >= since);
    return {
      transactionCount: rows.length,
      gross: rows.reduce((sum, item) => sum + Number(item.totalAmount), 0),
      partnerEarnings: rows.reduce((sum, item) => sum + Number(item.partnerEarning), 0),
      platformFees: rows.reduce((sum, item) => sum + Number(item.platformFee), 0),
      byStatus: rows.reduce<Record<string, number>>((result, item) => {
        result[item.status] = (result[item.status] || 0) + 1;
        return result;
      }, {}),
    };
  };

  const partnerToday = await prisma.serviceRequest.groupBy({
    by: ["partnerId"],
    where: {
      tenantId,
      status: "COMPLETED",
      partnerId: { not: null },
      completedAt: { gte: todayStart },
    },
    _count: { _all: true },
  });

  const [completedByPartner, earningsByPartner] = await Promise.all([
    prisma.serviceRequest.groupBy({
      by: ["partnerId"],
      where: { tenantId, status: "COMPLETED", partnerId: { not: null } },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ["partnerId"],
      where: { tenantId, status: { in: [...ACCRUED_TRANSACTION_STATUSES] } },
      _sum: { partnerEarning: true },
    }),
  ]);
  const partnerIds = completedByPartner.flatMap((row) => row.partnerId ? [row.partnerId] : []);
  const partners = await prisma.partner.findMany({
    where: { tenantId, id: { in: partnerIds } },
    select: { id: true, phone: true, completedJobs: true },
  });
  const completedMap = new Map(completedByPartner.map((row) => [row.partnerId, row._count._all]));
  const earningsMap = new Map(
    earningsByPartner.map((row) => [row.partnerId, Number(row._sum.partnerEarning || 0)])
  );

  console.log(JSON.stringify({
    generatedAt: now.toISOString(),
    indiaBoundaries: {
      todayStart: todayStart.toISOString(),
      weekStart: weekStart.toISOString(),
      monthStart: monthStart.toISOString(),
    },
    requestCounts: counts,
    completedRequests: completed.map((request) => ({
      requestId: request.id,
      status: request.status,
      partnerId: request.partnerId,
      completedAt: request.completedAt?.toISOString() || null,
      transaction: request.transaction
        ? {
            transactionId: request.transaction.id,
            status: request.transaction.status,
            amount: Number(request.transaction.totalAmount),
            partnerEarning: Number(request.transaction.partnerEarning),
            platformFee: Number(request.transaction.platformFee),
            paymentMethod: request.transaction.paymentMethod,
            paidAt: request.transaction.paidAt?.toISOString() || null,
          }
        : null,
    })),
    today: summarize(todayStart),
    week: summarize(weekStart),
    month: summarize(monthStart),
    completedJobsTodayByPartner: partnerToday.map((row) => ({
      partnerId: row.partnerId,
      jobs: row._count._all,
    })),
    partnerTotals: partners.map((partner) => ({
      partnerId: partner.id,
      phone: partner.phone,
      storedCompletedJobs: partner.completedJobs,
      actualCompletedRequests: completedMap.get(partner.id) || 0,
      accruedEarnings: earningsMap.get(partner.id) || 0,
    })),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
