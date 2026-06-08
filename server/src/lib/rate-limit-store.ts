import type { Store, IncrementResponse } from "express-rate-limit";

interface WindowEntry {
  hits: number;
  resetTime: Date;
}

export class MemoryStore implements Store {
  private data = new Map<string, WindowEntry>();
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.intervalId = setInterval(() => this.prune(), 60_000);
    this.intervalId.unref();
  }

  async increment(key: string): Promise<IncrementResponse> {
    const now = Date.now();
    const existing = this.data.get(key);
    if (existing && existing.resetTime.getTime() > now) {
      existing.hits += 1;
      return { totalHits: existing.hits, resetTime: existing.resetTime };
    }
    const resetTime = new Date(now + 60_000);
    this.data.set(key, { hits: 1, resetTime });
    return { totalHits: 1, resetTime };
  }

  async decrement(key: string): Promise<void> {
    const entry = this.data.get(key);
    if (entry) {
      entry.hits = Math.max(0, entry.hits - 1);
    }
  }

  async resetKey(key: string): Promise<void> {
    this.data.delete(key);
  }

  async resetAll(): Promise<void> {
    this.data.clear();
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.data) {
      if (entry.resetTime.getTime() <= now) {
        this.data.delete(key);
      }
    }
  }

  shutdown(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.data.clear();
  }
}

// ─── Optional Redis store (lazy-loaded only if REDIS_URL is set) ─────────────

let redisStore: Store | null = null;

export async function getRedisStore(): Promise<Store | null> {
  if (redisStore) return redisStore;

  const url = process.env.REDIS_URL;
  if (!url) return null;

  try {
    const { Redis } = await import("ioredis");
    const client = new Redis(url, {
      maxRetriesPerRequest: 2,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    await client.connect();
    await client.ping();

    const store: Store = {
      async increment(key: string): Promise<IncrementResponse> {
        const now = Date.now();
        const windowMs = 60_000;
        const resetTime = new Date(Math.ceil(now / windowMs) * windowMs);

        const current = await client.incr(key);
        if (current === 1) {
          await client.pexpire(key, windowMs);
        }

        return { totalHits: current, resetTime };
      },

      async decrement(key: string): Promise<void> {
        await client.decr(key);
      },

      async resetKey(key: string): Promise<void> {
        await client.del(key);
      },
    };

    redisStore = store;
    return store;
  } catch {
    return null;
  }
}

// ─── Login Lockout Tracker ──────────────────────────────────────────────────

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export class LoginLockoutTracker {
  private attempts = new Map<string, { count: number; lockedUntil: number }>();
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.intervalId = setInterval(() => this.prune(), 60_000);
    this.intervalId?.unref();
  }

  isLocked(phone: string): { locked: boolean; remainingMinutes: number } {
    const now = Date.now();
    const existing = this.attempts.get(phone);

    if (existing && existing.lockedUntil > now) {
      const remaining = Math.ceil((existing.lockedUntil - now) / 60000);
      return { locked: true, remainingMinutes: remaining };
    }

    if (existing && existing.lockedUntil > 0 && existing.lockedUntil <= now) {
      existing.count = 0;
      existing.lockedUntil = 0;
    }

    return { locked: false, remainingMinutes: 0 };
  }

  recordFailed(phone: string): { locked: boolean; remainingMinutes: number } {
    const now = Date.now();
    const existing = this.attempts.get(phone);

    if (existing && existing.lockedUntil > now) {
      const remaining = Math.ceil((existing.lockedUntil - now) / 60000);
      return { locked: true, remainingMinutes: remaining };
    }

    if (existing) {
      existing.count += 1;
      if (existing.count >= LOCKOUT_THRESHOLD) {
        existing.lockedUntil = now + LOCKOUT_DURATION_MS;
        const rem = Math.ceil(LOCKOUT_DURATION_MS / 60000);
        return { locked: true, remainingMinutes: rem };
      }
      return { locked: false, remainingMinutes: 0 };
    }

    this.attempts.set(phone, { count: 1, lockedUntil: 0 });
    return { locked: false, remainingMinutes: 0 };
  }

  recordSuccess(phone: string): void {
    this.attempts.delete(phone);
  }

  private prune(): void {
    const now = Date.now();
    for (const [phone, entry] of this.attempts) {
      if (entry.lockedUntil > 0 && entry.lockedUntil <= now) {
        entry.count = 0;
        entry.lockedUntil = 0;
      }
      if (entry.count === 0 && entry.lockedUntil === 0) {
        this.attempts.delete(phone);
      }
    }
  }

  shutdown(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.attempts.clear();
  }
}

let lockoutTracker: LoginLockoutTracker | null = null;

export function getLoginLockoutTracker(): LoginLockoutTracker {
  if (!lockoutTracker) {
    lockoutTracker = new LoginLockoutTracker();
  }
  return lockoutTracker;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createStore(_prefix?: string): MemoryStore {
  return new MemoryStore();
}
