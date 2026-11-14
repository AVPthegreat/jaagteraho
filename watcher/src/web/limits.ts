// Request limits shared by every route: body sizes, sliding-window rate limits and concurrent-connection caps.
// All in memory; they bound what one process holds no matter how the public API is abused.

import type { Context, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";

/** Every request body, unless the route says otherwise. JSON from the website is a few KB. */
export const BODY_LIMIT_BYTES = 256 * 1024;
/** Log drains send batches of lines (see intake/logs.ts, which applies the same limit itself). */
export const LOGS_BODY_LIMIT_BYTES = 1024 * 1024;

const tooLarge = (c: Context) => c.json({ error: "Request too large." }, 413);

/**
 * One global guard so no handler ever reads an unbounded body: 1 MB on /logs/*, 256 KB everywhere else.
 * Bodies sent without a Content-Length are counted while they stream and cut off at the limit.
 */
export function bodyLimits(): MiddlewareHandler {
  const small = bodyLimit({ maxSize: BODY_LIMIT_BYTES, onError: tooLarge });
  const large = bodyLimit({ maxSize: LOGS_BODY_LIMIT_BYTES, onError: tooLarge });
  return (c, next) => (c.req.path.startsWith("/logs/") ? large(c, next) : small(c, next));
}

/** Sliding-window rate limit per key. Keys whose window has passed are pruned, and the map is capped. */
export class Window {
  private hits = new Map<string, { ms: number; at: number[] }>();
  private calls = 0;
  constructor(private maxKeys = 50_000) {}

  allow(key: string, max: number, ms: number, now = Date.now()): boolean {
    if (++this.calls % 1_000 === 0 || this.hits.size >= this.maxKeys) this.prune(now);
    const entry = this.hits.get(key);
    const list = (entry?.at ?? []).filter((t) => now - t < ms);
    if (list.length >= max) {
      if (entry) entry.at = list;
      return false;
    }
    list.push(now);
    // Re-insert so the map's order is least recently used first (what prune drops when full).
    this.hits.delete(key);
    this.hits.set(key, { ms, at: list });
    return true;
  }

  /** Forgets keys with no hit inside their window; if still full, the least recently used. */
  prune(now = Date.now()) {
    for (const [k, e] of this.hits) if (e.at.length === 0 || now - e.at[e.at.length - 1] >= e.ms) this.hits.delete(k);
    while (this.hits.size >= this.maxKeys) this.hits.delete(this.hits.keys().next().value!);
  }

  get size() {
    return this.hits.size;
  }
}

/** Counts open connections (live feeds) per key and in total. */
export class Slots {
  private open = new Map<string, number>();
  private total = 0;
  constructor(
    private perKey: number,
    private max: number,
  ) {}

  /** Takes a slot, or returns false when the key or the whole server is at its cap. */
  take(key: string): boolean {
    const n = this.open.get(key) ?? 0;
    if (n >= this.perKey || this.total >= this.max) return false;
    this.open.set(key, n + 1);
    this.total++;
    return true;
  }

  release(key: string) {
    const n = this.open.get(key) ?? 0;
    if (n <= 0) return;
    if (n === 1) this.open.delete(key);
    else this.open.set(key, n - 1);
    this.total--;
  }

  get count() {
    return this.total;
  }
}
