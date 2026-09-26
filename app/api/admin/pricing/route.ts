import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { parseMoney, parsePositiveInt } from "@/lib/validation";
import { requireAdmin } from "@/lib/authorization";

export async function GET(req: NextRequest) {
  try {
    const authz = await requireAdmin(req);
    if (!authz.ok) return authz.response;
    const { tenantId } = authz;

    const pricing = await prisma.servicePricing.findMany({
      where: { tenantId },
      include: { service: true, vehicleType: true },
      orderBy: [{ service: { name: "asc" } }, { vehicleType: { sortOrder: "asc" } }],
    });

    return NextResponse.json({
      success: true,
      data: pricing.map((p) => ({
        id: p.id,
        serviceId: p.serviceId,
        vehicleTypeId: p.vehicleTypeId,
        serviceFee: Number(p.serviceFee),
        platformFee: Number(p.platformFee),
        nightSurcharge: Number(p.nightSurcharge),
        etaMin: p.etaMin,
        etaMax: p.etaMax,
        isActive: p.isActive,
        service: p.service,
        vehicleType: p.vehicleType,
      })),
    });
  } catch (error) {
    console.error("Pricing GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch pricing" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authz = await requireAdmin(req);
    if (!authz.ok) return authz.response;
    const { tenantId, user } = authz;

    const body = await req.json();
    const { id, serviceFee, platformFee, nightSurcharge, etaMin, etaMax, isActive } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "Pricing ID required" }, { status: 400 });
    }

    const data: Record<string, number | boolean> = {};

    if (serviceFee !== undefined) {
      const value = parseMoney(serviceFee);
      if (value === null) return NextResponse.json({ success: false, error: "Invalid serviceFee" }, { status: 400 });
      data.serviceFee = value;
    }
    if (platformFee !== undefined) {
      const value = parseMoney(platformFee);
      if (value === null) return NextResponse.json({ success: false, error: "Invalid platformFee" }, { status: 400 });
      data.platformFee = value;
    }
    if (nightSurcharge !== undefined) {
      const value = parseMoney(nightSurcharge);
      if (value === null) return NextResponse.json({ success: false, error: "Invalid nightSurcharge" }, { status: 400 });
      data.nightSurcharge = value;
    }
    if (etaMin !== undefined) {
      const value = parsePositiveInt(etaMin);
      if (value === null) return NextResponse.json({ success: false, error: "Invalid etaMin" }, { status: 400 });
      data.etaMin = value;
    }
    if (etaMax !== undefined) {
      const value = parsePositiveInt(etaMax);
      if (value === null) return NextResponse.json({ success: false, error: "Invalid etaMax" }, { status: 400 });
      data.etaMax = value;
    }
    if (isActive !== undefined) data.isActive = Boolean(isActive);

    const existing = await prisma.servicePricing.findFirst({ where: { id, tenantId } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Pricing record not found" }, { status: 404 });
    }

    const newEtaMin = data.etaMin !== undefined ? (data.etaMin as number) : existing.etaMin;
    const newEtaMax = data.etaMax !== undefined ? (data.etaMax as number) : existing.etaMax;
    if (newEtaMin > newEtaMax) {
      return NextResponse.json(
        { success: false, error: "Minimum ETA cannot be greater than Maximum ETA" },
        { status: 400 }
      );
    }

    const changed = await prisma.servicePricing.updateMany({
      where: { id, tenantId },
      data,
    });

    if (changed.count !== 1) {
      return NextResponse.json({ success: false, error: "Pricing not found" }, { status: 404 });
    }

    const updated = await prisma.servicePricing.findFirstOrThrow({
      where: { id, tenantId },
    });

    await prisma.activityLog.create({
      data: {
        tenantId,
        adminId: user.id,
        action: "update_pricing",
        entity: "pricing",
        entityId: id,
        metadata: body,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        serviceFee: Number(updated.serviceFee),
        platformFee: Number(updated.platformFee),
        nightSurcharge: Number(updated.nightSurcharge),
      },
    });
  } catch (error) {
    console.error("Pricing PATCH error:", error);
    return NextResponse.json({ success: false, error: "Failed to update pricing" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authz = await requireAdmin(req);
    if (!authz.ok) return authz.response;
    const { tenantId, user } = authz;

    const body = await req.json();
    const { serviceId, vehicleTypeId, serviceFee, platformFee, nightSurcharge, etaMin, etaMax } = body;

    if (!serviceId || !vehicleTypeId) {
      return NextResponse.json(
        { success: false, error: "serviceId and vehicleTypeId are required" },
        { status: 400 }
      );
    }

    const parsedServiceFee = parseMoney(serviceFee ?? 0);
    const parsedPlatformFee = parseMoney(platformFee ?? 0);
    const parsedNightSurcharge = parseMoney(nightSurcharge ?? 0);
    const parsedEtaMin = parsePositiveInt(etaMin ?? 10);
    const parsedEtaMax = parsePositiveInt(etaMax ?? 20);

    if (
      parsedServiceFee === null ||
      parsedPlatformFee === null ||
      parsedNightSurcharge === null ||
      parsedEtaMin === null ||
      parsedEtaMax === null
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid pricing numerical inputs" },
        { status: 400 }
      );
    }

    if (parsedEtaMin > parsedEtaMax) {
      return NextResponse.json(
        { success: false, error: "Minimum ETA cannot be greater than Maximum ETA" },
        { status: 400 }
      );
    }

    const serviceExists = await prisma.service.findFirst({ where: { id: serviceId, tenantId } });
    const vehicleExists = await prisma.vehicleType.findFirst({ where: { id: vehicleTypeId, tenantId } });

    if (!serviceExists || !vehicleExists) {
      return NextResponse.json(
        { success: false, error: "Selected service or vehicle type does not exist" },
        { status: 404 }
      );
    }

    const pricing = await prisma.servicePricing.upsert({
      where: {
        tenantId_serviceId_vehicleTypeId: { tenantId, serviceId, vehicleTypeId },
      },
      update: {
        serviceFee: parsedServiceFee,
        platformFee: parsedPlatformFee,
        nightSurcharge: parsedNightSurcharge,
        etaMin: parsedEtaMin,
        etaMax: parsedEtaMax,
        isActive: true,
      },
      create: {
        tenantId,
        serviceId,
        vehicleTypeId,
        serviceFee: parsedServiceFee,
        platformFee: parsedPlatformFee,
        nightSurcharge: parsedNightSurcharge,
        etaMin: parsedEtaMin,
        etaMax: parsedEtaMax,
        isActive: true,
      },
      include: { service: true, vehicleType: true },
    });

    await prisma.activityLog.create({
      data: {
        tenantId,
        adminId: user.id,
        action: "create_pricing",
        entity: "pricing",
        entityId: pricing.id,
        metadata: body,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...pricing,
        serviceFee: Number(pricing.serviceFee),
        platformFee: Number(pricing.platformFee),
        nightSurcharge: Number(pricing.nightSurcharge),
      },
    });
  } catch (error) {
    console.error("Pricing POST error:", error);
    return NextResponse.json({ success: false, error: "Failed to create pricing" }, { status: 500 });
  }
}

