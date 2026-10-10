import type { Server } from "socket.io";
import type { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import { getEnv } from "./config/env.js";
import { verifyToken } from "./middleware/auth.js";
import { logger } from "./utils/logger.js";

let io: Server | null = null;

export function initSocket(httpServer: HttpServer): Server {
  const env = getEnv();
  io = new SocketServer(httpServer, {
    cors: { origin: env.FRONTEND_URL, credentials: true },
    path: "/socket.io",
  });

  io.use((socket, next) => {
    try {
      const cookie = socket.handshake.headers.cookie ?? "";
      const match = cookie.match(/civiclens_token=([^;]+)/);
      const token =
        (socket.handshake.auth as Record<string, string> | undefined)?.token ??
        match?.[1];
      if (token) {
        const payload = verifyToken(token);
        socket.data.userId = payload.sub;
        socket.data.role = payload.role;
        socket.join(`user:${payload.sub}`);
      }
      socket.join("public");
      next();
    } catch (err) {
      logger.warn({ msg: "socket auth failed, joining public room only" });
      socket.join("public");
      next();
    }
  });

  io.on("connection", (socket) => {
    logger.info({ msg: "socket connected", id: socket.id });
    // Clients may only join their own user room; reject arbitrary rooms.
    socket.on("subscribe", (room: unknown) => {
      if (typeof room !== "string") return;
      if (room === "public") {
        socket.join("public");
        return;
      }
      const own = socket.data.userId ? `user:${socket.data.userId}` : null;
      if (room === own) socket.join(room);
      // silently ignore anything else — never allow arbitrary private rooms
    });
    socket.on("disconnect", () =>
      logger.info({ msg: "socket disconnected", id: socket.id }),
    );
  });

  return io;
}

export function getIO(): Server | null {
  return io;
}

/** Emit only AFTER the DB write succeeded (call sites must await save first). */
export function emitToAll(
  event: string,
  payload: Record<string, unknown>,
): void {
  try {
    io?.to("public").emit(event, payload);
  } catch (err) {
    logger.error({ msg: "socket emit failed", event, err });
  }
}

export function emitToUser(
  userId: string,
  event: string,
  payload: Record<string, unknown>,
): void {
  try {
    io?.to(`user:${userId}`).emit(event, payload);
  } catch (err) {
    logger.error({ msg: "socket user emit failed", event, err });
  }
}
