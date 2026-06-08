import rateLimit from "express-rate-limit";
import { createStore } from "../lib/rate-limit-store";

/**
 * General API rate limit — 100 requests per 60 seconds per IP
 */
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." },
  skipSuccessfulRequests: false,
  store: createStore("general"),
});

/**
 * Auth endpoints — 5 requests per 5 minutes per IP
 */
export const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Try again in 5 minutes." },
  store: createStore("auth"),
});

/**
 * OTP send — 3 requests per 5 minutes per IP
 */
export const otpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many OTP requests. Try again in 5 minutes." },
  store: createStore("otp"),
});

/**
 * AI diagnostic upload — 3 uploads per 10 minutes per IP
 */
export const aiDiagnoseLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "AI diagnostic limit reached. Max 3 uploads per 10 minutes." },
  store: createStore("ai-diagnose"),
});

/**
 * Webhook endpoints — relaxed limit, signature validation is the real guard
 */
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many webhook requests." },
  store: createStore("webhook"),
});

/**
 * Refresh token rotation — 10 requests per 15 minutes per IP
 */
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many token refresh attempts. Try again later." },
  store: createStore("refresh"),
});

/**
 * Admin endpoints — 60 requests per 60 seconds per IP
 */
export const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many admin requests." },
  store: createStore("admin"),
});

/**
 * Seed marketplace — 30 requests per 60 seconds per IP
 */
export const seedLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many marketplace requests. Slow down." },
  store: createStore("seed"),
});

/**
 * Bartar commodity exchange — 30 requests per 60 seconds per IP
 */
export const bartarLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Slow down." },
  store: createStore("bartar"),
});

/**
 * User profile — 20 requests per 60 seconds per IP
 */
export const userLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Slow down." },
  store: createStore("user"),
});

/**
 * Messaging — 30 requests per 60 seconds per IP
 */
export const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many message requests." },
  store: createStore("message"),
});

/**
 * Notifications — 20 requests per 60 seconds per IP
 */
export const notificationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many notification requests." },
  store: createStore("notification"),
});
