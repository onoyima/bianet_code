import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { generalLimiter } from "./middlewares/rate-limit";
import { sanitizeInput } from "./middlewares/sanitize";
import { captureDeviceFingerprint } from "./middlewares/device-fp";
import { initSentry, Sentry } from "./lib/sentry";

const app: Express = express();

// ─── Sentry (must be first) ────────────────────────────────────────────────────
initSentry();

// Trust the first proxy hop (reverse proxy / load balancer).
// Required for express-rate-limit to correctly identify real client IPs from X-Forwarded-For.
app.set("trust proxy", 1);

// ─── Security Headers ──────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : ["*"];

app.use(
  cors({
    origin: allowedOrigins.includes("*") ? "*" : allowedOrigins,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "x-paystack-signature", "verif-hash"],
    credentials: !allowedOrigins.includes("*"),
  }),
);

// ─── Input Sanitization (body & query) ─────────────────────────────────────────
app.use("/api", sanitizeInput);

// ─── Device Fingerprint ────────────────────────────────────────────────────────
app.use("/api", captureDeviceFingerprint);

// ─── Structured Logging ────────────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// ─── Body Parsers ─────────────────────────────────────────────────────────────
// The verify callback captures the raw buffer for webhook signature verification
// without consuming the stream before JSON parsing.
app.use(
  express.json({
    limit: "10mb",
    verify: (req: Request, _res: Response, buf: Buffer) => {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ─── Global Rate Limiting ─────────────────────────────────────────────────────
app.use("/api", generalLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api", router);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response): void => {
  res.status(404).json({ error: "Route not found" });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  logger.error({ err }, "Unhandled error");
  Sentry.captureException(err, { route: _req.url });
  const status = (err as { status?: number }).status ?? 500;
  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : String((err as Error).message ?? err);
  res.status(status).json({ error: message });
});

export default app;
