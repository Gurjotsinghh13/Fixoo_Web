import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateOTP, hashOTP } from "@/lib/auth";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
} from "@/lib/security";

const REGISTRATION_ROLE = "partner_registration";

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json();
    const ip = getClientIp(req);

    if (typeof phone !== "string" || !/^[6-9]\d{9}$/.test(phone)) {
      return NextResponse.json(
        { success: false, error: "Valid 10-digit Indian mobile number required" },
        { status: 400 }
      );
    }

    const ipLimit = checkRateLimit(`partner-register-otp:ip:${ip}`, {
      limit: 10,
      windowMs: 10 * 60 * 1000,
      lockMs: 30 * 60 * 1000,
    });
    if (!ipLimit.ok) return rateLimitResponse(ipLimit.retryAfterSeconds);

    const phoneLimit = checkRateLimit(`partner-register-otp:${phone}`, {
      limit: 3,
      windowMs: 10 * 60 * 1000,
      lockMs: 30 * 60 * 1000,
    });
    if (!phoneLimit.ok) return rateLimitResponse(phoneLimit.retryAfterSeconds);

    const existing = await prisma.partner.findFirst({
      where: { tenantId: DEFAULT_TENANT_ID, phone },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "A partner account already exists with this phone number" },
        { status: 409 }
      );
    }

    const code = generateOTP();
    await prisma.$transaction([
      prisma.oTP.updateMany({
        where: {
          tenantId: DEFAULT_TENANT_ID,
          phone,
          role: REGISTRATION_ROLE,
          used: false,
        },
        data: { used: true },
      }),
      prisma.oTP.create({
        data: {
          tenantId: DEFAULT_TENANT_ID,
          phone,
          role: REGISTRATION_ROLE,
          code: hashOTP(phone, REGISTRATION_ROLE, code),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      }),
    ]);

    if (process.env.ENABLE_DEV_OTP === "true") {
      console.log("");
      console.log("=================================");
      console.log("FIXOO PARTNER REGISTRATION OTP");
      console.log("Phone:", phone);
      console.log("OTP:", code);
      console.log("=================================");
      console.log("");
    } else {
      const apiKey = process.env.MSG91_API_KEY;
      const templateId = process.env.MSG91_TEMPLATE_ID;
      if (!apiKey || !templateId) throw new Error("MSG91 credentials not configured");

      const response = await fetch("https://api.msg91.com/api/v5/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json", authkey: apiKey },
        body: JSON.stringify({
          template_id: templateId,
          mobile: `91${phone}`,
          otp: code,
        }),
      });
      if (!response.ok) throw new Error(`MSG91 error: ${response.status}`);
    }

    return NextResponse.json({
      success: true,
      message:
        process.env.ENABLE_DEV_OTP === "true"
          ? "OTP generated in development mode"
          : "OTP sent successfully",
      expiresIn: 300,
    });
  } catch (error) {
    console.error("Partner registration OTP error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to send registration OTP" },
      { status: 500 }
    );
  }
}
