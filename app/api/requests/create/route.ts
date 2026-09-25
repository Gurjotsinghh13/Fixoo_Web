import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { isNightTime } from "@/lib/auth";
import { dispatchRequest } from "@/lib/dispatch";
import { parseLatitude, parseLongitude } from "@/lib/validation";
import { requireCustomer } from "@/lib/authorization";
import { expireOverdueRequestsForTenant, getActiveRequestStatuses } from "@/lib/request-lifecycle";
import { emitToCustomer } from "@/server/emitter";
import { recordRequestHistory } from "@/lib/request-history";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/security";

function activeRequestConflict(requestId?: string) {
  return NextResponse.json(
    { success: false, error: "You already have an active request", requestId },
    { status: 409 }
  );
}

export async function POST(req: NextRequest) {
  try {
    const authz = await requireCustomer(req);
    if (!authz.ok) return authz.response;
    const { tenantId, user } = authz;
    const createLimit = checkRateLimit(`request-create:${tenantId}:${user.id}:${getClientIp(req)}`, {
      limit: 5,
      windowMs: 10 * 60 * 1000,
      lockMs: 15 * 60 * 1000,
    });
    if (!createLimit.ok) return rateLimitResponse(createLimit.retryAfterSeconds);

    const body = await req.json();
    const { serviceId, vehicleTypeId, latitude, longitude, address, area } = body;

    const parsedLatitude = parseLatitude(latitude);
    const parsedLongitude = parseLongitude(longitude);

    if (!serviceId || !vehicleTypeId || parsedLatitude === null || parsedLongitude === null) {
      return NextResponse.json(
        { success: false, error: "Valid serviceId, vehicleTypeId, latitude and longitude are required" },
        { status: 400 }
      );
    }

    await expireOverdueRequestsForTenant(tenantId, user.id);

    // Check for active request
    const activeRequest = await prisma.serviceRequest.findFirst({
      where: {
        tenantId,
        userId: user.id,
        status: { in: getActiveRequestStatuses() },
      },
    });

    if (activeRequest) {
      return activeRequestConflict(activeRequest.id);
    }

    // Get pricing
    const pricing = await prisma.servicePricing.findFirst({
      where: { tenantId, serviceId, vehicleTypeId },
      include: { service: true, vehicleType: true },
    });

    if (!pricing || !pricing.isActive || !pricing.service.isActive || !pricing.vehicleType.isActive) {
      return NextResponse.json(
        { success: false, error: "Service not available" },
        { status: 400 }
      );
    }

    const night = isNightTime();
    const serviceFee = Number(pricing.serviceFee);
    const platformFee = Number(pricing.platformFee);
    const nightSurcharge = night ? Number(pricing.nightSurcharge) : 0;
    const totalAmount = serviceFee + platformFee + nightSurcharge;

    // Create request. The one_active_request_per_user partial unique index rejects
    // a concurrent create that slipped past the findFirst check above.
    let request;
    try {
      request = await prisma.serviceRequest.create({
        data: {
          tenantId,
          userId: user.id,
          serviceId,
          vehicleTypeId,
          latitude: parsedLatitude,
          longitude: parsedLongitude,
          address: address || null,
          area: area || null,
          serviceFee,
          platformFee,
          nightSurcharge,
          totalAmount,
          status: "REQUESTED",
          expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min total
        },
        include: {
          service: true,
          vehicleType: true,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const winner = await prisma.serviceRequest.findFirst({
          where: {
            tenantId,
            userId: user.id,
            status: { in: getActiveRequestStatuses() },
          },
          select: { id: true },
        });
        return activeRequestConflict(winner?.id);
      }
      throw error;
    }

    // Trigger dispatch asynchronously
    emitToCustomer(user.id, "request:created", {
      requestId: request.id,
      status: request.status,
    });
    recordRequestHistory({
      tenantId,
      requestId: request.id,
      toStatus: request.status,
      actorRole: "customer",
      actorId: user.id,
    });

    dispatchRequest(request.id, tenantId).catch((err) => {
      console.error("Dispatch error for request", request.id, err);
    });

    return NextResponse.json({
      success: true,
      data: {
        requestId: request.id,
        status: request.status,
        serviceFee,
        platformFee,
        nightSurcharge,
        totalAmount,
        etaMin: pricing.etaMin,
        etaMax: pricing.etaMax,
        isNight: night,
        service: request.service,
        vehicleType: request.vehicleType,
      },
    });
  } catch (error) {
    console.error("Create request error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create request" },
      { status: 500 }
    );
  }
}
