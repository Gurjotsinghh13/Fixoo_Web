import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;
let socketKey: string | null = null;

export function getSocket(role: string, id: string): Socket {
  const nextKey = `${role}:${id}`;
  if (socket?.connected && socketKey === nextKey) return socket;

  if (socket && socketKey !== nextKey) {
    socket.disconnect();
    socket = null;
    socketKey = null;
  }

  const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

  socket = io(SOCKET_URL, {
    auth: { role, id },
    withCredentials: true,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });
  socketKey = nextKey;

  socket.on("connect", () => {
    console.log("Socket connected:", socket?.id);
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected");
  });

  socket.on("connect_error", (err) => {
    console.error("Socket connection error:", err.message);
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    socketKey = null;
  }
}

export function getActiveSocket(): Socket | null {
  return socket;
}
