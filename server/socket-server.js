const { createServer } = require("http");
const crypto = require("crypto");
const { Server } = require("socket.io");
const prisma = require("./prisma");
const jwt = require("jsonwebtoken");

const PORT = Number(process.env.SOCKET_PORT || 3001);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? undefined : "fixoo-dev-secret");
const SOCKET_INTERNAL_SECRET =
  process.env.SOCKET_INTERNAL_SECRET ||
  (process.env.NODE_ENV === "production" ? undefined : "fixoo-dev-internal-secret");
const DEFAULT_TENANT_ID = process.env.FIXOO_TENANT_ID || "default";

if (!JWT_SECRET) {
  console.error("JWT_SECRET is required for the socket server in production");
  process.exit(1);
}

if (!SOCKET_INTERNAL_SECRET) {
  console.error("SOCKET_INTERNAL_SECRET is required for the socket server in production");
  process.exit(1);
}

if (
  process.env.NODE_ENV === "production" &&
  (JWT_SECRET.length < 32 ||
    SOCKET_INTERNAL_SECRET.length < 32 ||
    /dev|local|change|secret/i.test(JWT_SECRET) ||
    /dev|local|change|secret/i.test(SOCKET_INTERNAL_SECRET))
) {
  console.error("Strong JWT_SECRET and SOCKET_INTERNAL_SECRET are required in production");
  process.exit(1);
}

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((entry) => entry.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)])
  );
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

const ALLOWED_INTERNAL_EVENTS = new Set([
  "request:created",
  "request:broadcast",
  "request:accepted",
  "request:taken",
  "request:expired",
  "request:cancelled",
  "request:no_partners",
  "request:expanding",
  "request:status",
  "request:on_the_way",
  "request:arrived",
  "request:repair_in_progress",
  "request:completed",
  "partner:access_revoked",
  "admin:new_request",
  "admin:request_status",
  "admin:request_cancelled",
]);

function isAllowedRoom(room) {
  return (
    /^customer:[A-Za-z0-9_-]+$/.test(room) ||
    /^partner:[A-Za-z0-9_-]+$/.test(room) ||
    /^admin:[A-Za-z0-9_-]+$/.test(room) ||
    /^tenant:[A-Za-z0-9_-]+:partners$/.test(room)
  );
}

function isLoopback(req) {
  if (process.env.SOCKET_ALLOW_REMOTE_EMIT === "true") return true;
  const address = req.socket.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function safeSecretEquals(value, expected) {
  if (!value || !expected) return false;
  const left = Buffer.from(String(value));
  const right = Buffer.from(String(expected));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

const eventBuckets = new Map();
function allowSocketEvent(socketId, event, limit, windowMs) {
  const key = `${socketId}:${event}`;
  const now = Date.now();
  const current = eventBuckets.get(key);
  const bucket = current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };
  bucket.count += 1;
  eventBuckets.set(key, bucket);
  return bucket.count <= limit;
}

const httpServer = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && req.url === "/emit") {
    if (!isLoopback(req) || !safeSecretEquals(req.headers["x-socket-secret"], SOCKET_INTERNAL_SECRET)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "Unauthorized" }));
      return;
    }

    try {
      const payload = JSON.parse(await readBody(req));
      if (!payload.event || !payload.room) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Invalid emit payload" }));
        return;
      }

      if (!ALLOWED_INTERNAL_EVENTS.has(payload.event) || !isAllowedRoom(payload.room)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Forbidden emit target" }));
        return;
      }

      io.to(payload.room).emit(payload.event, payload.data);
      if (
        payload.event === "partner:access_revoked" &&
        payload.room.startsWith("partner:")
      ) {
        io.in(payload.room).disconnectSockets(true);
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      console.error("Internal emit error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "Emit failed" }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ success: false, error: "Not found" }));
});

const io = new Server(httpServer, {
  cors: {
    origin: APP_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const connectedCustomers = new Map();
const connectedPartners = new Map();
const connectedAdmins = new Set();

function rememberConnection(map, id, socketId) {
  const current = map.get(id) || new Set();
  current.add(socketId);
  map.set(id, current);
}

function forgetConnection(map, id, socketId) {
  const current = map.get(id);
  if (!current) return 0;
  current.delete(socketId);
  if (current.size === 0) map.delete(id);
  return current.size;
}

io.use(async (socket, next) => {
  try {
    const cookies = parseCookies(socket.handshake.headers.cookie);
    const bearer = socket.handshake.headers.authorization?.replace("Bearer ", "");
    const token = socket.handshake.auth?.token || bearer || cookies.fixoo_token;

    if (!token) return next(new Error("Authentication required"));

    const user = jwt.verify(token, JWT_SECRET);
    const tenantId = user.tenantId || DEFAULT_TENANT_ID;
    const requestedRole = socket.handshake.auth?.role;
    const requestedId = socket.handshake.auth?.id;

    if (requestedRole && requestedRole !== user.role) {
      return next(new Error("Role mismatch"));
    }

    if (requestedId && requestedId !== user.id) {
      return next(new Error("User mismatch"));
    }

    if (user.role === "customer") {
      const account = await prisma.user.findFirst({
        where: { id: user.id, tenantId, isActive: true },
        select: { id: true },
      });
      if (!account) return next(new Error("Account disabled"));
    } else if (user.role === "partner") {
      const account = await prisma.partner.findFirst({
        where: {
          id: user.id,
          tenantId,
          applicationStatus: "APPROVED",
          isApproved: true,
          isSuspended: false,
        },
        select: { id: true },
      });
      if (!account) return next(new Error("Partner unavailable"));
    } else if (user.role === "admin") {
      const account = await prisma.admin.findFirst({
        where: { id: user.id, tenantId, isActive: true },
        select: { id: true, role: true },
      });
      if (!account) return next(new Error("Admin unavailable"));
      socket.data.adminRole =
        account.role === "SUPER_ADMIN" || account.role === "TENANT_OWNER" || account.role === "STAFF"
          ? account.role
          : "STAFF";
    } else {
      return next(new Error("Invalid role"));
    }

    socket.data.role = user.role;
    socket.data.id = user.id;
    socket.data.tenantId = tenantId;
    next();
  } catch {
    next(new Error("Invalid authentication"));
  }
});

io.on("connection", (socket) => {
  const { role, id, tenantId, adminRole } = socket.data;
  console.log(`Connected: ${role}:${id} (${socket.id})`);

  if (role === "customer") {
    socket.join(`customer:${id}`);
    rememberConnection(connectedCustomers, id, socket.id);
  } else if (role === "partner") {
    socket.join(`partner:${id}`);
    socket.join(`tenant:${tenantId}:partners`);
    rememberConnection(connectedPartners, id, socket.id);
    io.to(`admin:${tenantId}`).emit("admin:partner_connected", { partnerId: id });
  } else if (role === "admin") {
    socket.join(`admin:${tenantId}`);
    connectedAdmins.add(socket.id);
  }

  socket.on("partner:location", async (data) => {
    if (role !== "partner") return;
    if (!allowSocketEvent(socket.id, "partner:location", 30, 60_000)) return;
    const latitude = Number(data?.latitude);
    const longitude = Number(data?.longitude);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) return;

    try {
      await prisma.partnerLocation.upsert({
        where: { tenantId_partnerId: { tenantId, partnerId: id } },
        update: { latitude, longitude, lastSeenAt: new Date() },
        create: { tenantId, partnerId: id, latitude, longitude, lastSeenAt: new Date() },
      });

      io.to(`admin:${tenantId}`).emit("admin:partner_location", {
        partnerId: id,
        latitude,
        longitude,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Location update error:", err);
    }
  });

  socket.on("partner:online", async (data) => {
    if (role !== "partner") return;
    if (!allowSocketEvent(socket.id, "partner:online", 10, 60_000)) return;
    const isOnline = Boolean(data?.isOnline);
    const latitude = Number(data?.latitude);
    const longitude = Number(data?.longitude);

    try {
      await prisma.partner.updateMany({
        where: { id, tenantId },
        data: { isOnline, lastOnlineAt: isOnline ? new Date() : undefined },
      });

      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        await prisma.partnerLocation.upsert({
          where: { tenantId_partnerId: { tenantId, partnerId: id } },
          update: { latitude, longitude, lastSeenAt: new Date() },
          create: { tenantId, partnerId: id, latitude, longitude, lastSeenAt: new Date() },
        });
      }

      io.to(`admin:${tenantId}`).emit("admin:partner_status", {
        partnerId: id,
        isOnline,
      });

      console.log(`Partner ${id} is now ${isOnline ? "ONLINE" : "OFFLINE"}`);
    } catch (err) {
      console.error("Partner online error:", err);
    }
  });

  socket.on("request:reject", async (data) => {
    if (role !== "partner") return;
    if (!allowSocketEvent(socket.id, "request:reject", 20, 60_000)) return;
    const requestId = data?.requestId;
    if (!requestId) return;

    try {
      await prisma.partnerBroadcast.updateMany({
        where: { tenantId, requestId, partnerId: id },
        data: { response: "REJECTED", respondedAt: new Date() },
      });
    } catch (err) {
      console.error("Request reject error:", err);
    }
  });

  socket.on("admin:broadcast_dismiss", (data) => {
    if (role !== "admin") return;
    if (!allowSocketEvent(socket.id, "admin:broadcast_dismiss", 20, 60_000)) return;
    if (adminRole !== "SUPER_ADMIN" && adminRole !== "TENANT_OWNER") return;
    const requestId = data?.requestId;
    if (requestId) io.to(`tenant:${tenantId}:partners`).emit("request:taken", { requestId });
  });

  socket.on("disconnect", async () => {
    console.log(`Disconnected: ${role}:${id}`);

    if (role === "customer") {
      forgetConnection(connectedCustomers, id, socket.id);
    } else if (role === "partner") {
      const remaining = forgetConnection(connectedPartners, id, socket.id);
      if (remaining > 0) return;
      try {
        await prisma.partner.updateMany({
          where: { id, tenantId },
          data: { isOnline: false },
        });
        io.to(`admin:${tenantId}`).emit("admin:partner_status", {
          partnerId: id,
          isOnline: false,
        });
      } catch (err) {
        console.error("Disconnect cleanup error:", err);
      }
    } else if (role === "admin") {
      connectedAdmins.delete(socket.id);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Fixoo Socket.io server running on port ${PORT}`);
});

module.exports = { io };
