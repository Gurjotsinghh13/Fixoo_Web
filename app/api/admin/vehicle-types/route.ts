import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/authorization";
import { parsePositiveInt } from "@/lib/validation";

export async function GET(req: NextRequest) {
  try {
    const authz = await requireAdmin(req);
    if (!authz.ok) return authz.response;
    const { tenantId } = authz;

    const vehicleTypes = await prisma.vehicleType.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }],
      include: {
        _count: {
          select: { pricing: true, requests: true, partnerTypes: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: vehicleTypes,
    });
  } catch (error) {
    console.error("Vehicle types GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch vehicle types" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authz = await requireAdmin(req);
    if (!authz.ok) return authz.response;
    const { tenantId, user } = authz;

    const body = await req.json();
    const { name, displayName, icon, sortOrder } = body;

    const nameStr = typeof name === "string" ? name.trim().toUpperCase().replace(/\s+/g, "_") : "";
    const displayNameStr = typeof displayName === "string" ? displayName.trim() : "";

    if (!nameStr || !displayNameStr) {
      return NextResponse.json(
        { success: false, error: "Vehicle type key name and display name are required" },
        { status: 400 }
      );
    }

    const existing = await prisma.vehicleType.findFirst({
      where: { tenantId, name: nameStr },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "A vehicle type with this key already exists" },
        { status: 409 }
      );
    }

    const vehicleType = await prisma.vehicleType.create({
      data: {
        tenantId,
        name: nameStr,
        displayName: displayNameStr,
        icon: typeof icon === "string" ? icon.trim() : "🚗",
        sortOrder: parsePositiveInt(sortOrder) ?? 0,
        isActive: true,
      },
    });

    await prisma.activityLog.create({
      data: {
        tenantId,
        adminId: user.id,
        action: "create_vehicle_type",
        entity: "vehicle_type",
        entityId: vehicleType.id,
        metadata: body,
      },
    });

    return NextResponse.json({ success: true, data: vehicleType });
  } catch (error) {
    console.error("Vehicle types POST error:", error);
    return NextResponse.json({ success: false, error: "Failed to create vehicle type" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authz = await requireAdmin(req);
    if (!authz.ok) return authz.response;
    const { tenantId, user } = authz;

    const body = await req.json();
    const { id, displayName, icon, sortOrder, isActive } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ success: false, error: "Vehicle type ID required" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (typeof displayName === "string" && displayName.trim()) {
      data.displayName = displayName.trim();
    }
    if (typeof icon === "string") {
      data.icon = icon.trim() || "🚗";
    }
    if (sortOrder !== undefined) {
      const parsedOrder = parsePositiveInt(sortOrder);
      if (parsedOrder !== null) data.sortOrder = parsedOrder;
    }
    if (isActive !== undefined) {
      data.isActive = Boolean(isActive);
    }

    const updated = await prisma.vehicleType.updateMany({
      where: { id, tenantId },
      data,
    });

    if (updated.count !== 1) {
      return NextResponse.json({ success: false, error: "Vehicle type not found" }, { status: 404 });
    }

    const result = await prisma.vehicleType.findFirstOrThrow({ where: { id, tenantId } });

    await prisma.activityLog.create({
      data: {
        tenantId,
        adminId: user.id,
        action: "update_vehicle_type",
        entity: "vehicle_type",
        entityId: id,
        metadata: body,
      },
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Vehicle types PATCH error:", error);
    return NextResponse.json({ success: false, error: "Failed to update vehicle type" }, { status: 500 });
  }
}
