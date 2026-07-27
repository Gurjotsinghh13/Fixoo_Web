import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { getTenantId } from "@/lib/tenant";
import type { AdminRole, AuthUser } from "@/types";
import {
  canPartnerParticipate,
  normalizePartnerApplicationStatus,
  type PartnerApplicationStatus,
} from "@/lib/partner-approval";

type AuthzResult<T> =
  | { ok: true; user: AuthUser; record: T; tenantId: string }
  | { ok: false; response: NextResponse };

function deny(error: string, status: number): AuthzResult<never> {
  return { ok: false, response: NextResponse.json({ success: false, error }, { status }) };
}

function normalizeAdminRole(value?: string | null): AdminRole {
  if (value === "TENANT_OWNER" || value === "STAFF" || value === "SUPER_ADMIN") return value;
  return "STAFF";
}

export async function requireCustomer(req: NextRequest): Promise<AuthzResult<{ id: string }>> {
  const user = getUserFromRequest(req);
  if (!user || user.role !== "customer") return deny("Unauthorized", 401);

  const tenantId = getTenantId(user.tenantId);
  const account = await prisma.user.findFirst({
    where: { id: user.id, tenantId, isActive: true },
    select: { id: true },
  });

  if (!account) return deny("Account is inactive or no longer exists", 403);
  return { ok: true, user: { ...user, tenantId }, record: account, tenantId };
}

export async function requirePartner(
  req: NextRequest,
  options: { approved?: boolean } = {}
): Promise<AuthzResult<{
  id: string;
  isApproved: boolean;
  isSuspended: boolean;
  applicationStatus: PartnerApplicationStatus;
}>> {
  const user = getUserFromRequest(req);
  if (!user || user.role !== "partner") return deny("Unauthorized", 401);

  const tenantId = getTenantId(user.tenantId);
  const partner = await prisma.partner.findFirst({
    where: { id: user.id, tenantId },
    select: {
      id: true,
      isApproved: true,
      isSuspended: true,
      applicationStatus: true,
    },
  });

  if (!partner) return deny("Partner account no longer exists", 403);
  const applicationStatus = normalizePartnerApplicationStatus(
    partner.applicationStatus
  );
  if (options.approved && !canPartnerParticipate(partner)) {
    return deny(`Partner application is ${applicationStatus.toLowerCase()}`, 403);
  }
  return {
    ok: true,
    user: { ...user, tenantId },
    record: { ...partner, applicationStatus },
    tenantId,
  };
}

export async function requireAdmin(
  req: NextRequest,
  allowedRoles: AdminRole[] = ["SUPER_ADMIN", "TENANT_OWNER", "STAFF"]
): Promise<AuthzResult<{ id: string; role: AdminRole }>> {
  const user = getUserFromRequest(req);
  if (!user || user.role !== "admin") return deny("Unauthorized", 401);

  const tenantId = getTenantId(user.tenantId);
  const admin = await prisma.admin.findFirst({
    where: { id: user.id, tenantId, isActive: true },
    select: { id: true, role: true },
  });

  if (!admin) return deny("Admin account is inactive or no longer exists", 403);

  const adminRole = normalizeAdminRole(admin.role);
  if (!allowedRoles.includes(adminRole)) return deny("Forbidden", 403);

  return {
    ok: true,
    user: { ...user, tenantId, adminRole },
    record: { id: admin.id, role: adminRole },
    tenantId,
  };
}

export function isTenantAdminRole(value: string | null | undefined): value is AdminRole {
  return value === "SUPER_ADMIN" || value === "TENANT_OWNER" || value === "STAFF";
}
