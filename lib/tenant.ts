export const DEFAULT_TENANT_ID = process.env.FIXOO_TENANT_ID || "default";

export function getTenantId(value?: string | null): string {
  return value || DEFAULT_TENANT_ID;
}

export function getTenantScopedWhere<T extends Record<string, unknown>>(
  tenantId: string | undefined | null,
  where?: T
) {
  return {
    ...(where || {}),
    tenantId: getTenantId(tenantId),
  };
}
