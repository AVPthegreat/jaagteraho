// Request limits shared by every route: body sizes, sliding-window rate limits and concurrent-connection caps.
// All in memory; they bound what one process holds no matter how the public API is abused.

import type { Context, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { envInt } from "../envint.js";

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

  /**
   * Checks every [key, max, ms] first and records a hit on all of them only when all pass, so a request
   * refused by one limit (say its session) never uses up another (say a whole office's shared address).
   */
  allowAll(checks: Array<[string, number, number]>, now = Date.now()): boolean {
    if (!checks.every(([k, max, ms]) => this.peek(k, max, ms, now))) return false;
    for (const [k, max, ms] of checks) this.allow(k, max, ms, now);
    return true;
  }

  /** True if one more hit on key would be allowed; records nothing. */
  peek(key: string, max: number, ms: number, now = Date.now()): boolean {
    const e = this.hits.get(key);
    return !e || e.at.filter((t) => now - t < ms).length < max;
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

/**
 * The network an address belongs to, for caps a single network must not get around by using many
 * addresses: IPv4 by /24, IPv6 by /64 (an IPv4-mapped IPv6 address counts as IPv4).
 */
export function netKey(ip: string): string {
  const v4 = ip.replace(/^::ffff:/i, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v4)) return `v4:${v4.split(".").slice(0, 3).join(".")}`;
  if (!ip.includes(":")) return `other:${ip}`;
  const [head, tail = ""] = ip.toLowerCase().split("%")[0].split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const full = ip.includes("::") ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : left;
  return `v6:${full.slice(0, 4).map((h) => (h || "0").replace(/^0+(?=.)/, "")).join(":")}`;
}

/** Open live feeds: per address, per network (so one network can hold at most a tenth of all), and in total. */
export class NetSlots {
  private ips: Slots;
  private nets: Slots;
  constructor(perIp: number, perNet: number, max: number) {
    this.ips = new Slots(perIp, max);
    this.nets = new Slots(perNet, max);
  }

  take(ip: string): boolean {
    if (!this.ips.take(ip)) return false;
    if (this.nets.take(netKey(ip))) return true;
    this.ips.release(ip);
    return false;
  }

  release(ip: string) {
    this.ips.release(ip);
    this.nets.release(netKey(ip));
  }

  get count() {
    return this.ips.count;
  }
}

/** Live feeds across the whole public API (the exam portal demo and the playground share one pool). */
// A room of judges behind one NAT address shares one IP: demo and playground views come from the same pool.
export const FEEDS_PER_IP = envInt("JR_FEEDS_PER_IP", 60, 5, 500);
export const FEEDS_MAX = envInt("JR_FEEDS_MAX", 600, 50, 5000);
export const FEEDS_PER_NET = Math.max(FEEDS_PER_IP * 2, Math.floor(FEEDS_MAX / 10));
export const liveFeeds = new NetSlots(FEEDS_PER_IP, FEEDS_PER_NET, FEEDS_MAX);
