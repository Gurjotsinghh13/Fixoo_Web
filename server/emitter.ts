const SOCKET_INTERNAL_URL =
  process.env.SOCKET_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  (process.env.NODE_ENV === "production" ? undefined : "http://localhost:3001");

if (!SOCKET_INTERNAL_URL && process.env.NODE_ENV === "production") {
  throw new Error("SOCKET_INTERNAL_URL or NEXT_PUBLIC_SOCKET_URL is required in production");
}

function getSocketInternalSecret() {
  const secret = process.env.SOCKET_INTERNAL_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("SOCKET_INTERNAL_SECRET is required in production");
  }
  return secret || "fixoo-dev-internal-secret";
}

type EmitTarget =
  { room: string; event: string; data: unknown };

function postEmit(payload: EmitTarget) {
  if (process.env.DISABLE_SOCKET_EMIT === "true") return;

  fetch(`${SOCKET_INTERNAL_URL}/emit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-socket-secret": getSocketInternalSecret(),
    },
    body: JSON.stringify(payload),
  }).catch((error) => {
    console.error("Socket emit failed:", error);
  });
}

export function emitToCustomer(userId: string, event: string, data: unknown) {
  postEmit({ room: `customer:${userId}`, event, data });
}

export function emitToPartner(partnerId: string, event: string, data: unknown) {
  postEmit({ room: `partner:${partnerId}`, event, data });
}

export function emitToAdmin(event: string, data: unknown, tenantId = "default") {
  postEmit({ room: `admin:${tenantId}`, event, data });
}

export function emitToTenantPartners(tenantId: string, event: string, data: unknown) {
  postEmit({ room: `tenant:${tenantId}:partners`, event, data });
}
