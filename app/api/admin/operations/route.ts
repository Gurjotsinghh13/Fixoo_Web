import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/authorization";

const ACTIVE_STATUSES = [
  "REQUESTED",
  "ACCEPTED",
  "ON_THE_WAY",
  "ARRIVED",
  "REPAIR_IN_PROGRESS",
] as const;

export async function GET(req: NextRequest) {
  try {
    const authz = await requireAdmin(req);
    if (!authz.ok) return authz.response;
    const { tenantId } = authz;
    const staleBefore = new Date(Date.now() - 30 * 60 * 1000);

    const requests = await prisma.serviceRequest.findMany({
      where: {
        tenantId,
        OR: [
          { status: "EXPIRED" },
          { noShowType: { not: null } },
          { supportStatus: { not: null } },
          {
            status: { in: [...ACTIVE_STATUSES] },
            updatedAt: { lt: staleBefore },
          },
          {
            status: { in: ["ACCEPTED", "ON_THE_WAY", "ARRIVED", "REPAIR_IN_PROGRESS"] },
            partner: { isOnline: false },
          },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: {
        user: { select: { name: true, phone: true } },
        partner: { select: { name: true, shopName: true, isOnline: true } },
        service: { select: { displayName: true } },
        broadcasts: { select: { response: true } },
        transaction: { select: { status: true } },
      },
    });

    const rows = requests.map((request) => ({
      id: request.id,
      status: request.status,
      service: request.service.displayName,
      customer: request.user.name || request.user.phone,
      partner: request.partner?.shopName || request.partner?.name || null,
      partnerOnline: request.partner?.isOnline ?? null,
      noShowType: request.noShowType,
      supportStatus: request.supportStatus,
      supportReason: request.supportReason,
      transactionStatus: request.transaction?.status || null,
      updatedAt: request.updatedAt.toISOString(),
      broadcastCount: request.broadcasts.length,
      acceptedBroadcasts: request.broadcasts.filter((item) => item.response === "ACCEPTED").length,
    }));

    const queue = (predicate: (row: (typeof rows)[number]) => boolean) => rows.filter(predicate);
    return NextResponse.json({
      success: true,
      data: {
        failedRequests: queue((row) => row.status === "EXPIRED" || Boolean(row.noShowType)),
        noPartnerAvailable: queue(
          (row) => row.status === "EXPIRED" && row.acceptedBroadcasts === 0
        ),
        partnerNoShow: queue((row) => row.noShowType === "PARTNER"),
        customerNoShow: queue((row) => row.noShowType === "CUSTOMER"),
        paymentIssues: queue((row) => row.supportStatus === "PAYMENT_ISSUE"),
        paymentDisputes: queue((row) => row.supportStatus === "PAYMENT_DISPUTE"),
        refundRequired: queue((row) => row.supportStatus === "REFUND_REQUIRED"),
        supportFollowUp: queue((row) => row.supportStatus === "SUPPORT_FOLLOW_UP"),
        partnerDisconnect: queue(
          (row) =>
            ["ACCEPTED", "ON_THE_WAY", "ARRIVED", "REPAIR_IN_PROGRESS"].includes(row.status) &&
            row.partnerOnline === false
        ),
        stuckRequests: queue(
          (row) =>
            ACTIVE_STATUSES.includes(row.status as (typeof ACTIVE_STATUSES)[number]) &&
            new Date(row.updatedAt) < staleBefore
        ),
      },
    });
  } catch (error) {
    console.error("Admin operations GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch operations queues" },
      { status: 500 }
    );
  }
}
