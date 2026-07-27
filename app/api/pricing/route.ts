import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isNightTime } from "@/lib/auth";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const vehicleTypeId = searchParams.get("vehicleTypeId");
    const serviceId = searchParams.get("serviceId");
    const tenantId = DEFAULT_TENANT_ID;

    if (!vehicleTypeId || !serviceId) {
      // Return all pricing
      const allPricing = await prisma.servicePricing.findMany({
        where: { tenantId, isActive: true },
        include: { service: true, vehicleType: true },
      });

      return NextResponse.json({ success: true, data: allPricing });
    }

    const pricing = await prisma.servicePricing.findFirst({
      where: { tenantId, serviceId, vehicleTypeId, isActive: true },
      include: {
        service: true,
        vehicleType: true,
      },
    });

    if (!pricing || !pricing.service.isActive || !pricing.vehicleType.isActive) {
      return NextResponse.json(
        { success: false, error: "Pricing not found for this combination" },
        { status: 404 }
      );
    }

    const night = isNightTime();
    const serviceFee = Number(pricing.serviceFee);
    const platformFee = Number(pricing.platformFee);
    const nightSurcharge = night ? Number(pricing.nightSurcharge) : 0;
    const totalAmount = serviceFee + platformFee + nightSurcharge;

    return NextResponse.json({
      success: true,
      data: {
        id: pricing.id,
        serviceId: pricing.serviceId,
        vehicleTypeId: pricing.vehicleTypeId,
        serviceFee,
        platformFee,
        nightSurcharge,
        totalAmount,
        etaMin: pricing.etaMin,
        etaMax: pricing.etaMax,
        isNight: night,
        service: pricing.service,
        vehicleType: pricing.vehicleType,
      },
    });
  } catch (error) {
    console.error("Pricing error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch pricing" },
      { status: 500 }
    );
  }
}
