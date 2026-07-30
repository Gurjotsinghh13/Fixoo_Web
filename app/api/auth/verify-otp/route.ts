import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { signToken, COOKIE_NAME, SESSION_MAX_AGE_SECONDS, hashOTP } from "@/lib/auth";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/security";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";
import { isTenantAdminRole } from "@/lib/authorization";
import type { AdminRole, UserRole } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone, code, role } = body;
    const tenantId = DEFAULT_TENANT_ID;
    const ip = getClientIp(req);

    if (!phone || !code || !role) {
      return NextResponse.json(
        { success: false, error: "Phone, code and role are required" },
        { status: 400 }
      );
    }

    if (!["customer", "partner", "admin"].includes(role)) {
      return NextResponse.json({ success: false, error: "Invalid role" }, { status: 400 });
    }

    const userRole = role as UserRole;

    const ipLimit = checkRateLimit(`otp-verify:ip:${ip}`, {
      limit: 30,
      windowMs: 10 * 60 * 1000,
      lockMs: 15 * 60 * 1000,
    });
    if (!ipLimit.ok) return rateLimitResponse(ipLimit.retryAfterSeconds);

    const phoneLimit = checkRateLimit(`otp-verify:${tenantId}:${userRole}:${phone}`, {
      limit: 8,
      windowMs: 10 * 60 * 1000,
      lockMs: 15 * 60 * 1000,
    });
    if (!phoneLimit.ok) return rateLimitResponse(phoneLimit.retryAfterSeconds);

    const hashedCode = hashOTP(phone, userRole, code);
    const now = new Date();

    const verification = await prisma.$transaction(
      async (tx) => {
        const otp = await tx.oTP.findFirst({
          where: {
            tenantId,
            phone,
            code: hashedCode,
            role: userRole,
            used: false,
            attempts: { lt: 5 },
            expiresAt: { gt: now },
          },
          orderBy: { createdAt: "desc" },
        });

        if (!otp) {
          await tx.oTP.updateMany({
            where: {
              tenantId,
              phone,
              role: userRole,
              used: false,
              expiresAt: { gt: now },
            },
            data: { attempts: { increment: 1 } },
          });

          return { ok: false as const, reason: "INVALID_OTP" as const };
        }

        const consumed = await tx.oTP.updateMany({
          where: { id: otp.id, used: false, attempts: { lt: 5 } },
          data: { used: true },
        });

        if (consumed.count !== 1) return { ok: false as const, reason: "INVALID_OTP" as const };

        if (userRole === "customer") {
          let isNew = false;
          let user = await tx.user.findUnique({ where: { tenantId_phone: { tenantId, phone } } });
          if (!user) {
            user = await tx.user.create({ data: { tenantId, phone } });
            isNew = true;
          }

          return {
            ok: true as const,
            isNew,
            tokenPayload: {
              id: user.id,
              phone: user.phone,
              role: "customer" as const,
              name: user.name ?? undefined,
              tenantId,
            },
            responseData: { id: user.id, phone: user.phone, name: user.name, role: "customer", tenantId },
          };
        }

        if (userRole === "partner") {
          const partner = await tx.partner.findUnique({ where: { tenantId_phone: { tenantId, phone } } });
          if (!partner) throw new Error("PARTNER_NOT_FOUND");

          return {
            ok: true as const,
            isNew: false,
            tokenPayload: {
              id: partner.id,
              phone: partner.phone,
              role: "partner" as const,
              name: partner.name,
              tenantId,
            },
            responseData: {
              id: partner.id,
              phone: partner.phone,
              name: partner.name,
              shopName: partner.shopName,
              isApproved: partner.isApproved,
              isSuspended: partner.isSuspended,
              applicationStatus: partner.applicationStatus,
              applicationNotes: partner.applicationNotes,
              applicationNumber: partner.id,
              role: "partner",
              tenantId,
            },
          };
        }

        const admin = await tx.admin.findUnique({ where: { tenantId_phone: { tenantId, phone } } });
        if (!admin) throw new Error("ADMIN_NOT_FOUND");
        if (!admin.isActive) throw new Error("ADMIN_INACTIVE");
        const adminRole = isTenantAdminRole(admin.role) ? admin.role : "STAFF";

        return {
          ok: true as const,
          isNew: false,
          tokenPayload: {
            id: admin.id,
            phone: admin.phone,
            role: "admin" as const,
            name: admin.name,
            tenantId,
            adminRole,
          },
          responseData: {
            id: admin.id,
            phone: admin.phone,
            name: admin.name,
            role: "admin",
            adminRole,
            tenantId,
          },
        };
      },
      { maxWait: 10000, timeout: 10000 }
    );

    if (!verification.ok) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired OTP" },
        { status: 401 }
      );
    }

    const token = signToken(verification.tokenPayload);

    const response = NextResponse.json({
      success: true,
      data: verification.responseData,
      isNew: verification.isNew,
    });

    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: "/",
    });

    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "PARTNER_NOT_FOUND") {
      return NextResponse.json(
        { success: false, error: "Partner account not found. Please register first." },
        { status: 404 }
      );
    }
    if (error instanceof Error && error.message === "ADMIN_NOT_FOUND") {
      return NextResponse.json(
        { success: false, error: "Invalid or expired OTP" },
        { status: 401 }
      );
    }
    if (error instanceof Error && error.message === "ADMIN_INACTIVE") {
      return NextResponse.json(
        { success: false, error: "Admin account is inactive." },
        { status: 403 }
      );
    }

    console.error("Verify OTP error:", error);
    return NextResponse.json(
      { success: false, error: "Verification failed" },
      { status: 500 }
    );
  }
}
