import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { RequestStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/authorization";
import { dispatchRequest } from "@/lib/dispatch";
import { emitToCustomer, emitToPartner, emitToTenantPartners } from "@/server/emitter";
import { recordRequestHistory } from "@/lib/request-history";
import { checkRateLimit, rateLimitResponse } from "@/lib/security";

const ACTIVE_STATUSES: RequestStatus[] = [
  "REQUESTED",
  "ACCEPTED",
  "ON_THE_WAY",
  "ARRIVED",
  "REPAIR_IN_PROGRESS",
];
const ASSIGNED_ACTIVE_STATUSES: RequestStatus[] = ACTIVE_STATUSES.filter(
  (status) => status !== "REQUESTED"
);

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const authz = await requireAdmin(_req);
    if (!authz.ok) return authz.response;
    const { tenantId } = authz;
    const { id } = await params;

    const request = await prisma.serviceRequest.findFirst({
      where: { id, tenantId },
      include: {
        user: { select: { id: true, name: true, phone: true } },
        partner: { select: { id: true, name: true, shopName: true, phone: true, rating: true, isOnline: true } },
        service: { select: { displayName: true } },
        vehicleType: { select: { displayName: true } },
        transaction: true,
        feedback: { select: { rating: true, comment: true, createdAt: true } },
        broadcasts: {
          orderBy: { sentAt: "desc" },
          include: { partner: { select: { id: true, name: true, shopName: true, phone: true } } },
        },
        supportNotes: { orderBy: { createdAt: "desc" } },
        statusHistory: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!request) {
      return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
    }

    const eligiblePartners = await prisma.partner.findMany({
      where: {
        tenantId,
        isApproved: true,
        isSuspended: false,
        vehicleTypes: { some: { tenantId, vehicleTypeId: request.vehicleTypeId } },
        requests: {
          none: {
            tenantId,
            status: { in: ASSIGNED_ACTIVE_STATUSES },
          },
        },
      },
      orderBy: [{ isOnline: "desc" }, { rating: "desc" }],
      take: 25,
      select: { id: true, name: true, shopName: true, phone: true, isOnline: true, rating: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: request.id,
        status: request.status,
        customer: request.user,
        partner: request.partner,
        service: request.service.displayName,
        vehicleType: request.vehicleType.displayName,
        area: request.area,
        address: request.address,
        latitude: request.latitude,
        longitude: request.longitude,
        totalAmount: Number(request.totalAmount),
        serviceFee: Number(request.serviceFee),
        platformFee: Number(request.platformFee),
        searchRadius: request.searchRadius,
        estimatedEtaSeconds: request.estimatedEtaSeconds,
        estimatedDistanceKm: request.estimatedDistanceKm,
        etaUpdatedAt: request.etaUpdatedAt?.toISOString(),
        createdAt: request.createdAt.toISOString(),
        acceptedAt: request.acceptedAt?.toISOString(),
        onTheWayAt: request.onTheWayAt?.toISOString(),
        arrivedAt: request.arrivedAt?.toISOString(),
        startedAt: request.startedAt?.toISOString(),
        completedAt: request.completedAt?.toISOString(),
        cancelledAt: request.cancelledAt?.toISOString(),
        cancelReason: request.cancelReason,
        noShowType: request.noShowType,
        noShowReason: request.noShowReason,
        noShowAt: request.noShowAt?.toISOString(),
        supportStatus: request.supportStatus,
        supportReason: request.supportReason,
        supportUpdatedAt: request.supportUpdatedAt?.toISOString(),
        transaction: request.transaction
          ? {
              ...request.transaction,
              totalAmount: Number(request.transaction.totalAmount),
              platformFee: Number(request.transaction.platformFee),
              partnerEarning: Number(request.transaction.partnerEarning),
              paidAt: request.transaction.paidAt?.toISOString(),
              settledAt: request.transaction.settledAt?.toISOString(),
            }
          : null,
        feedback: request.feedback
          ? {
              rating: request.feedback.rating,
              comment: request.feedback.comment,
              createdAt: request.feedback.createdAt.toISOString(),
            }
          : null,
        broadcasts: request.broadcasts.map((broadcast) => ({
          id: broadcast.id,
          partner: broadcast.partner,
          response: broadcast.response,
          sentAt: broadcast.sentAt.toISOString(),
          respondedAt: broadcast.respondedAt?.toISOString(),
        })),
        supportNotes: request.supportNotes.map((note) => ({
          id: note.id,
          note: note.note,
          adminId: note.adminId,
          createdAt: note.createdAt.toISOString(),
        })),
        statusHistory: request.statusHistory.map((item) => ({
          id: item.id,
          actorRole: item.actorRole,
          actorId: item.actorId,
          fromStatus: item.fromStatus,
          toStatus: item.toStatus,
          reason: item.reason,
          createdAt: item.createdAt.toISOString(),
        })),
        eligiblePartners,
      },
    });
  } catch (error) {
    console.error("Admin request detail GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch request" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const authz = await requireAdmin(req);
    if (!authz.ok) return authz.response;
    const { tenantId, user } = authz;
    const adminLimit = checkRateLimit(`admin-request-action:${tenantId}:${user.id}`, {
      limit: 60,
      windowMs: 10 * 60 * 1000,
      lockMs: 15 * 60 * 1000,
    });
    if (!adminLimit.ok) return rateLimitResponse(adminLimit.retryAfterSeconds);
    const { id } = await params;
    const body = await req.json();
    const { action, partnerId, reason, supportStatus } = body;

    const request = await prisma.serviceRequest.findFirst({
      where: { id, tenantId },
      include: { partner: true, service: true },
    });

    if (!request) {
      return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
    }

    if (action === "remove_partner") {
      const changed = await prisma.serviceRequest.updateMany({
        where: { id, tenantId, status: { in: ["ACCEPTED", "ON_THE_WAY", "ARRIVED", "REPAIR_IN_PROGRESS"] } },
        data: {
          status: "REQUESTED",
          partnerId: null,
          acceptedAt: null,
          onTheWayAt: null,
          arrivedAt: null,
          startedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      if (changed.count !== 1) return NextResponse.json({ success: false, error: "Cannot remove partner now" }, { status: 400 });
      if (request.partnerId) emitToPartner(request.partnerId, "request:cancelled", { requestId: id });
      await recordRequestHistory({
        tenantId,
        requestId: id,
        fromStatus: request.status,
        toStatus: "REQUESTED",
        actorRole: "admin",
        actorId: user.id,
        adminId: user.id,
        reason: reason || "Partner removed by admin",
      });
      return NextResponse.json({ success: true });
    }

    if (action === "rebroadcast") {
      await prisma.serviceRequest.updateMany({
        where: { id, tenantId, status: { in: ["REQUESTED", "ACCEPTED", "ON_THE_WAY"] } },
        data: {
          status: "REQUESTED",
          partnerId: null,
          acceptedAt: null,
          onTheWayAt: null,
          arrivedAt: null,
          startedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      await prisma.partnerBroadcast.updateMany({
        where: { tenantId, requestId: id, response: null },
        data: { response: "TIMEOUT", respondedAt: new Date() },
      });
      await recordRequestHistory({
        tenantId,
        requestId: id,
        fromStatus: request.status,
        toStatus: "REQUESTED",
        actorRole: "admin",
        actorId: user.id,
        adminId: user.id,
        reason: reason || "Rebroadcast by admin",
      });
      dispatchRequest(id, tenantId).catch((error) => console.error("Admin rebroadcast failed:", error));
      return NextResponse.json({ success: true });
    }

    if (action === "assign_partner") {
      if (!partnerId) return NextResponse.json({ success: false, error: "partnerId required" }, { status: 400 });
      const partner = await prisma.partner.findFirst({
        where: {
          id: partnerId,
          tenantId,
          applicationStatus: "APPROVED",
          isApproved: true,
          isSuspended: false,
          isOnline: true,
        },
        select: { id: true, name: true, shopName: true, phone: true, rating: true },
      });
      if (!partner) return NextResponse.json({ success: false, error: "Partner not eligible" }, { status: 400 });
      const activeJob = await prisma.serviceRequest.findFirst({
        where: { tenantId, partnerId, status: { in: ASSIGNED_ACTIVE_STATUSES } },
        select: { id: true },
      });
      if (activeJob) return NextResponse.json({ success: false, error: "Partner is busy" }, { status: 409 });

      const changed = await prisma.serviceRequest.updateMany({
        where: { id, tenantId, status: { in: ["REQUESTED", "ACCEPTED", "ON_THE_WAY"] } },
        data: { status: "ACCEPTED", partnerId, acceptedAt: new Date() },
      });
      if (changed.count !== 1) return NextResponse.json({ success: false, error: "Cannot assign request now" }, { status: 400 });
      await prisma.partnerBroadcast.upsert({
        where: { tenantId_requestId_partnerId: { tenantId, requestId: id, partnerId } },
        update: { response: "ACCEPTED", respondedAt: new Date() },
        create: { tenantId, requestId: id, partnerId, response: "ACCEPTED", respondedAt: new Date() },
      });
      await recordRequestHistory({
        tenantId,
        requestId: id,
        fromStatus: request.status,
        toStatus: "ACCEPTED",
        actorRole: "admin",
        actorId: user.id,
        adminId: user.id,
        reason: reason || `Assigned to ${partner.name}`,
      });
      emitToCustomer(request.userId, "request:accepted", {
        requestId: id,
        partnerName: partner.name,
        shopName: partner.shopName,
        partnerPhone: partner.phone,
        rating: partner.rating,
        eta: request.service.displayName,
      });
      emitToTenantPartners(tenantId, "request:taken", { requestId: id });
      return NextResponse.json({ success: true });
    }

    if (action === "partner_no_show" || action === "customer_no_show") {
      const noShowType = action === "partner_no_show" ? "PARTNER" : "CUSTOMER";
      const changed = await prisma.serviceRequest.updateMany({
        where: { id, tenantId, status: { in: ACTIVE_STATUSES } },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelReason: reason || `${noShowType} no-show`,
          noShowType,
          noShowReason: reason || `${noShowType} no-show`,
          noShowAt: new Date(),
        },
      });
      if (changed.count !== 1) return NextResponse.json({ success: false, error: "Cannot mark no-show now" }, { status: 400 });
      if (request.partnerId) emitToPartner(request.partnerId, "request:cancelled", { requestId: id });
      emitToCustomer(request.userId, "request:cancelled", { requestId: id });
      await recordRequestHistory({
        tenantId,
        requestId: id,
        fromStatus: request.status,
        toStatus: "CANCELLED",
        actorRole: "admin",
        actorId: user.id,
        adminId: user.id,
        reason: reason || `${noShowType} no-show`,
      });
      return NextResponse.json({ success: true });
    }

    if (action === "cancel") {
      const cancelReason =
        typeof reason === "string" && reason.trim().length >= 3
          ? reason.trim().slice(0, 500)
          : "";
      if (!cancelReason) {
        return NextResponse.json(
          { success: false, error: "Cancellation reason is required" },
          { status: 400 }
        );
      }
      const changed = await prisma.serviceRequest.updateMany({
        where: { id, tenantId, status: { in: ACTIVE_STATUSES } },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelReason,
        },
      });
      if (changed.count !== 1) {
        return NextResponse.json(
          { success: false, error: "Request cannot be cancelled now" },
          { status: 409 }
        );
      }
      await prisma.partnerBroadcast.updateMany({
        where: { tenantId, requestId: id, response: null },
        data: { response: "TIMEOUT", respondedAt: new Date() },
      });
      if (request.partnerId) emitToPartner(request.partnerId, "request:cancelled", { requestId: id });
      emitToCustomer(request.userId, "request:cancelled", { requestId: id, reason: cancelReason });
      emitToTenantPartners(tenantId, "request:taken", { requestId: id });
      await recordRequestHistory({
        tenantId,
        requestId: id,
        fromStatus: request.status,
        toStatus: "CANCELLED",
        actorRole: "admin",
        actorId: user.id,
        adminId: user.id,
        reason: cancelReason,
      });
      return NextResponse.json({ success: true });
    }

    if (action === "set_support_queue") {
      const allowedQueues = [
        "PAYMENT_ISSUE",
        "PAYMENT_DISPUTE",
        "REFUND_REQUIRED",
        "SUPPORT_FOLLOW_UP",
      ];
      if (!allowedQueues.includes(supportStatus)) {
        return NextResponse.json({ success: false, error: "Invalid support queue" }, { status: 400 });
      }
      const supportReason =
        typeof reason === "string" && reason.trim()
          ? reason.trim().slice(0, 500)
          : supportStatus.replaceAll("_", " ");
      await prisma.serviceRequest.updateMany({
        where: { id, tenantId },
        data: { supportStatus, supportReason, supportUpdatedAt: new Date() },
      });
      await prisma.activityLog.create({
        data: {
          tenantId,
          adminId: user.id,
          action: "set_support_queue",
          entity: "request",
          entityId: id,
          metadata: { supportStatus, supportReason },
        },
      });
      return NextResponse.json({ success: true });
    }

    if (action === "clear_support_queue") {
      await prisma.serviceRequest.updateMany({
        where: { id, tenantId },
        data: { supportStatus: null, supportReason: null, supportUpdatedAt: new Date() },
      });
      await prisma.activityLog.create({
        data: {
          tenantId,
          adminId: user.id,
          action: "clear_support_queue",
          entity: "request",
          entityId: id,
        },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Admin request action error:", error);
    return NextResponse.json({ success: false, error: "Action failed" }, { status: 500 });
  }
}
