import { NextRequest, NextResponse } from "next/server";

type RateBucket = {
  count: number;
  resetAt: number;
  lockedUntil?: number;
};

const buckets = new Map<string, RateBucket>();

export function getClientIp(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwarded ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

export function checkRateLimit(
  key: string,
  options: { limit: number; windowMs: number; lockMs?: number }
) {
  const now = Date.now();
  const existing = buckets.get(key);

  if (existing?.lockedUntil && existing.lockedUntil > now) {
    return { ok: false, retryAfterSeconds: Math.ceil((existing.lockedUntil - now) / 1000) };
  }

  const bucket =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + options.windowMs };

  bucket.count += 1;

  if (bucket.count > options.limit) {
    bucket.lockedUntil = now + (options.lockMs || options.windowMs);
    buckets.set(key, bucket);
    return { ok: false, retryAfterSeconds: Math.ceil((bucket.lockedUntil - now) / 1000) };
  }

  buckets.set(key, bucket);
  return { ok: true, retryAfterSeconds: 0 };
}

export function rateLimitResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { success: false, error: "Too many attempts. Please try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}

export function isSafeHttpsUrl(value: string | null) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export function cleanHttpsUrl(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const clipped = trimmed.slice(0, maxLength);
  return isSafeHttpsUrl(clipped) ? clipped : "__INVALID_URL__";
}

const PARTNER_DOCUMENT_PATTERN =
  /^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/;

export function cleanPartnerDocument(value: unknown, maxBytes = 750_000) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("data:")) {
    if (!PARTNER_DOCUMENT_PATTERN.test(trimmed)) return "__INVALID_DOCUMENT__";
    const encoded = trimmed.slice(trimmed.indexOf(",") + 1);
    const estimatedBytes = Math.floor((encoded.length * 3) / 4);
    return estimatedBytes <= maxBytes ? trimmed : "__INVALID_DOCUMENT__";
  }

  const httpsUrl = cleanHttpsUrl(trimmed, 2_000);
  return httpsUrl === "__INVALID_URL__" ? "__INVALID_DOCUMENT__" : httpsUrl;
}

export function maskAadhaar(value?: string | null) {
  const digits = value?.replace(/\D/g, "");
  if (!digits) return null;
  return `XXXX-XXXX-${digits.slice(-4)}`;
}
