import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateOTP, hashOTP } from "@/lib/auth";
import { checkDatabaseHealth } from "@/lib/database-health";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/security";
import type { UserRole } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OtpErrorContext = {
  phase?: string;
  phone?: string;
  role?: UserRole;
  provider?: string;
  providerStatus?: number;
  providerResponse?: string;
  missingEnv?: string[];
};

class OtpSendError extends Error {
  constructor(message: string, public readonly context: OtpErrorContext = {}, cause?: unknown) {
    super(message);
    this.name = "OtpSendError";
    this.cause = cause;
  }
}

export async function POST(req: NextRequest) {
  let requestContext: OtpErrorContext = {};

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
    requestContext = { phone: maskPhone(phone), role: userRole };

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

    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await prisma.oTP.updateMany({
      where: { tenantId, phone, role: userRole, used: false },
      data: { used: true },
    });

    await prisma.oTP.create({
      data: { tenantId, phone, code: hashOTP(phone, userRole, code), role: userRole, expiresAt },
    });

    if (shouldUseLegacyDevOtpMode()) {
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

    await deliverOtp(phone, code);

    return NextResponse.json({
      success: true,
      message: "OTP sent successfully",
      expiresIn: 300,
    });
  } catch (error) {
    logOtpSendError(error, requestContext);

    if (process.env.NODE_ENV === "development") {
      const isDbError = looksLikeDatabaseError(error);
      const database = isDbError ? await safeDatabaseHealth() : undefined;
      return NextResponse.json(
        {
          success: false,
          error: errorMessage(error),
          ...(database ? { database } : {}),
        },
        { status: isDbError ? 503 : 500 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Failed to send OTP" },
      { status: 500 }
    );
  }
}


async function deliverOtp(phone: string, code: string): Promise<void> {
  const provider = otpProvider();

  if (provider === "mock") {
    console.log(`Mock OTP for +91${maskPhone(phone)} : ${code}`);
    return;
  }

  if (provider === "msg91") {
    await sendSMS(phone, code);
    return;
  }

  throw new OtpSendError(`Unsupported OTP_PROVIDER: ${provider}`, {
    phase: "configuration",
    provider,
  });
}

function otpProvider(): string {
  const configured = process.env.OTP_PROVIDER?.trim().toLowerCase();
  if (configured) return configured;
  return shouldUseLegacyDevOtpMode() ? "mock" : "msg91";
}

function shouldUseLegacyDevOtpMode(): boolean {
  return process.env.ENABLE_DEV_OTP === "true";
}
async function sendSMS(phone: string, code: string): Promise<void> {
  const missingEnv = requiredOtpEnv().filter((key) => !process.env[key]);
  if (missingEnv.length > 0) {
    throw new OtpSendError("MSG91 credentials not configured", {
      phase: "configuration",
      provider: "MSG91",
      missingEnv,
    });
  }

  const apiKey = process.env.MSG91_API_KEY!;
  const templateId = process.env.MSG91_TEMPLATE_ID!;

  let response: Response;
  let responseBody = "";

  try {
    response = await fetch("https://api.msg91.com/api/v5/otp", {
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
    responseBody = await response.text();
  } catch (error) {
    throw new OtpSendError(
      errorMessage(error) || "MSG91 request failed",
      { phase: "provider_request", provider: "MSG91" },
      error
    );
  }

  if (!response.ok) {
    throw new OtpSendError(`MSG91 error: ${response.status}`, {
      phase: "provider_response",
      provider: "MSG91",
      providerStatus: response.status,
      providerResponse: responseBody,
    });
  }

  if (responseBody) {
    console.log("MSG91 OTP response:", {
      status: response.status,
      body: safeProviderBody(responseBody),
    });
  }
}

function requiredOtpEnv(): string[] {
  return ["MSG91_API_KEY", "MSG91_TEMPLATE_ID"];
}

function logOtpSendError(error: unknown, requestContext: OtpErrorContext) {
  const context = error instanceof OtpSendError ? { ...requestContext, ...error.context } : requestContext;
  console.error("Send OTP failed", {
    message: errorMessage(error),
    name: error instanceof Error ? error.name : typeof error,
    stack: error instanceof Error ? error.stack : undefined,
    cause: error instanceof Error && error.cause ? errorMessage(error.cause) : undefined,
    context: {
      ...context,
      providerResponse: context.providerResponse ? safeProviderBody(context.providerResponse) : undefined,
    },
  });

  if (context.missingEnv?.length) {
    console.error("Missing OTP environment variables:", context.missingEnv.join(", "));
  }

  if (context.providerStatus || context.providerResponse) {
    console.error("OTP provider failure", {
      provider: context.provider,
      status: context.providerStatus,
      responseBody: context.providerResponse ? safeProviderBody(context.providerResponse) : undefined,
    });
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

function looksLikeDatabaseError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return message.includes("prisma") || message.includes("database") || message.includes("p1001");
}

async function safeDatabaseHealth() {
  try {
    const dbHealth = await checkDatabaseHealth();
    return {
      ok: dbHealth.ok,
      host: dbHealth.host,
      port: dbHealth.port,
      connectionMode: dbHealth.connectionMode,
      dns: dbHealth.dns,
      message: dbHealth.error,
      recommendation: dbHealth.recommendation,
    };
  } catch (healthError) {
    return {
      ok: false,
      message: errorMessage(healthError),
    };
  }
}

function safeProviderBody(body: string): string {
  return body
    .replace(/("?otp"?\s*[:=]\s*)"?\d+"?/gi, "$1[REDACTED]")
    .replace(/("?token"?\s*[:=]\s*)"?[^"]+"?/gi, "$1[REDACTED]")
    .slice(0, 2000);
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

