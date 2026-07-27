import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import crypto from "node:crypto";
import type { AdminRole, AuthUser, UserRole } from "@/types";
import { getTenantId } from "@/lib/tenant";

const COOKIE_NAME = "fixoo_token";
export const SESSION_MAX_AGE_SECONDS = 2 * 60 * 60;

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production");
  }
  if (
    process.env.NODE_ENV === "production" &&
    secret &&
    (secret.length < 32 || /dev|local|change|secret/i.test(secret))
  ) {
    throw new Error("JWT_SECRET must be a strong production secret");
  }
  return secret || "fixoo-dev-secret";
}

export function signToken(payload: {
  id: string;
  phone: string;
  role: UserRole;
  name?: string;
  tenantId?: string;
  adminRole?: AdminRole;
}): string {
  return jwt.sign(
    { ...payload, tenantId: getTenantId(payload.tenantId) },
    getJwtSecret(),
    { expiresIn: SESSION_MAX_AGE_SECONDS }
  );
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AuthUser;
    return decoded;
  } catch {
    return null;
  }
}

export async function getServerUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export function getUserFromRequest(req: NextRequest): AuthUser | null {
  const token =
    req.cookies.get(COOKIE_NAME)?.value ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

export function generateOTP(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

export function hashOTP(phone: string, role: string, code: string): string {
  return crypto
    .createHmac("sha256", getJwtSecret())
    .update(`${phone}:${role}:${code}`)
    .digest("hex");
}

export function isNightTime(): boolean {
  const hour = new Date().getHours();
  return hour >= 22 || hour < 6;
}

export { COOKIE_NAME };
