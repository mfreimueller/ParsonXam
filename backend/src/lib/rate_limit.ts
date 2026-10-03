import type { Context, Next } from 'hono';
import { AppError } from '../errors.js';
import { clientIp } from './http.js';

// In-memory, fixed per process. Fine for a single Node process on Uberspace.
const hits = new Map<string, number[]>();

export function hit(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return true;
}

export function resetRateLimits(): void {
  hits.clear();
}

export function rateLimit(name: string, max: number, windowMs: number) {
  return async (c: Context, next: Next) => {
    if (!hit(`${name}:${clientIp(c)}`, max, windowMs)) {
      throw new AppError(429, 'RATE_LIMITED', 'Too many requests. Please wait a moment.');
    }
    await next();
  };
}
