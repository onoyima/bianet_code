import http from "http";
import { URL } from "url";
import app from "./app";
import { createWsServer } from "./lib/ws";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);
const wss = createWsServer();

// Route WebSocket upgrades at /api/ws — all other upgrade requests are rejected
server.on("upgrade", (req, socket, head) => {
  try {
    const pathname = new URL(req.url ?? "", "wss://placeholder").pathname;
    if (pathname === "/api/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  } catch {
    socket.destroy();
  }
});

server.listen(port, () => {
  logger.info({ port }, "Server listening");
  logger.info({ path: "/api/ws" }, "WebSocket endpoint ready");
});

server.on("error", (err) => {
  logger.error({ err }, "Server error");
  process.exit(1);
});
