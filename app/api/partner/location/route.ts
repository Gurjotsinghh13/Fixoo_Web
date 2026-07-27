import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePartner } from "@/lib/authorization";
import { parseLatitude, parseLongitude } from "@/lib/validation";
import { checkRateLimit, rateLimitResponse } from "@/lib/security";

function optionalNumber(value: unknown, min: number, max: number) {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) return null;
  return numeric;
}

export async function POST(req: NextRequest) {
  try {
    const authz = await requirePartner(req, { approved: true });
    if (!authz.ok) return authz.response;
    const { tenantId, user } = authz;
    const locationLimit = checkRateLimit(`partner-location:${tenantId}:${user.id}`, {
      limit: 60,
      windowMs: 60 * 1000,
      lockMs: 5 * 60 * 1000,
    });
    if (!locationLimit.ok) return rateLimitResponse(locationLimit.retryAfterSeconds);
    const body = await req.json();

    const latitude = parseLatitude(body.latitude);
    const longitude = parseLongitude(body.longitude);
    if (latitude === null || longitude === null) {
      return NextResponse.json(
        { success: false, error: "Valid latitude and longitude are required" },
        { status: 400 }
      );
    }

    const location = await prisma.partnerLocation.upsert({
      where: { tenantId_partnerId: { tenantId, partnerId: user.id } },
      update: {
        latitude,
        longitude,
        accuracy: optionalNumber(body.accuracy, 0, 10000),
        heading: optionalNumber(body.heading, 0, 360),
        speed: optionalNumber(body.speed, 0, 200),
        lastSeenAt: new Date(),
      },
      create: {
        tenantId,
        partnerId: user.id,
        latitude,
        longitude,
        accuracy: optionalNumber(body.accuracy, 0, 10000),
        heading: optionalNumber(body.heading, 0, 360),
        speed: optionalNumber(body.speed, 0, 200),
        lastSeenAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        heading: location.heading,
        speed: location.speed,
        lastSeenAt: location.lastSeenAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Partner location update error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update partner location" },
      { status: 500 }
    );
  }
}
