import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/authorization";

export async function GET(req: NextRequest) {
  try {
    const authz = await requireAdmin(req);
    if (!authz.ok) return authz.response;
    const { tenantId } = authz;

    const services = await prisma.service.findMany({
      where: { tenantId },
      orderBy: { displayName: "asc" },
      include: {
        _count: {
          select: { pricing: true, requests: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: services,
    });
  } catch (error) {
    console.error("Services GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch services" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authz = await requireAdmin(req);
    if (!authz.ok) return authz.response;
    const { tenantId, user } = authz;

    const body = await req.json();
    const { name, displayName, description, icon, category } = body;

    const nameStr = typeof name === "string" ? name.trim().toUpperCase().replace(/\s+/g, "_") : "";
    const displayNameStr = typeof displayName === "string" ? displayName.trim() : "";

    if (!nameStr || !displayNameStr) {
      return NextResponse.json(
        { success: false, error: "Service identifier name and display name are required" },
        { status: 400 }
      );
    }

    const existing = await prisma.service.findFirst({
      where: { tenantId, name: nameStr },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "A service with this key already exists" },
        { status: 409 }
      );
    }

    const service = await prisma.service.create({
      data: {
        tenantId,
        name: nameStr,
        displayName: displayNameStr,
        description: typeof description === "string" ? description.trim() : null,
        icon: typeof icon === "string" ? icon.trim() : "🔧",
        category: typeof category === "string" ? category.trim().toUpperCase() : "ROADSIDE",
        isActive: true,
      },
    });

    await prisma.activityLog.create({
      data: {
        tenantId,
        adminId: user.id,
        action: "create_service",
        entity: "service",
        entityId: service.id,
        metadata: body,
      },
    });

    return NextResponse.json({ success: true, data: service });
  } catch (error) {
    console.error("Services POST error:", error);
    return NextResponse.json({ success: false, error: "Failed to create service" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authz = await requireAdmin(req);
    if (!authz.ok) return authz.response;
    const { tenantId, user } = authz;

    const body = await req.json();
    const { id, displayName, description, icon, category, isActive } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ success: false, error: "Service ID required" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (typeof displayName === "string" && displayName.trim()) {
      data.displayName = displayName.trim();
    }
    if (description !== undefined) {
      data.description = typeof description === "string" ? description.trim() || null : null;
    }
    if (typeof icon === "string") {
      data.icon = icon.trim() || "🔧";
    }
    if (typeof category === "string" && category.trim()) {
      data.category = category.trim().toUpperCase();
    }
    if (isActive !== undefined) {
      data.isActive = Boolean(isActive);
    }

    const updated = await prisma.service.updateMany({
      where: { id, tenantId },
      data,
    });

    if (updated.count !== 1) {
      return NextResponse.json({ success: false, error: "Service not found" }, { status: 404 });
    }

    const result = await prisma.service.findFirstOrThrow({ where: { id, tenantId } });

    await prisma.activityLog.create({
      data: {
        tenantId,
        adminId: user.id,
        action: "update_service",
        entity: "service",
        entityId: id,
        metadata: body,
      },
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Services PATCH error:", error);
    return NextResponse.json({ success: false, error: "Failed to update service" }, { status: 500 });
  }
}
