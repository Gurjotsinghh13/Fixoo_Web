import type { AuthUser } from "@/types";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";

function base64UrlToString(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  return atob(padded);
}

function base64UrlToBytes(value: string): Uint8Array {
  const decoded = base64UrlToString(value);
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
}

function bytesToBase64Url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function verifyTokenEdge(token: string): Promise<AuthUser | null> {
  try {
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) return null;

    const parsedHeader = JSON.parse(base64UrlToString(header));
    if (parsedHeader.alg !== "HS256") return null;

    const secret = process.env.JWT_SECRET || "fixoo-dev-secret";
    if (!process.env.JWT_SECRET && process.env.NODE_ENV === "production") return null;
    if (
      process.env.NODE_ENV === "production" &&
      (secret.length < 32 || /dev|local|change|secret/i.test(secret))
    ) return null;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const expected = bytesToBase64Url(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${header}.${payload}`))
    );
    if (expected !== signature) return null;

    const user = JSON.parse(base64UrlToString(payload)) as AuthUser & { exp?: number };
    if (user.exp && user.exp * 1000 < Date.now()) return null;
    if (!user.id || !user.phone || !user.role) return null;
    return { ...user, tenantId: user.tenantId || DEFAULT_TENANT_ID };
  } catch {
    return null;
  }
}
