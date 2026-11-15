// Builds a clean event from a raw Sentry event by copying only allowlisted fields.
// Nothing else survives: no request data, user details, IP, cookies, breadcrumbs, contexts,
// extra, modules, server name, or local variables. The only trace of a user is a one-way
// hash of their id (tag jr_user), used to count how many people an error affected.

import { createHmac, randomBytes } from "node:crypto";
import { clip, maskClip } from "./mask.js";

export type CleanFrame = {
  filename: string | null;
  abs_path: string | null;
  module: string | null;
  function: string | null;
  lineno: number | null;
  in_app: boolean;
  context_line: string | null;
  pre_context: string[];
  post_context: string[];
};

export type CleanEvent = {
  event_id: string;
  timestamp: string;
  level: string;
  platform: string | null;
  release: string | null;
  environment: string | null;
  transaction: string | null;
  exception_type: string;
  message: string;
  chain: string[];
  frames: CleanFrame[];
  tags: Record<string, string>;
  sdk: string | null;
  /** The SDK named a user (id, email or username; an IP address alone does not count). Never stored. */
  signed_in?: boolean;
};

const TAG_ALLOWLIST = new Set(["jr_session", "jr_flow", "jr_exam", "jr_test"]);

/** True when the event names a person by id, email or username, not only by IP address. */
export function signedIn(user: unknown): boolean {
  if (!user || typeof user !== "object" || Array.isArray(user)) return false;
  const u = user as Record<string, unknown>;
  return [u.id, u.email, u.username].some((v) => (typeof v === "string" || typeof v === "number") && String(v).trim() !== "" && !/^\{\{.*\}\}$/.test(String(v)));
}

/** A short keyed hash of whatever identifies the user, or null. "{{auto}}" placeholders are ignored. */
export function userHash(user: unknown): string | null {
  if (!user || typeof user !== "object" || Array.isArray(user)) return null;
  const u = user as Record<string, unknown>;
  const id = [u.id, u.email, u.username, u.ip_address].find((v) => (typeof v === "string" || typeof v === "number") && String(v).trim() && !/^\{\{.*\}\}$/.test(String(v)));
  if (id === undefined) return null;
  return createHmac("sha256", process.env.JR_LINK_SECRET || PROCESS_SECRET).update(String(id)).digest("hex").slice(0, 12);
}

// Without JR_LINK_SECRET, a random key for this run only: hashes stay one-way (a key published in
// the repository would let anyone test guessed emails offline), at the cost of user counts
// restarting when the server restarts.
const PROCESS_SECRET = randomBytes(32).toString("hex");
const MAX_FRAMES = 30;
const MAX_CONTEXT_LINES = 5;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === "string" ? clip(v, max) : null);
const lines = (v: unknown) =>
  Array.isArray(v)
    ? v.slice(-MAX_CONTEXT_LINES).map((l) => maskClip(l, 300) ?? "")
    : [];

function cleanFrame(f: unknown): CleanFrame | null {
  if (!isObj(f)) return null;
  return {
    filename: str(f.filename, 300),
    abs_path: str(f.abs_path, 500),
    module: str(f.module, 200),
    function: str(f.function, 200),
    lineno: typeof f.lineno === "number" && Number.isFinite(f.lineno) ? f.lineno : null,
    in_app: f.in_app === true,
    context_line: maskClip(f.context_line, 300),
    pre_context: lines(f.pre_context),
    post_context: Array.isArray(f.post_context)
      ? f.post_context.slice(0, MAX_CONTEXT_LINES).map((l) => maskClip(l, 300) ?? "")
      : [],
    // `vars` (local variables) is never copied.
  };
}

/** A finite time inside JavaScript's date range, or the fallback (1e20 seconds would throw in toISOString). */
export function toIso(ts: unknown, fallback: Date): string {
  const ms = typeof ts === "number" ? ts * 1000 : typeof ts === "string" ? Date.parse(ts) : NaN;
  const d = new Date(Number.isFinite(ms) ? ms : NaN);
  return Number.isFinite(d.getTime()) ? d.toISOString() : fallback.toISOString();
}

export function allowlistEvent(raw: unknown, now = new Date()): CleanEvent | null {
  if (!isObj(raw)) return null;

  const values = isObj(raw.exception) && Array.isArray(raw.exception.values) ? raw.exception.values.filter(isObj) : [];
  // Sentry lists chained exceptions oldest first; the last one is the one that was raised.
  const primary = values.at(-1);

  let exceptionType: string;
  let message: string;
  let frames: CleanFrame[] = [];

  if (primary) {
    exceptionType = str(primary.type, 200) ?? "Error";
    message = maskClip(primary.value, 500) ?? "";
    const rawFrames = isObj(primary.stacktrace) && Array.isArray(primary.stacktrace.frames) ? primary.stacktrace.frames : [];
    frames = rawFrames.slice(-MAX_FRAMES).map(cleanFrame).filter((x): x is CleanFrame => x !== null);
  } else {
    const logentry = isObj(raw.logentry) ? raw.logentry : null;
    const msg = raw.message ?? logentry?.formatted ?? logentry?.message;
    if (typeof msg !== "string" || !msg.trim()) return null;
    exceptionType = "Message";
    message = maskClip(msg, 500) ?? "";
  }

  const tags: Record<string, string> = {};
  const rawTags = raw.tags;
  const tagPairs: Array<[unknown, unknown]> = isObj(rawTags)
    ? Object.entries(rawTags)
    : Array.isArray(rawTags)
      ? rawTags.filter(Array.isArray).map((p) => [p[0], p[1]] as [unknown, unknown])
      : [];
  for (const [k, v] of tagPairs) {
    if (typeof k === "string" && TAG_ALLOWLIST.has(k) && typeof v === "string") tags[k] = clip(v.replace(/[^\w.:-]/g, ""), 64);
  }

  const user = userHash(raw.user);
  if (user) tags.jr_user = user;

  const sdk = isObj(raw.sdk) && typeof raw.sdk.name === "string"
    ? clip(`${raw.sdk.name} ${typeof raw.sdk.version === "string" ? raw.sdk.version : ""}`.trim(), 80)
    : null;

  return {
    event_id: typeof raw.event_id === "string" && /^[0-9a-f-]{32,36}$/i.test(raw.event_id) ? raw.event_id.replace(/-/g, "") : crypto.randomUUID().replace(/-/g, ""),
    timestamp: toIso(raw.timestamp, now),
    level: typeof raw.level === "string" && /^(fatal|error|warning|info|debug)$/.test(raw.level) ? raw.level : "error",
    platform: str(raw.platform, 40),
    release: str(raw.release, 120),
    environment: str(raw.environment, 60),
    transaction: maskClip(raw.transaction, 200),
    exception_type: exceptionType,
    message,
    chain: values.slice(0, -1).map((v) => str(v.type, 200) ?? "Error").slice(-3),
    frames,
    tags,
    sdk,
    signed_in: signedIn(raw.user),
  };
}
