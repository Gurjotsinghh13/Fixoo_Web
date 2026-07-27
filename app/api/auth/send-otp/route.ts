import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateOTP, hashOTP } from "@/lib/auth";
import { checkDatabaseHealth } from "@/lib/database-health";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/security";
import type { UserRole } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone, role } = body;
    const tenantId = DEFAULT_TENANT_ID;
    const ip = getClientIp(req);

    if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
      return NextResponse.json(
        { success: false, error: "Valid 10-digit Indian mobile number required" },
        { status: 400 }
      );
    }

    if (!["customer", "partner", "admin"].includes(role)) {
      return NextResponse.json(
        { success: false, error: "Invalid role" },
        { status: 400 }
      );
    }

    const userRole = role as UserRole;

    const ipLimit = checkRateLimit(`otp-send:ip:${ip}`, {
      limit: 20,
      windowMs: 10 * 60 * 1000,
      lockMs: 30 * 60 * 1000,
    });
    if (!ipLimit.ok) return rateLimitResponse(ipLimit.retryAfterSeconds);

    const phoneLimit = checkRateLimit(`otp-send:${tenantId}:${userRole}:${phone}`, {
      limit: 3,
      windowMs: 10 * 60 * 1000,
      lockMs: 30 * 60 * 1000,
    });
    if (!phoneLimit.ok) return rateLimitResponse(phoneLimit.retryAfterSeconds);

    const recentOtpCount = await prisma.oTP.count({
      where: {
        tenantId,
        phone,
        role: userRole,
        createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
      },
    });

    if (recentOtpCount >= 3) {
      return rateLimitResponse(30 * 60);
    }

    if (userRole === "partner") {
      const partner = await prisma.partner.findFirst({
        where: { tenantId, phone },
        select: { id: true },
      });

      if (!partner) {
        return NextResponse.json(
          { success: false, error: "Partner account not found. Please register first." },
          { status: 404 }
        );
      }

    }

    if (userRole === "admin") {
      const admin = await prisma.admin.findFirst({
        where: { tenantId, phone, isActive: true },
        select: { id: true },
      });

      if (!admin) {
        return NextResponse.json({
          success: true,
          message: "If the account exists, an OTP has been sent.",
          expiresIn: 300,
        });
      }
    }

    // Generate OTP
    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Invalidate existing OTPs for this phone
    await prisma.oTP.updateMany({
      where: { tenantId, phone, role: userRole, used: false },
      data: { used: true },
    });

    // Create new OTP
    await prisma.oTP.create({
      data: { tenantId, phone, code: hashOTP(phone, userRole, code), role: userRole, expiresAt },
    });

    if (process.env.ENABLE_DEV_OTP === "true") {
      console.log("");
      console.log("=================================");
      console.log("FIXOO DEV OTP");
      console.log("Phone:", phone);
      console.log("OTP:", code);
      console.log("=================================");
      console.log("");

      return NextResponse.json({
        success: true,
        message: "OTP generated in development mode",
        expiresIn: 300,
      });
    }

    await sendSMS(phone, code);

    return NextResponse.json({
      success: true,
      message: "OTP sent successfully",
      expiresIn: 300,
    });
  } catch (error) {
    console.error("Send OTP error:", error);

    if (process.env.NODE_ENV === "development") {
      const dbHealth = await checkDatabaseHealth();
      return NextResponse.json(
        {
          success: false,
          error: "Failed to send OTP because the database is not reachable",
          database: {
            ok: dbHealth.ok,
            host: dbHealth.host,
            port: dbHealth.port,
            connectionMode: dbHealth.connectionMode,
            dns: dbHealth.dns,
            message: dbHealth.error,
            recommendation: dbHealth.recommendation,
          },
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Failed to send OTP" },
      { status: 500 }
    );
  }
}

async function sendSMS(phone: string, code: string): Promise<void> {
  const apiKey = process.env.MSG91_API_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;

  if (!apiKey || !templateId) {
    throw new Error("MSG91 credentials not configured");
  }

  try {
    const response = await fetch("https://api.msg91.com/api/v5/otp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authkey: apiKey,
      },
      body: JSON.stringify({
        template_id: templateId,
        mobile: `91${phone}`,
        otp: code,
      }),
    });

    if (!response.ok) {
      throw new Error(`MSG91 error: ${response.status}`);
    }
  } catch (error) {
    console.error("SMS send error:", error);
    throw error;
  }
}

