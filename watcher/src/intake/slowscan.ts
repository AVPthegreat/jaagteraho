// Slow vulnerability scans, seen in the app's web-server access log (sent through the log drain, logs.ts).
//
// On 16-17 Nov 2026 one Google Cloud address sent about 11,000 requests to Faurus over ~20 hours, at
// 500-2,000 an hour, through Cloudflare, on the real domain and random *.faurus.app hosts, probing
// /.env, /key.pem, /docker-compose.yml, /.git, /@fs/..., /api/fs/read and GraphQL consoles. Every answer
// was the app's index page (200, the single-page-app fallback) or a 404, never a 5xx, so no error reached
// us and nothing was said. Burst folding (scan.ts, rule 12) only sees errors the app reports.
//
// Here we read access-log lines (nginx/Apache "combined" format) and keep, per client address, a sliding
// one-hour window of requests to paths only scanners ask for, and of distinct paths that got a 404. Past a
// threshold the owner gets ONE quiet message per address per 6 hours. Never a wake, never a flood; real
// errors keep their normal path (tracebacks in the same drain still become incidents).
//
// Privacy and retention: raw log lines are never stored (parsed, counted, dropped). Ordinary requests (a 2xx/3xx
// on an ordinary path) leave no trace at all. Counters live only in memory, bounded to 5,000 addresses, and only for
// the one-hour window: an address with nothing left in the window is forgotten (sweep), and its older totals with it.
// The in-memory "already told" mark for a reported address lasts the 6-hour repeat period. An address is written down only once it crossed the threshold, and then only as a
// one-way hash (the "already told the owner" mark); the address itself appears only in the owner's message.
// Private, loopback and the app's own server addresses (noids, health checks, the app talking to itself)
// are never counted.

import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { isSecretProbe } from "./scan.js";

export type AccessLine = { ip: string; at: number | null; method: string; path: string; status: number; bytes: number };

const MONTHS: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

// $remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent ... (the rest is ignored)
const COMBINED = /^(\S+) \S+ \S+ \[(\d\d)\/(\w{3})\/(\d{4}):(\d\d):(\d\d):(\d\d) ([+-]\d{4})\] "([^"]*)" (\d{3}) (\d+|-)/;

/** One access-log line in nginx/Apache "combined" (or "common") format, or null for any other line. */
export function parseAccessLine(text: string): AccessLine | null {
  const m = COMBINED.exec(text);
  if (!m) return null;
  const ip = m[1].replace(/^::ffff:/i, "");
  if (!isIP(ip)) return null;
  const [, , dd, mon, yyyy, hh, mi, ss, tz] = m;
  const month = MONTHS[mon];
  let at: number | null = null;
  if (month !== undefined) {
    const off = (tz[0] === "-" ? -1 : 1) * (Number(tz.slice(1, 3)) * 60 + Number(tz.slice(3, 5)));
    at = Date.UTC(Number(yyyy), month, Number(dd), Number(hh), Number(mi), Number(ss)) - off * 60_000;
  }
  const req = m[9].split(" ");
  const method = req.length >= 2 ? req[0] : "";
  const path = req.length >= 2 ? req[1] : "";
  return { ip, at, method, path, status: Number(m[10]), bytes: m[11] === "-" ? 0 : Number(m[11]) };
}

// Paths only a scanner asks for, beyond scan.ts's secret-probe segments: key and certificate files, compose
// and backup files, database dumps, dev-server file readers (Vite /@fs/, /api/fs/read), /proc, /etc/passwd.
const EXTRA_PROBE =
  /(?:\.(?:pem|key|p12|pfx|crt|sql|sqlite3?|db|bak|old|orig|swp|backup|tar(?:\.gz)?|tgz|zip|7z|rar|log)(?:$|[?#])|(?:^|\/)(?:docker-compose[\w.-]*|dockerfile|\.dockerenv|\.travis\.yml|\.gitlab-ci\.yml|\.circleci|\.github|backups?|dump|database|db_backup|web\.config|composer\.(?:json|lock)|package-lock\.json|yarn\.lock|etc\/passwd|etc\/shadow|win\.ini|console|_ignition|druid|nacos|manager\/html|owa|autodiscover|login\.action)(?:$|[/?#])|\/@fs\/|\/@vite\/|\/proc\/|\/api\/fs\/|\.\.\/|%2e%2e)/i;

/** True when the request path asks for secrets, keys, source control, dumps, consoles or server files. */
export function isSensitivePath(path: string): boolean {
  if (!path) return false;
  let p = path;
  try {
    p = decodeURIComponent(path);
  } catch {
    /* keep the raw path */
  }
  if (EXTRA_PROBE.test(p) || EXTRA_PROBE.test(path)) return true;
  // scan.ts's probe segments, except a word followed by more words ("keys-and-joins", "secret-santa"): a real page.
  return p
    .split(/[?#]/)[0]
    .split("/")
    .some((seg) => seg !== "" && !LEGIT_WORDS.test(seg) && isSecretProbe(`/${seg}`));
}

const LEGIT_WORDS = /^(?:keys?|secrets?|credentials?|graphql|swagger|solr|jenkins)-[a-z]+-/i;

/** Loopback, private, link-local, carrier-grade NAT and unique-local addresses: our own machines, never a scanner on the internet. */
export function isInternalIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 127 || a === 10 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    return x === "::1" || x === "::" || /^f[cd]/.test(x) || /^fe[89ab]/.test(x);
  }
  return true; // not an address at all: never counted
}

export type SlowScanConfig = { windowMs: number; minProbes: number; min404Paths: number; repeatMs: number; maxIps: number };

export const SLOW_SCAN_DEFAULTS: SlowScanConfig = {
  windowMs: 60 * 60_000,
  minProbes: 30,
  min404Paths: 100,
  repeatMs: 6 * 60 * 60_000,
  maxIps: 5_000,
};

const MAX_TIMES = 2_000; // per address: enough for any threshold, bounded however hard a scanner pushes
const MAX_PATHS = 400;

type Track = {
  probes: number[]; // times of sensitive-path requests in the window
  missing: Map<string, number>; // distinct 404 path -> last time seen
  first: number;
  total: number; // sensitive or 404 requests since first seen (for the message)
  status: Map<number, number>;
  sizes200: Map<number, number>; // body size of sensitive-path 200 answers -> count
  topPaths: Map<string, number>;
  last: number;
};

export type SlowScanReport = {
  projectId: number;
  ip: string;
  ipHash: string;
  since: number;
  until: number;
  probesInWindow: number;
  missingInWindow: number;
  total: number;
  status: Array<[number, number]>;
  sizes200: Array<[number, number]>;
  topPaths: Array<[string, number]>;
};

export const ipHash = (projectId: number, ip: string) => createHash("sha256").update(`jr-slowscan|${projectId}|${ip}`).digest("hex").slice(0, 24);

/** Keeps per-address windows for every project feeding access logs; returns the addresses that just crossed a threshold. */
export class SlowScanDetector {
  private tracks = new Map<string, Track>();
  /** Addresses already reported -> until when they stay quiet. A scan still going afterwards is counted afresh and gets one new message. */
  private told = new Map<string, number>();
  private cfg: SlowScanConfig;

  constructor(cfg: Partial<SlowScanConfig> = {}) {
    this.cfg = { ...SLOW_SCAN_DEFAULTS, ...cfg };
  }

  get size() {
    return this.tracks.size;
  }

  /** Drops every address with no activity inside the window, and expired "already told" marks: nothing outlives its purpose. */
  private sweep(now: number) {
    const from = now - this.cfg.windowMs;
    for (const [k, tr] of this.tracks) {
      if (tr.last > from) break; // Map order: least recently active first
      this.tracks.delete(k);
    }
    for (const [k, until] of this.told) if (until <= now) this.told.delete(k);
  }

  private remember(key: string, until: number) {
    this.told.delete(key);
    if (this.told.size >= this.cfg.maxIps) this.told.delete(this.told.keys().next().value!);
    this.told.set(key, until);
  }

  /**
   * Feeds access-log lines. ignoreIps: the app's own server addresses (project setting `own_ips`).
   * alreadyTold(hash): true when this address was reported in the last repeat period (kept by the caller in the database).
   */
  feed(projectId: number, lines: AccessLine[], now: number, ignoreIps: string[] = [], alreadyTold: (hash: string) => boolean = () => false): SlowScanReport[] {
    const out: SlowScanReport[] = [];
    const ignore = new Set(ignoreIps.map((x) => x.trim().toLowerCase()).filter(Boolean));
    const { windowMs } = this.cfg;
    this.sweep(now);
    for (const l of lines) {
      if (isInternalIp(l.ip) || ignore.has(l.ip.toLowerCase())) continue;
      const key = `${projectId}|${l.ip}`;
      const toldUntil = this.told.get(key);
      if (toldUntil !== undefined) {
        if (toldUntil > now) continue; // reported in the last repeat period: nothing to count
        this.told.delete(key);
      }
      const sensitive = isSensitivePath(l.path);
      const missing = l.status === 404;
      if (!sensitive && !missing) continue; // ordinary traffic leaves no trace
      // The line's own time (a drain may deliver late), never in the future, never older than the window.
      const t = l.at !== null && Number.isFinite(l.at) ? Math.min(Math.max(l.at, now - windowMs), now) : now;
      let tr = this.tracks.get(key);
      if (tr) this.tracks.delete(key);
      else {
        if (this.tracks.size >= this.cfg.maxIps) this.tracks.delete(this.tracks.keys().next().value!);
        tr = { probes: [], missing: new Map(), first: t, total: 0, status: new Map(), sizes200: new Map(), topPaths: new Map(), last: t };
      }
      this.tracks.set(key, tr); // most recently active last: the oldest is evicted first

      const from = t - windowMs;
      while (tr.probes.length && tr.probes[0] <= from) tr.probes.shift();
      for (const [p, s] of tr.missing) if (s <= from) tr.missing.delete(p);
      if (tr.probes.length === 0 && tr.missing.size === 0) {
        // Nothing left in the window: forget everything older (retention is the one-hour window only).
        tr.first = t;
        tr.total = 0;
        tr.status.clear();
        tr.sizes200.clear();
        tr.topPaths.clear();
      }

      const path = l.path.split("?")[0].slice(0, 200);
      if (sensitive) {
        tr.probes.push(t);
        if (tr.probes.length > MAX_TIMES) tr.probes.shift();
        // At most 50 distinct sizes are kept; past that the message already says "check".
        if (l.status === 200 && (tr.sizes200.has(l.bytes) || tr.sizes200.size < 50)) tr.sizes200.set(l.bytes, (tr.sizes200.get(l.bytes) ?? 0) + 1);
      }
      if (missing) {
        tr.missing.delete(path);
        tr.missing.set(path, t);
        if (tr.missing.size > MAX_PATHS) tr.missing.delete(tr.missing.keys().next().value!);
      }
      tr.total++;
      tr.last = Math.max(tr.last, t);
      tr.status.set(l.status, (tr.status.get(l.status) ?? 0) + 1);
      if (tr.topPaths.has(path) || tr.topPaths.size < MAX_PATHS) tr.topPaths.set(path, (tr.topPaths.get(path) ?? 0) + 1);

      const over = tr.probes.length >= this.cfg.minProbes || tr.missing.size >= this.cfg.min404Paths;
      if (!over) continue;
      const hash = ipHash(projectId, l.ip);
      // Either way the address is quiet for the repeat period: told now, or told before a restart (the caller's database).
      this.tracks.delete(key);
      this.remember(key, now + this.cfg.repeatMs);
      if (alreadyTold(hash)) continue;
      out.push({
        projectId,
        ip: l.ip,
        ipHash: hash,
        since: tr.first,
        until: tr.last,
        probesInWindow: tr.probes.length,
        missingInWindow: tr.missing.size,
        total: tr.total,
        status: [...tr.status].sort((a, b) => b[1] - a[1]),
        sizes200: [...tr.sizes200].sort((a, b) => b[1] - a[1]),
        topPaths: [...tr.topPaths].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 6),
      });
    }
    return out;
  }
}
