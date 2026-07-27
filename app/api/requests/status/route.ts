import { NextRequest, NextResponse } from "next/server";
import { emitToCustomer, emitToAdmin } from "@/server/emitter";
import prisma from "@/lib/prisma";
import type { RequestStatus } from "@/types";
import { requirePartner } from "@/lib/authorization";
import { checkRateLimit, rateLimitResponse } from "@/lib/security";

const PARTNER_ALLOWED_TRANSITIONS: Record<string, RequestStatus[]> = {
  ACCEPTED: ["ON_THE_WAY"],
  ON_THE_WAY: ["ARRIVED"],
  ARRIVED: ["REPAIR_IN_PROGRESS"],
  REPAIR_IN_PROGRESS: ["COMPLETED"],
};

export async function PATCH(req: NextRequest) {
  try {
    const authz = await requirePartner(req, { approved: true });
    if (!authz.ok) return authz.response;
    const { tenantId, user } = authz;
    const actionLimit = checkRateLimit(`partner-status:${tenantId}:${user.id}`, {
      limit: 40,
      windowMs: 60 * 1000,
      lockMs: 5 * 60 * 1000,
    });
    if (!actionLimit.ok) return rateLimitResponse(actionLimit.retryAfterSeconds);

    const body = await req.json();
    const { requestId, status } = body;

    if (!requestId || !status) {
      return NextResponse.json(
        { success: false, error: "requestId and status are required" },
        { status: 400 }
      );
    }

    const request = await prisma.serviceRequest.findFirst({
      where: { id: requestId, tenantId },
      select: { status: true, userId: true, partnerId: true, serviceFee: true },
    });

    if (!request) {
      return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
    }

    if (request.partnerId !== user.id) {
      return NextResponse.json({ success: false, error: "Not your request" }, { status: 403 });
    }

    const allowed = PARTNER_ALLOWED_TRANSITIONS[request.status];
    if (!allowed?.includes(status)) {
      return NextResponse.json(
        { success: false, error: `Cannot transition from ${request.status} to ${status}` },
        { status: 400 }
      );
    }

    // Build timestamp fields
    const timestampFields: Record<string, Date> = {};
    if (status === "ON_THE_WAY") timestampFields.onTheWayAt = new Date();
    if (status === "ARRIVED") timestampFields.arrivedAt = new Date();
    if (status === "REPAIR_IN_PROGRESS") timestampFields.startedAt = new Date();
    if (status === "COMPLETED") timestampFields.completedAt = new Date();

    await prisma.$transaction(
      async (tx) => {
        const changed = await tx.serviceRequest.updateMany({
          where: { id: requestId, tenantId, partnerId: user.id, status: request.status },
          data: { status, ...timestampFields },
        });

        if (changed.count !== 1) {
          throw new Error("REQUEST_STATUS_CONFLICT");
        }

        await tx.requestStatusHistory.create({
          data: {
            tenantId,
            requestId,
            fromStatus: request.status,
            toStatus: status,
            actorRole: "partner",
            actorId: user.id,
          },
        });

        await tx.notification.create({
          data: {
            tenantId,
            userId: request.userId,
            requestId,
            type: `REQUEST_${status}`,
            title: status === "COMPLETED" ? "Repair completed" : "Request updated",
            body:
              status === "COMPLETED"
                ? "Your roadside assistance request has been completed."
                : `Your request status is now ${status.replaceAll("_", " ").toLowerCase()}.`,
          },
        });

        if (status !== "COMPLETED") return;

        const updated = await tx.serviceRequest.findFirstOrThrow({
          where: { id: requestId, tenantId },
        });

        await tx.transaction.upsert({
          where: { tenantId_requestId: { tenantId, requestId } },
          update: {},
          create: {
            tenantId,
            requestId,
            partnerId: user.id,
            totalAmount: updated.totalAmount,
            platformFee: updated.platformFee,
            partnerEarning: updated.totalAmount.minus(updated.platformFee),
            status: "PENDING_PAYMENT",
          },
        });

        await tx.partner.updateMany({
          where: { id: user.id, tenantId },
          data: { completedJobs: { increment: 1 }, lastCompletedAt: new Date() },
        });

        await tx.partnerActivity.create({
          data: {
            tenantId,
            partnerId: user.id,
            type: "COMPLETED_REQUEST",
            note: "Request completed",
            metadata: { requestId },
          },
        });
      },
      { maxWait: 30_000, timeout: 30_000 }
    );

    // Emit to customer
    emitToCustomer(request.userId, "request:status", {
      requestId,
      status,
      timestamp: new Date().toISOString(),
    });
    emitToCustomer(request.userId, `request:${status.toLowerCase()}`, {
      requestId,
      status,
      timestamp: new Date().toISOString(),
    });

    // Emit to admin
    emitToAdmin("admin:request_status", { requestId, status, partnerId: user.id }, tenantId);

    return NextResponse.json({
      success: true,
      data: { requestId, status },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_STATUS_CONFLICT") {
      return NextResponse.json(
        { success: false, error: "Request status changed. Please refresh and try again." },
        { status: 409 }
      );
    }
    console.error("Status update error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update status" },
      { status: 500 }
    );
  }
}
