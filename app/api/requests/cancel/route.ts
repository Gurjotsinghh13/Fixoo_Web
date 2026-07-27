import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { emitToPartner, emitToAdmin, emitToTenantPartners } from "@/server/emitter";
import prisma from "@/lib/prisma";
import { getTenantId } from "@/lib/tenant";
import { requireAdmin, requireCustomer, requirePartner } from "@/lib/authorization";
import { recordRequestHistory } from "@/lib/request-history";

export async function POST(req: NextRequest) {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const tenantId = getTenantId(user.tenantId);

    if (user.role === "customer") {
      const authz = await requireCustomer(req);
      if (!authz.ok) return authz.response;
    } else if (user.role === "partner") {
      const authz = await requirePartner(req);
      if (!authz.ok) return authz.response;
    } else if (user.role === "admin") {
      const authz = await requireAdmin(req);
      if (!authz.ok) return authz.response;
    } else {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { requestId, reason } = body;

    if (!requestId) {
      return NextResponse.json({ success: false, error: "requestId is required" }, { status: 400 });
    }

    const request = await prisma.serviceRequest.findFirst({
      where: { id: requestId, tenantId },
      select: { status: true, userId: true, partnerId: true },
    });

    if (!request) {
      return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
    }

    const cancellableStatuses = ["REQUESTED", "ACCEPTED", "ON_THE_WAY"];
    if (!cancellableStatuses.includes(request.status)) {
      return NextResponse.json(
        { success: false, error: `Cannot cancel a request in ${request.status} status` },
        { status: 400 }
      );
    }

    if (user.role === "customer" && request.userId !== user.id) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    if (user.role === "partner" && request.partnerId !== user.id) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    await prisma.$transaction(async (tx) => {
      const changed = await tx.serviceRequest.updateMany({
        where: { id: requestId, tenantId, status: request.status },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelReason: reason || "Cancelled by user",
        },
      });

      if (changed.count !== 1) {
        throw new Error("REQUEST_CANCEL_CONFLICT");
      }

      if (request.status === "REQUESTED") {
        await tx.partnerBroadcast.updateMany({
          where: { tenantId, requestId, response: null },
          data: { response: "REJECTED", respondedAt: new Date() },
        });
      }
    });

    // Notify partner if one was assigned
    if (request.partnerId) {
      emitToPartner(request.partnerId, "request:cancelled", { requestId });
    } else {
      emitToTenantPartners(tenantId, "request:cancelled", { requestId });
    }

    emitToAdmin("admin:request_cancelled", { requestId }, tenantId);
    recordRequestHistory({
      tenantId,
      requestId,
      fromStatus: request.status,
      toStatus: "CANCELLED",
      actorRole: user.role,
      actorId: user.id,
      adminId: user.role === "admin" ? user.id : null,
      reason: reason || "Cancelled by user",
    });

    return NextResponse.json({ success: true, message: "Request cancelled" });
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_CANCEL_CONFLICT") {
      return NextResponse.json(
        { success: false, error: "Request changed. Please refresh and try again." },
        { status: 409 }
      );
    }
    console.error("Cancel request error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to cancel request" },
      { status: 500 }
    );
  }
}
