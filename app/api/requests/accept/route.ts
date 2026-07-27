import { NextRequest, NextResponse } from "next/server";
import { acceptRequest } from "@/lib/dispatch";
import prisma from "@/lib/prisma";
import { requirePartner } from "@/lib/authorization";
import { checkRateLimit, rateLimitResponse } from "@/lib/security";

export async function POST(req: NextRequest) {
  try {
    const authz = await requirePartner(req, { approved: true });
    if (!authz.ok) return authz.response;
    const { tenantId, user } = authz;
    const actionLimit = checkRateLimit(`partner-accept:${tenantId}:${user.id}`, {
      limit: 30,
      windowMs: 60 * 1000,
      lockMs: 5 * 60 * 1000,
    });
    if (!actionLimit.ok) return rateLimitResponse(actionLimit.retryAfterSeconds);

    const body = await req.json();
    const { requestId } = body;

    if (!requestId) {
      return NextResponse.json(
        { success: false, error: "requestId is required" },
        { status: 400 }
      );
    }

    const broadcast = await prisma.partnerBroadcast.findFirst({
      where: {
        tenantId,
        requestId,
        partnerId: user.id,
      },
      select: { response: true },
    });

    if (!broadcast || broadcast.response) {
      return NextResponse.json(
        { success: false, error: "This request is not available to you" },
        { status: 403 }
      );
    }

    const accepted = await acceptRequest(requestId, user.id, tenantId);

    if (!accepted) {
      return NextResponse.json(
        { success: false, error: "Request already taken or expired" },
        { status: 409 }
      );
    }

    // Fetch accepted request details
    const request = await prisma.serviceRequest.findFirst({
      where: { id: requestId, tenantId },
      include: {
        user: { select: { phone: true, name: true } },
        service: true,
        vehicleType: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        requestId,
        customerPhone: request?.user.phone,
        customerName: request?.user.name,
        customerLatitude: request?.latitude,
        customerLongitude: request?.longitude,
        address: request?.address,
        area: request?.area,
        serviceName: request?.service.displayName,
        vehicleType: request?.vehicleType.displayName,
        earning: Number(request?.serviceFee),
      },
    });
  } catch (error) {
    console.error("Accept request error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to accept request" },
      { status: 500 }
    );
  }
}
