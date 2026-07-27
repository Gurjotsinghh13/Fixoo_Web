import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hashOTP } from "@/lib/auth";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";
import { signPartnerRegistrationToken } from "@/lib/partner-registration-token";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
} from "@/lib/security";

const REGISTRATION_ROLE = "partner_registration";

export async function POST(req: NextRequest) {
  try {
    const { phone, code } = await req.json();
    if (
      typeof phone !== "string" ||
      !/^[6-9]\d{9}$/.test(phone) ||
      typeof code !== "string" ||
      !/^\d{6}$/.test(code)
    ) {
      return NextResponse.json(
        { success: false, error: "Valid phone and OTP are required" },
        { status: 400 }
      );
    }

    const limit = checkRateLimit(
      `partner-register-verify:${phone}:${getClientIp(req)}`,
      { limit: 8, windowMs: 10 * 60 * 1000, lockMs: 15 * 60 * 1000 }
    );
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const otp = await prisma.oTP.findFirst({
      where: {
        tenantId: DEFAULT_TENANT_ID,
        phone,
        role: REGISTRATION_ROLE,
        code: hashOTP(phone, REGISTRATION_ROLE, code),
        used: false,
        attempts: { lt: 5 },
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otp) {
      await prisma.oTP.updateMany({
        where: {
          tenantId: DEFAULT_TENANT_ID,
          phone,
          role: REGISTRATION_ROLE,
          used: false,
          expiresAt: { gt: new Date() },
        },
        data: { attempts: { increment: 1 } },
      });
      return NextResponse.json(
        { success: false, error: "Invalid or expired OTP" },
        { status: 401 }
      );
    }

    const consumed = await prisma.oTP.updateMany({
      where: { id: otp.id, used: false, attempts: { lt: 5 } },
      data: { used: true },
    });
    if (consumed.count !== 1) {
      return NextResponse.json(
        { success: false, error: "OTP already used" },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { registrationToken: signPartnerRegistrationToken(phone) },
    });
  } catch (error) {
    console.error("Partner registration OTP verification error:", error);
    return NextResponse.json(
      { success: false, error: "OTP verification failed" },
      { status: 500 }
    );
  }
}
