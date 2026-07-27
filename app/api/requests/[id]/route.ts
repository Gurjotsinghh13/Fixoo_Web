import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getTenantId } from "@/lib/tenant";
import { requireAdmin, requireCustomer, requirePartner } from "@/lib/authorization";
import { expireOverdueRequestsForTenant } from "@/lib/request-lifecycle";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
      const authz = await requirePartner(req, { approved: true });
      if (!authz.ok) return authz.response;
    } else if (user.role === "admin") {
      const authz = await requireAdmin(req);
      if (!authz.ok) return authz.response;
    } else {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    await expireOverdueRequestsForTenant(tenantId, user.role === "customer" ? user.id : undefined);

    const request = await prisma.serviceRequest.findFirst({
      where: { id, tenantId },
      include: {
        user: { select: { id: true, phone: true, name: true } },
        partner: {
          select: {
            id: true,
            name: true,
            shopName: true,
            phone: true,
            rating: true,
            totalJobs: true,
            location: true,
          },
        },
        service: true,
        vehicleType: true,
        feedback: { select: { rating: true, comment: true, createdAt: true } },
      },
    });

    if (!request) {
      return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
    }

    // Authorization check
    if (user.role === "customer" && request.userId !== user.id) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    if (user.role === "partner" && request.partnerId !== user.id) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...request,
        serviceFee: Number(request.serviceFee),
        platformFee: Number(request.platformFee),
        nightSurcharge: Number(request.nightSurcharge),
        totalAmount: Number(request.totalAmount),
        feedback: request.feedback
          ? {
              rating: request.feedback.rating,
              comment: request.feedback.comment,
              createdAt: request.feedback.createdAt.toISOString(),
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Get request error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch request" },
      { status: 500 }
    );
  }
}
