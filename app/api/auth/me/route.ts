import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest, COOKIE_NAME } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getTenantId } from "@/lib/tenant";
import { isTenantAdminRole } from "@/lib/authorization";

export async function GET(req: NextRequest) {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    const tenantId = getTenantId(user.tenantId);

    // Fetch fresh data from DB
    if (user.role === "customer") {
      const dbUser = await prisma.user.findFirst({ where: { id: user.id, tenantId } });
      if (!dbUser || !dbUser.isActive) {
        return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        data: { id: dbUser.id, phone: dbUser.phone, name: dbUser.name, role: "customer", tenantId },
      });
    }

    if (user.role === "partner") {
      const partner = await prisma.partner.findFirst({
        where: { id: user.id, tenantId },
        include: { location: true },
      });
      if (!partner) {
        return NextResponse.json({ success: false, error: "Partner not found" }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        data: {
          id: partner.id,
          phone: partner.phone,
          name: partner.name,
          shopName: partner.shopName,
          isApproved: partner.isApproved,
          isSuspended: partner.isSuspended,
          applicationStatus: partner.applicationStatus,
          applicationNotes: partner.applicationNotes,
          applicationNumber: partner.id,
          isOnline: partner.isOnline,
          location: partner.location
            ? {
                latitude: partner.location.latitude,
                longitude: partner.location.longitude,
              }
            : null,
          role: "partner",
          tenantId,
        },
      });
    }

    if (user.role === "admin") {
      const admin = await prisma.admin.findFirst({ where: { id: user.id, tenantId, isActive: true } });
      if (!admin) {
        return NextResponse.json({ success: false, error: "Admin not found" }, { status: 404 });
      }
      const adminRole = isTenantAdminRole(admin.role) ? admin.role : "STAFF";
      return NextResponse.json({
        success: true,
        data: { id: admin.id, phone: admin.phone, name: admin.name, role: "admin", adminRole, tenantId },
      });
    }

    return NextResponse.json({ success: false, error: "Invalid role" }, { status: 400 });
  } catch (error) {
    console.error("Auth me error:", error);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
