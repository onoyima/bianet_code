import { logger } from "./logger";

const SENTRY_DSN = process.env.SENTRY_DSN ?? "";

export function initSentry(): void {
  if (!SENTRY_DSN) {
    logger.info("Sentry DSN not configured — skipping Sentry initialization");
    return;
  }

  logger.info("Sentry would be initialized here once @sentry/node is installed");
}

export const Sentry = {
  captureException(err: unknown, ctx?: Record<string, unknown>): void {
    if (SENTRY_DSN) {
      logger.error({ err, ...ctx }, "[Sentry] Would capture exception");
    }
  },
  captureMessage(msg: string, ctx?: Record<string, unknown>): void {
    if (SENTRY_DSN) {
      logger.warn({ msg, ...ctx }, "[Sentry] Would capture message");
    }
  },
};
