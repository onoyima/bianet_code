/**
 * WebSocket server — real-time messaging layer.
 *
 * Connection URL:  ws://<host>/api/ws?token=<accessToken>
 *
 * Client → Server frames (JSON):
 *   { type: "join",    tradeId: string }
 *   { type: "leave",   tradeId: string }
 *   { type: "message", tradeId: string, content: string, messageType?: "TEXT"|"IMAGE"|"FILE", attachmentUrl?: string }
 *   { type: "ping" }
 *
 * Server → Client frames (JSON):
 *   { type: "joined",  tradeId: string }
 *   { type: "message", tradeId: string, message: MessageRow }
 *   { type: "read",    tradeId: string, readBy: string, count: number }
 *   { type: "pong" }
 *   { type: "error",   message: string }
 */

import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { URL } from "url";
import { eq, and, or, desc, lt } from "drizzle-orm";
import { db, messagesTable, usersTable } from "@workspace/db";
import { verifyAccessToken, type JwtPayload } from "./auth";
import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthedSocket extends WebSocket {
  user: JwtPayload;
  rooms: Set<string>;
  isAlive: boolean;
}

type InFrame =
  | { type: "join";    tradeId: string }
  | { type: "leave";   tradeId: string }
  | { type: "message"; tradeId: string; content: string; messageType?: string; attachmentUrl?: string }
  | { type: "ping" };

// ─── Room Registry ────────────────────────────────────────────────────────────

// rooms: tradeId → Set of connected sockets in that room
const rooms = new Map<string, Set<AuthedSocket>>();

function joinRoom(socket: AuthedSocket, tradeId: string): void {
  if (!rooms.has(tradeId)) rooms.set(tradeId, new Set());
  rooms.get(tradeId)!.add(socket);
  socket.rooms.add(tradeId);
}

function leaveRoom(socket: AuthedSocket, tradeId: string): void {
  rooms.get(tradeId)?.delete(socket);
  if (rooms.get(tradeId)?.size === 0) rooms.delete(tradeId);
  socket.rooms.delete(tradeId);
}

function leaveAllRooms(socket: AuthedSocket): void {
  for (const tradeId of socket.rooms) leaveRoom(socket, tradeId);
}

function broadcast(
  tradeId: string,
  payload: object,
  except?: AuthedSocket,
): void {
  const room = rooms.get(tradeId);
  if (!room) return;
  const data = JSON.stringify(payload);
  for (const client of room) {
    if (client === except) continue;
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

function send(socket: AuthedSocket, payload: object): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

// ─── Message Persistence ─────────────────────────────────────────────────────

async function persistAndBroadcast(
  socket: AuthedSocket,
  tradeId: string,
  content: string,
  messageType: string,
  attachmentUrl?: string,
): Promise<void> {
  // Resolve the other party in this trade to set receiverId
  // For simplicity, the receiver is whoever else is in the room; fall back
  // to the sender itself if room is empty (they'll see their own messages).
  const roomMembers = rooms.get(tradeId);
  let receiverId: string = socket.user.sub;

  if (roomMembers) {
    for (const member of roomMembers) {
      if (member.user.sub !== socket.user.sub) {
        receiverId = member.user.sub;
        break;
      }
    }
  }

  const [message] = await db
    .insert(messagesTable)
    .values({
      tradeId,
      senderId: socket.user.sub,
      receiverId,
      content,
      messageType,
      attachmentUrl: attachmentUrl ?? null,
    })
    .returning();

  const frame = { type: "message", tradeId, message };

  // Send back to sender (confirmation)
  send(socket, frame);
  // Broadcast to everyone else in the room
  broadcast(tradeId, frame, socket);
}

// ─── Authentication ───────────────────────────────────────────────────────────

function extractToken(req: IncomingMessage): string | null {
  try {
    const url = new URL(req.url ?? "", "wss://placeholder");
    const token = url.searchParams.get("token");
    return token ?? null;
  } catch {
    return null;
  }
}

function authenticate(req: IncomingMessage): JwtPayload | null {
  const token = extractToken(req);
  if (!token) return null;
  try {
    return verifyAccessToken(token);
  } catch {
    return null;
  }
}

// ─── Frame Handler ────────────────────────────────────────────────────────────

async function handleFrame(
  socket: AuthedSocket,
  raw: string,
): Promise<void> {
  let frame: InFrame;
  try {
    frame = JSON.parse(raw) as InFrame;
  } catch {
    send(socket, { type: "error", message: "Invalid JSON" });
    return;
  }

  switch (frame.type) {
    case "ping":
      send(socket, { type: "pong" });
      break;

    case "join": {
      const { tradeId } = frame;
      if (!tradeId) { send(socket, { type: "error", message: "tradeId required" }); return; }
      joinRoom(socket, tradeId);
      send(socket, { type: "joined", tradeId });
      logger.info({ userId: socket.user.sub, tradeId }, "WS: user joined room");
      break;
    }

    case "leave": {
      const { tradeId } = frame;
      if (!tradeId) { send(socket, { type: "error", message: "tradeId required" }); return; }
      leaveRoom(socket, tradeId);
      send(socket, { type: "left", tradeId });
      break;
    }

    case "message": {
      const { tradeId, content, messageType = "TEXT", attachmentUrl } = frame;
      if (!tradeId || !content?.trim()) {
        send(socket, { type: "error", message: "tradeId and content are required" });
        return;
      }
      if (!socket.rooms.has(tradeId)) {
        send(socket, { type: "error", message: "Join the room before sending messages" });
        return;
      }
      await persistAndBroadcast(socket, tradeId, content.trim(), messageType, attachmentUrl);
      break;
    }

    default:
      send(socket, { type: "error", message: "Unknown frame type" });
  }
}

// ─── Server Factory ───────────────────────────────────────────────────────────

export function createWsServer(): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  // Heartbeat — drop dead connections every 30s
  const heartbeat = setInterval(() => {
    wss.clients.forEach((raw) => {
      const ws = raw as AuthedSocket;
      if (!ws.isAlive) {
        leaveAllRooms(ws);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30_000);

  wss.on("close", () => clearInterval(heartbeat));

  wss.on("connection", (raw: WebSocket, req: IncomingMessage) => {
    const user = authenticate(req);
    if (!user) {
      raw.close(4001, "Unauthorized");
      return;
    }

    const socket = raw as AuthedSocket;
    socket.user = user;
    socket.rooms = new Set();
    socket.isAlive = true;

    socket.on("pong", () => { socket.isAlive = true; });

    socket.on("message", (data) => {
      const raw = data.toString();
      handleFrame(socket, raw).catch((err: unknown) => {
        logger.error({ err, userId: user.sub }, "WS frame error");
        send(socket, { type: "error", message: "Internal error" });
      });
    });

    socket.on("close", () => {
      leaveAllRooms(socket);
      logger.info({ userId: user.sub }, "WS: client disconnected");
    });

    socket.on("error", (err) => {
      logger.warn({ err, userId: user.sub }, "WS socket error");
    });

    logger.info({ userId: user.sub }, "WS: client connected");
  });

  return wss;
}

// ─── Notify helpers (called from REST routes to push to open sockets) ─────────

export function pushReadReceipt(
  tradeId: string,
  readBy: string,
  count: number,
): void {
  broadcast(tradeId, { type: "read", tradeId, readBy, count });
}
