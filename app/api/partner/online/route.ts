import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { parseLatitude, parseLongitude } from "@/lib/validation";
import { requirePartner } from "@/lib/authorization";
import { checkRateLimit, rateLimitResponse } from "@/lib/security";
import { APPROVED_PARTNER_WHERE } from "@/lib/partner-approval";

const DEFAULT_PARTNER_LOCATION = {
  latitude: 25.2138,
  longitude: 75.8648,
};

export async function POST(req: NextRequest) {
  try {
    const authz = await requirePartner(req, { approved: true });
    if (!authz.ok) return authz.response;
    const { tenantId, user } = authz;
    const onlineLimit = checkRateLimit(`partner-online:${tenantId}:${user.id}`, {
      limit: 20,
      windowMs: 60 * 1000,
      lockMs: 5 * 60 * 1000,
    });
    if (!onlineLimit.ok) return rateLimitResponse(onlineLimit.retryAfterSeconds);

    const body = await req.json();
    const { isOnline, latitude, longitude } = body;

    let parsedLatitude = parseLatitude(latitude);
    let parsedLongitude = parseLongitude(longitude);

    if (Boolean(isOnline) && (parsedLatitude === null || parsedLongitude === null)) {
      parsedLatitude = DEFAULT_PARTNER_LOCATION.latitude;
      parsedLongitude = DEFAULT_PARTNER_LOCATION.longitude;
    }

    const goingOnline = Boolean(isOnline);

    const updated = await prisma.partner.updateMany({
      where: { id: user.id, tenantId, ...APPROVED_PARTNER_WHERE },
      data: { isOnline: goingOnline, lastOnlineAt: goingOnline ? new Date() : undefined },
    });
    if (updated.count !== 1) {
      return NextResponse.json(
        { success: false, error: "Partner is not approved for marketplace access" },
        { status: 403 }
      );
    }

    if (goingOnline) {
      await prisma.partnerActivity.create({
        data: { tenantId, partnerId: user.id, type: "ONLINE", note: "Partner went online" },
      });
    }

    if (parsedLatitude !== null && parsedLongitude !== null) {
      await prisma.partnerLocation.upsert({
        where: { tenantId_partnerId: { tenantId, partnerId: user.id } },
        update: { latitude: parsedLatitude, longitude: parsedLongitude, lastSeenAt: new Date() },
        create: {
          tenantId,
          partnerId: user.id,
          latitude: parsedLatitude,
          longitude: parsedLongitude,
          lastSeenAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: { isOnline: goingOnline },
    });
  } catch (error) {
    console.error("Online toggle error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update status" },
      { status: 500 }
    );
  }
}
