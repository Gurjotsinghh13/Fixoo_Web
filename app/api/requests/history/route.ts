import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireCustomer } from "@/lib/authorization";
import { expireOverdueRequestsForTenant } from "@/lib/request-lifecycle";

export async function GET(req: NextRequest) {
  try {
    const authz = await requireCustomer(req);
    if (!authz.ok) return authz.response;
    const { tenantId, user } = authz;

    await expireOverdueRequestsForTenant(tenantId, user.id);

    const requests = await prisma.serviceRequest.findMany({
      where: { tenantId, userId: user.id },
      include: {
        service: true,
        vehicleType: true,
        partner: { select: { name: true, shopName: true, rating: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({
      success: true,
      data: requests.map((r) => ({
        id: r.id,
        status: r.status,
        service: r.service,
        vehicleType: r.vehicleType,
        partner: r.partner,
        totalAmount: Number(r.totalAmount),
        area: r.area,
        address: r.address,
        createdAt: r.createdAt.toISOString(),
        completedAt: r.completedAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error("History error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch history" }, { status: 500 });
  }
}
