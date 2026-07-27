import { NextRequest } from "next/server";
import prisma from "../lib/prisma";
import { signToken } from "../lib/auth";
import { startOfIndiaDay, startOfIndiaMonth, startOfIndiaWeek } from "../lib/india-time";
import { ACCRUED_TRANSACTION_STATUSES } from "../lib/financial";
import { GET as getPartnerEarnings } from "../app/api/partner/earnings/route";
import { GET as getAdminAnalytics } from "../app/api/admin/analytics/route";
import { GET as getMarketplaceAnalytics } from "../app/api/admin/marketplace-analytics/route";

function check(label: string, condition: boolean, detail?: unknown) {
  if (!condition) {
    throw new Error(`FAIL: ${label}${detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`);
  }
  console.log(`PASS: ${label}`);
}

function authenticatedRequest(url: string, token: string) {
  return new NextRequest(url, {
    headers: { Cookie: `fixoo_token=${token}` },
  });
}

async function main() {
  const tenantId = "default";
  const now = new Date();
  const todayStart = startOfIndiaDay(now);
  const weekStart = startOfIndiaWeek(now);
  const monthStart = startOfIndiaMonth(now);

  const latestCompleted = await prisma.serviceRequest.findFirst({
    where: { tenantId, status: "COMPLETED", partnerId: { not: null } },
    orderBy: { completedAt: "desc" },
    select: { partnerId: true },
  });
  if (!latestCompleted?.partnerId) throw new Error("No completed partner request found");

  const [partner, admin] = await Promise.all([
    prisma.partner.findFirstOrThrow({
      where: { id: latestCompleted.partnerId, tenantId },
      select: { id: true, phone: true },
    }),
    prisma.admin.findFirstOrThrow({
      where: { tenantId, isActive: true },
      select: { id: true, phone: true, role: true },
    }),
  ]);

  const partnerToken = signToken({
    id: partner.id,
    phone: partner.phone,
    role: "partner",
    tenantId,
  });
  const adminToken = signToken({
    id: admin.id,
    phone: admin.phone,
    role: "admin",
    tenantId,
    adminRole: admin.role as "SUPER_ADMIN" | "TENANT_OWNER" | "STAFF",
  });

  const partnerResponse = await getPartnerEarnings(
    authenticatedRequest("http://localhost/api/partner/earnings", partnerToken)
  );
  const adminResponse = await getAdminAnalytics(
    authenticatedRequest("http://localhost/api/admin/analytics", adminToken)
  );
  const marketplaceResponse = await getMarketplaceAnalytics(
    authenticatedRequest("http://localhost/api/admin/marketplace-analytics", adminToken)
  );
  check("partner earnings API succeeds", partnerResponse.status === 200, partnerResponse.status);
  check("admin analytics API succeeds", adminResponse.status === 200, adminResponse.status);
  check("marketplace analytics API succeeds", marketplaceResponse.status === 200, marketplaceResponse.status);

  const partnerPayload = await partnerResponse.json();
  const adminPayload = await adminResponse.json();
  const marketplacePayload = await marketplaceResponse.json();

  const accruedWhere = {
    tenantId,
    status: { in: [...ACCRUED_TRANSACTION_STATUSES] },
    request: { status: "COMPLETED" as const },
  };
  const [
    missingTransactions,
    duplicateTransactions,
    expectedToday,
    expectedWeek,
    expectedMonth,
    expectedPartnerToday,
    expectedPartnerJobsToday,
  ] = await Promise.all([
    prisma.serviceRequest.count({
      where: { tenantId, status: "COMPLETED", transaction: null },
    }),
    prisma.$queryRaw<Array<{ request_id: string; count: bigint }>>`
      SELECT "requestId" AS request_id, COUNT(*)::bigint AS count
      FROM transactions
      WHERE "tenantId" = ${tenantId}
      GROUP BY "requestId"
      HAVING COUNT(*) > 1
    `,
    prisma.transaction.aggregate({
      where: {
        ...accruedWhere,
        request: { status: "COMPLETED", completedAt: { gte: todayStart } },
      },
      _sum: { totalAmount: true, partnerEarning: true, platformFee: true },
      _count: { _all: true },
    }),
    prisma.transaction.aggregate({
      where: {
        ...accruedWhere,
        request: { status: "COMPLETED", completedAt: { gte: weekStart } },
      },
      _sum: { totalAmount: true, partnerEarning: true, platformFee: true },
      _count: { _all: true },
    }),
    prisma.transaction.aggregate({
      where: {
        ...accruedWhere,
        request: { status: "COMPLETED", completedAt: { gte: monthStart } },
      },
      _sum: { totalAmount: true, partnerEarning: true, platformFee: true },
      _count: { _all: true },
    }),
    prisma.transaction.aggregate({
      where: {
        ...accruedWhere,
        partnerId: partner.id,
        request: { status: "COMPLETED", completedAt: { gte: todayStart } },
      },
      _sum: { partnerEarning: true },
    }),
    prisma.serviceRequest.count({
      where: {
        tenantId,
        partnerId: partner.id,
        status: "COMPLETED",
        completedAt: { gte: todayStart },
      },
    }),
  ]);

  const expectedPartnerEarnings = Number(expectedPartnerToday._sum.partnerEarning || 0);
  const expectedPlatformToday = Number(expectedToday._sum.platformFee || 0);

  check("every completed request has a transaction", missingTransactions === 0, missingTransactions);
  check("no request has duplicate transactions", duplicateTransactions.length === 0);
  check(
    "partner today earnings match database",
    partnerPayload.data.earnings.today === expectedPartnerEarnings,
    { api: partnerPayload.data.earnings.today, db: expectedPartnerEarnings }
  );
  check(
    "partner jobs today match completed requests",
    partnerPayload.data.stats.jobsToday === expectedPartnerJobsToday,
    { api: partnerPayload.data.stats.jobsToday, db: expectedPartnerJobsToday }
  );
  check(
    "admin revenue today matches accrued platform fees",
    adminPayload.data.revenue.today === expectedPlatformToday,
    { api: adminPayload.data.revenue.today, db: expectedPlatformToday }
  );
  check(
    "marketplace monthly gross matches database",
    marketplacePayload.data.revenue.grossTransactionValue ===
      Number(expectedMonth._sum.totalAmount || 0),
    {
      api: marketplacePayload.data.revenue.grossTransactionValue,
      db: Number(expectedMonth._sum.totalAmount || 0),
    }
  );

  console.log(JSON.stringify({
    partnerId: partner.id,
    partner: {
      todayEarnings: partnerPayload.data.earnings.today,
      weekEarnings: partnerPayload.data.earnings.thisWeek,
      monthEarnings: partnerPayload.data.earnings.thisMonth,
      jobsToday: partnerPayload.data.stats.jobsToday,
    },
    admin: {
      revenueToday: adminPayload.data.revenue.today,
      revenueWeek: adminPayload.data.revenue.thisWeek,
      revenueMonth: adminPayload.data.revenue.thisMonth,
      completedToday: adminPayload.data.requests.completedToday,
    },
    database: {
      today: {
        transactions: expectedToday._count._all,
        gross: Number(expectedToday._sum.totalAmount || 0),
        partnerEarnings: Number(expectedToday._sum.partnerEarning || 0),
        platformFees: Number(expectedToday._sum.platformFee || 0),
      },
      week: {
        transactions: expectedWeek._count._all,
        gross: Number(expectedWeek._sum.totalAmount || 0),
        partnerEarnings: Number(expectedWeek._sum.partnerEarning || 0),
        platformFees: Number(expectedWeek._sum.platformFee || 0),
      },
      month: {
        transactions: expectedMonth._count._all,
        gross: Number(expectedMonth._sum.totalAmount || 0),
        partnerEarnings: Number(expectedMonth._sum.partnerEarning || 0),
        platformFees: Number(expectedMonth._sum.platformFee || 0),
      },
    },
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
