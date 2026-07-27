import jwt from "jsonwebtoken";
import { getJwtSecret } from "@/lib/auth";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";

type RegistrationToken = {
  purpose: "partner_registration";
  phone: string;
  tenantId: string;
};

export function signPartnerRegistrationToken(phone: string) {
  return jwt.sign(
    {
      purpose: "partner_registration",
      phone,
      tenantId: DEFAULT_TENANT_ID,
    } satisfies RegistrationToken,
    getJwtSecret(),
    { expiresIn: "15m" }
  );
}

export function verifyPartnerRegistrationToken(
  token: unknown,
  phone: string
) {
  if (typeof token !== "string" || !token) return false;
  try {
    const payload = jwt.verify(token, getJwtSecret()) as RegistrationToken;
    return (
      payload.purpose === "partner_registration" &&
      payload.phone === phone &&
      payload.tenantId === DEFAULT_TENANT_ID
    );
  } catch {
    return false;
  }
}
