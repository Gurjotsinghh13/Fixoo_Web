import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/authorization";
import { checkRateLimit, maskAadhaar, rateLimitResponse } from "@/lib/security";
import { emitToPartner } from "@/server/emitter";
import { ACCRUED_TRANSACTION_STATUSES } from "@/lib/financial";

export async function GET(req: NextRequest) {
  try {
    const authz = await requireAdmin(req);
    if (!authz.ok) return authz.response;
    const { tenantId } = authz;

    const { searchParams } = new URL(req.url);
    const filter = searchParams.get("filter") || "all";
    const search = searchParams.get("search") || "";

    const where: Record<string, unknown> = { tenantId };
    if (filter === "pending") where.applicationStatus = "PENDING";
    if (filter === "approved") where.applicationStatus = "APPROVED";
    if (filter === "rejected") where.applicationStatus = "REJECTED";
    if (filter === "suspended") where.applicationStatus = "SUSPENDED";
    if (filter === "online") { where.isOnline = true; where.isApproved = true; }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
        { shopName: { contains: search, mode: "insensitive" } },
      ];
    }

    const partners = await prisma.partner.findMany({
      where,
      include: {
        location: true,
        vehicleTypes: { include: { vehicleType: true } },
        activities: { orderBy: { createdAt: "desc" }, take: 8 },
        reviewNotes: { orderBy: { createdAt: "desc" }, take: 5 },
        requests: {
          where: { status: { in: ["ACCEPTED", "ON_THE_WAY", "ARRIVED", "REPAIR_IN_PROGRESS"] } },
          select: { id: true, status: true, area: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
        _count: { select: { requests: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const partnerIds = partners.map((partner) => partner.id);
    const [broadcastGroups, completedGroups, earningsGroups, acceptedBroadcasts, completedJobs] =
      partnerIds.length
        ? await Promise.all([
            prisma.partnerBroadcast.groupBy({
              by: ["partnerId"],
              where: { tenantId, partnerId: { in: partnerIds } },
              _count: { _all: true },
            }),
            prisma.serviceRequest.groupBy({
              by: ["partnerId"],
              where: { tenantId, partnerId: { in: partnerIds }, status: "COMPLETED" },
              _count: { _all: true },
            }),
            prisma.transaction.groupBy({
              by: ["partnerId"],
              where: {
                tenantId,
                partnerId: { in: partnerIds },
                status: { in: [...ACCRUED_TRANSACTION_STATUSES] },
              },
              _sum: { partnerEarning: true },
            }),
            prisma.partnerBroadcast.findMany({
              where: {
                tenantId,
                partnerId: { in: partnerIds },
                response: "ACCEPTED",
                respondedAt: { not: null },
              },
              select: { partnerId: true, sentAt: true, respondedAt: true },
            }),
            prisma.serviceRequest.findMany({
              where: { tenantId, partnerId: { in: partnerIds }, status: "COMPLETED" },
              select: { partnerId: true, completedAt: true },
              orderBy: { completedAt: "desc" },
            }),
          ])
        : [[], [], [], [], []];

    const requestsReceived = new Map(broadcastGroups.map((row) => [row.partnerId, row._count._all]));
    const completedRequests = new Map(completedGroups.map((row) => [row.partnerId, row._count._all]));
    const earnings = new Map(earningsGroups.map((row) => [row.partnerId, Number(row._sum.partnerEarning || 0)]));
    const acceptedByPartner = new Map<string, { count: number; totalResponseMs: number }>();

    for (const broadcast of acceptedBroadcasts) {
      const current = acceptedByPartner.get(broadcast.partnerId) || { count: 0, totalResponseMs: 0 };
      current.count += 1;
      current.totalResponseMs += Math.max(
        0,
        (broadcast.respondedAt?.getTime() || broadcast.sentAt.getTime()) - broadcast.sentAt.getTime()
      );
      acceptedByPartner.set(broadcast.partnerId, current);
    }

    const lastCompletedByPartner = new Map<string, Date>();
    for (const job of completedJobs) {
      if (job.completedAt && !lastCompletedByPartner.has(job.partnerId || "")) {
        lastCompletedByPartner.set(job.partnerId || "", job.completedAt);
      }
    }

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const enrichedPartners = partners.map((p) => {
      const received = requestsReceived.get(p.id) || 0;
      const accepted = acceptedByPartner.get(p.id)?.count || 0;
      const completed = completedRequests.get(p.id) || 0;
      const earned = earnings.get(p.id) || 0;
      const responseSeconds = acceptedByPartner.get(p.id)?.count
        ? Math.round((acceptedByPartner.get(p.id)!.totalResponseMs / acceptedByPartner.get(p.id)!.count) / 1000)
        : null;
      const acceptanceRate = received ? Math.round((accepted / received) * 100) : 0;
      const completionRate = accepted ? Math.round((completed / accepted) * 100) : 0;
      const lastOnlineAt = p.lastOnlineAt || p.location?.lastSeenAt || null;
      const lastCompletedAt = p.lastCompletedAt || lastCompletedByPartner.get(p.id) || null;
      const inactiveFlags = {
        notOnline7Days: !lastOnlineAt || now - lastOnlineAt.getTime() > 7 * dayMs,
        noCompletedJob14Days: !lastCompletedAt || now - lastCompletedAt.getTime() > 14 * dayMs,
        lowAcceptanceRate: received >= 5 && acceptanceRate < 30,
      };
      const responseScore =
        responseSeconds == null ? 50 : responseSeconds <= 60 ? 100 : responseSeconds <= 180 ? 70 : 40;
      const completionScore = accepted ? Math.min(100, completionRate) : 50;
      const ratingScore = p.rating > 0 ? Math.round((Math.min(p.rating, 5) / 5) * 100) : 60;
      const onlineAvailabilityScore = p.isOnline
        ? 100
        : lastOnlineAt && now - lastOnlineAt.getTime() <= 7 * dayMs
          ? 70
          : lastOnlineAt && now - lastOnlineAt.getTime() <= 14 * dayMs
            ? 40
            : 0;
      const healthScore = Math.round(
        responseScore * 0.25 + completionScore * 0.3 + ratingScore * 0.25 + onlineAvailabilityScore * 0.2
      );

      return {
        id: p.id,
        phone: p.phone,
        name: p.name,
        shopName: p.shopName,
        address: p.address,
        area: p.area,
        pincode: p.pincode,
        aadhaarNumber: maskAadhaar(p.aadhaarNumber),
        workingHours: p.workingHours,
        serviceRadius: p.serviceRadius,
        applicationStatus: p.applicationStatus,
        applicationNotes: p.applicationNotes,
        shopPhotoUrl: p.shopPhotoUrl,
        idProofUrl: p.idProofUrl,
        addressProofUrl: p.addressProofUrl,
        approvedAt: p.approvedAt?.toISOString(),
        rejectedAt: p.rejectedAt?.toISOString(),
        suspendedAt: p.suspendedAt?.toISOString(),
        lastOnlineAt: lastOnlineAt?.toISOString(),
        lastCompletedAt: lastCompletedAt?.toISOString(),
        isOnline: p.isOnline,
        isApproved: p.isApproved,
        isSuspended: p.isSuspended,
        rating: p.rating,
        totalJobs: p.totalJobs,
        completedJobs: p.completedJobs,
        location: p.location,
        activeJobs: p.requests.map((request) => ({
          ...request,
          createdAt: request.createdAt.toISOString(),
        })),
        vehicleTypes: p.vehicleTypes.map((vt) => vt.vehicleType.displayName),
        requestCount: p._count.requests,
        inactiveFlags,
        healthScore,
        metrics: {
          totalRequestsReceived: received,
          acceptedRequests: accepted,
          completedRequests: completed,
          acceptanceRate,
          completionRate,
          averageResponseTimeSeconds: responseSeconds,
          earnings: earned,
        },
        activities: p.activities.map((activity) => ({
          id: activity.id,
          type: activity.type,
          note: activity.note,
          createdAt: activity.createdAt.toISOString(),
        })),
        reviewNotes: p.reviewNotes.map((note) => ({
          id: note.id,
          note: note.note,
          adminId: note.adminId,
          createdAt: note.createdAt.toISOString(),
        })),
        createdAt: p.createdAt.toISOString(),
      };
    });

    const rankedIds = [...enrichedPartners]
      .sort((a, b) =>
        b.metrics.completedRequests - a.metrics.completedRequests ||
        b.metrics.acceptanceRate - a.metrics.acceptanceRate ||
        b.rating - a.rating ||
        b.metrics.earnings - a.metrics.earnings
      )
      .map((partner) => partner.id);

    return NextResponse.json({
      success: true,
      data: enrichedPartners.map((partner) => ({
        ...partner,
        leaderboardRank: rankedIds.indexOf(partner.id) + 1,
      })),
    });
  } catch (error) {
    console.error("Admin partners GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch partners" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authz = await requireAdmin(req);
    if (!authz.ok) return authz.response;
    const { tenantId, user } = authz;
    const adminLimit = checkRateLimit(`admin-partner-action:${tenantId}:${user.id}`, {
      limit: 60,
      windowMs: 10 * 60 * 1000,
      lockMs: 15 * 60 * 1000,
    });
    if (!adminLimit.ok) return rateLimitResponse(adminLimit.retryAfterSeconds);

    const body = await req.json();
    const { partnerId, action, note } = body;

    if (!partnerId || !action) {
      return NextResponse.json({ success: false, error: "partnerId and action required" }, { status: 400 });
    }

    const noteText = typeof note === "string" ? note.trim().slice(0, 1000) : "";
    if (action === "approve" && noteText.length < 2) {
      return NextResponse.json(
        { success: false, error: "Approval note is required" },
        { status: 400 }
      );
    }
    if ((action === "reject" || action === "suspend") && noteText.length < 2) {
      return NextResponse.json(
        { success: false, error: "Reason is required" },
        { status: 400 }
      );
    }

    let updateData: Record<string, unknown> = {};
    if (action === "approve") updateData = {
      isApproved: true,
      isSuspended: false,
      isOnline: false,
      applicationStatus: "APPROVED",
      applicationNotes: noteText,
      approvedAt: new Date(),
      rejectedAt: null,
      suspendedAt: null,
    };
    else if (action === "reject") updateData = {
      isApproved: false,
      isSuspended: false,
      isOnline: false,
      applicationStatus: "REJECTED",
      rejectedAt: new Date(),
      applicationNotes: noteText,
    };
    else if (action === "suspend") updateData = {
      isApproved: false,
      isSuspended: true,
      isOnline: false,
      applicationStatus: "SUSPENDED",
      suspendedAt: new Date(),
      applicationNotes: noteText,
    };
    else if (action === "unsuspend") updateData = {
      isApproved: true,
      isSuspended: false,
      isOnline: false,
      applicationStatus: "APPROVED",
      suspendedAt: null,
      applicationNotes: noteText || "Partner unsuspended",
    };
    else if (action === "offline") updateData = { isOnline: false };
    else if (action === "note") updateData = {};
    else {
      return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
    }

    const partner = Object.keys(updateData).length
      ? await prisma.partner.updateMany({
          where: { id: partnerId, tenantId },
          data: updateData,
        })
      : await prisma.partner.updateMany({ where: { id: partnerId, tenantId }, data: {} });

    if (partner.count !== 1) {
      return NextResponse.json({ success: false, error: "Partner not found" }, { status: 404 });
    }

    const updatedPartner = await prisma.partner.findFirstOrThrow({
      where: { id: partnerId, tenantId },
      select: { id: true, name: true, isApproved: true, isSuspended: true },
    });

    await prisma.activityLog.create({
      data: {
        tenantId,
        adminId: user.id,
        action,
        entity: "partner",
        entityId: partnerId,
      },
    });

    if (noteText) {
      await prisma.partnerReviewNote.create({
        data: { tenantId, partnerId, adminId: user.id, note: noteText },
      });
    }

    const activityType: Record<string, string> = {
      approve: "APPROVED",
      reject: "REJECTED",
      suspend: "SUSPENDED",
      unsuspend: "APPROVED",
      offline: "MARKED_OFFLINE",
      note: "ADMIN_NOTE",
    };
    await prisma.partnerActivity.create({
      data: {
        tenantId,
        partnerId,
        type: activityType[action] || action.toUpperCase(),
        note: noteText || `Admin action: ${action}`,
        metadata: { adminId: user.id },
      },
    });

    if (action === "reject" || action === "suspend") {
      emitToPartner(partnerId, "partner:access_revoked", {
        applicationStatus: action === "reject" ? "REJECTED" : "SUSPENDED",
      });
    }

    return NextResponse.json({ success: true, data: updatedPartner });
  } catch (error) {
    console.error("Admin partners PATCH error:", error);
    return NextResponse.json({ success: false, error: "Action failed" }, { status: 500 });
  }
}
