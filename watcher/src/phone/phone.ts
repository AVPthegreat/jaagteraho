// Real phone call on a WAKE, through Twilio's REST API (no SDK). Off unless all four
// JR_TWILIO_* settings are present. Like the voice note, the spoken text is written by code from
// the app name, flow name and counts, never from error text, so no personal data reaches Twilio.
//
// "Press 1" acknowledges the incident exactly like the Telegram Acknowledge button. The keypress
// comes back to /twilio/ack/<token>: the request must carry a valid X-Twilio-Signature, and the
// token is signed, single use and short-lived (never a guessable id).

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Hono, type Context } from "hono";
import { getSettings, type DB } from "../db/db.js";

export type PhoneConfig = {
  sid: string;
  token: string;
  from: string;
  to: string;
  /** Public https origin Twilio can reach for the keypress; null = no "press 1" (ack in Telegram only). */
  publicBase: string | null;
  /** Only projects linked to this Telegram user call (optional). Outside developers' apps never call. */
  ownerUserId: number | null;
  repeats: number;
  maxPerDay: number;
  voice: string;
};

export type CallInfo = { project: string; flow: string; hits: number; exam: boolean };
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export const MAX_CALL_SERIES_PER_12H = 3; // the same cap as wakes: 3 a night per app
const TOKEN_TTL_MS = 30 * 60_000;
const API = "https://api.twilio.com/2010-04-01";

export function phoneConfig(env: NodeJS.ProcessEnv = process.env): PhoneConfig | null {
  const { JR_TWILIO_ACCOUNT_SID: sid, JR_TWILIO_AUTH_TOKEN: token, JR_TWILIO_FROM: from, JR_TWILIO_TO: to } = env;
  if (!sid || !token || !from || !to) return null;
  let publicBase: string | null = null;
  const raw = env.JR_TWILIO_PUBLIC_URL || env.JR_PUBLIC_INTAKE_URL;
  if (raw) {
    try {
      const u = new URL(raw);
      if (u.protocol === "https:") publicBase = u.origin;
    } catch {
      publicBase = null;
    }
  }
  const int = (v: string | undefined, d: number, lo: number, hi: number) => {
    const n = Number(v);
    return v !== undefined && v !== "" && Number.isInteger(n) && n >= lo && n <= hi ? n : d;
  };
  return {
    sid,
    token,
    from,
    to,
    publicBase,
    ownerUserId: env.JR_TWILIO_OWNER_USER_ID ? Number(env.JR_TWILIO_OWNER_USER_ID) || null : null,
    repeats: int(env.JR_TWILIO_REPEATS, 3, 0, 3),
    maxPerDay: int(env.JR_TWILIO_MAX_CALLS_PER_DAY, 12, 1, 50),
    voice: env.JR_TWILIO_VOICE || "Polly.Aditi",
  };
}

/** "+919876543210" -> "*********210". Used for every phone number that reaches a log. */
export function maskNumber(n: string): string {
  const s = String(n);
  return s.length <= 3 ? "***" : "*".repeat(s.length - 3) + s.slice(-3);
}

/** Masks any phone-number-like run of digits inside free text (Twilio error messages can quote numbers). */
export function maskText(s: string): string {
  return s.replace(/\+?\d[\d\s-]{5,}\d/g, (m) => maskNumber(m.replace(/[\s-]/g, "")));
}

const xml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

export function callText(info: CallInfo, attempt: number, repeats: number): string {
  const n = info.hits;
  const head = attempt > 0 ? `Repeat call ${attempt} of ${repeats}. ` : "";
  return `${head}JaagteRaho alert for ${info.project}. Critical: ${info.flow} is failing${info.exam ? " during an exam" : ""}. ${n} ${n === 1 ? "failure" : "failures"} so far. Open Telegram to see the cause and the proposed fix.`;
}

export function callTwiml(text: string, voice: string, ackUrl: string | null): string {
  const say = (t: string) => `<Say voice="${xml(voice)}" language="en-IN">${xml(t)}</Say>`;
  if (!ackUrl) return `<Response>${say(`${text} Tap Acknowledge in Telegram to stop the alerts.`)}</Response>`;
  return (
    `<Response><Gather numDigits="1" timeout="8" method="POST" action="${xml(ackUrl)}">${say(text)}<Pause length="1"/>${say("Press 1 to acknowledge.")}</Gather>` +
    `${say("No key was pressed. Tap Acknowledge in Telegram to stop the alerts. Goodbye.")}</Response>`
  );
}

/** Twilio's request signature: base64(HMAC-SHA1(authToken, url + sorted key/value pairs)). */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export class Phone {
  constructor(
    private db: DB,
    readonly cfg: PhoneConfig,
    private fetchImpl: FetchLike = (u, i) => fetch(u, i),
  ) {}

  get repeats() {
    return this.cfg.repeats;
  }

  /** Only our own apps (or the configured owner's) ring the env number; outside developers' apps never do. */
  eligible(projectId: number): boolean {
    if (getSettings(this.db, projectId).outside === true) return false;
    if (this.cfg.ownerUserId === null) return true;
    const o = this.db.prepare("SELECT user_id FROM owners WHERE project_id = ?").get(projectId) as { user_id: number } | undefined;
    return o?.user_id === this.cfg.ownerUserId;
  }

  private callsSince(ms: number): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM phone_calls WHERE created_at > ? AND status != 'skipped'").get(new Date(Date.now() - ms).toISOString()) as { n: number }).n;
  }

  private seriesSince(projectId: number, ms: number): number {
    return (
      this.db
        .prepare("SELECT COUNT(DISTINCT incident_id) AS n FROM phone_calls WHERE project_id = ? AND attempt = 0 AND status != 'failed' AND created_at > ?")
        .get(projectId, new Date(Date.now() - ms).toISOString()) as { n: number }
    ).n;
  }

  /** First call for a WAKE. Returns the call SID, or null when held by a cap or a Twilio error. */
  async wake(incidentId: number, projectId: number, info: CallInfo): Promise<string | null> {
    if (!this.eligible(projectId)) return null;
    if (this.seriesSince(projectId, 12 * 3_600_000) >= MAX_CALL_SERIES_PER_12H) {
      console.log(`phone: call held for incident ${incidentId} (${MAX_CALL_SERIES_PER_12H} call wakes already in 12 hours)`);
      return null;
    }
    return this.place(incidentId, projectId, 0, info);
  }

  /** A repeat call, placed with the Telegram ping, only if this incident already had a call. */
  async repeat(incidentId: number, attempt: number): Promise<string | null> {
    if (attempt < 1 || attempt > this.cfg.repeats) return null;
    const first = this.db
      .prepare("SELECT project_id, info FROM phone_calls WHERE incident_id = ? AND attempt = 0 AND status != 'failed' ORDER BY id DESC LIMIT 1")
      .get(incidentId) as { project_id: number; info: string | null } | undefined;
    if (!first?.info) return null;
    if (this.db.prepare("SELECT 1 FROM phone_calls WHERE incident_id = ? AND attempt = ? AND created_at > (SELECT MAX(created_at) FROM phone_calls WHERE incident_id = ? AND attempt = 0)").get(incidentId, attempt, incidentId)) return null;
    const info = JSON.parse(first.info) as CallInfo;
    const hits = this.db.prepare("SELECT hits FROM incidents WHERE id = ?").get(incidentId) as { hits: number } | undefined;
    return this.place(incidentId, first.project_id, attempt, { ...info, hits: hits?.hits ?? info.hits });
  }

  private async place(incidentId: number, projectId: number, attempt: number, info: CallInfo): Promise<string | null> {
    if (this.callsSince(86_400_000) >= this.cfg.maxPerDay) {
      console.log(`phone: call held for incident ${incidentId} (${this.cfg.maxPerDay} calls already today)`);
      return null;
    }
    const nonce = randomBytes(18).toString("base64url");
    const rowId = Number(
      this.db
        .prepare("INSERT INTO phone_calls (incident_id, project_id, attempt, token_hash, status, info, created_at) VALUES (?, ?, ?, ?, 'placing', ?, ?)")
        .run(incidentId, projectId, attempt, sha256(nonce), JSON.stringify(info), new Date().toISOString()).lastInsertRowid,
    );
    const ackUrl = this.cfg.publicBase ? `${this.cfg.publicBase}/twilio/ack/${this.signToken(rowId, nonce)}` : null;
    // With a public URL, Twilio fetches the call script from us (signed, per call). Trial accounts refuse an
    // inline Twiml parameter ("trial accounts have limited parameter access"); a script URL works on both.
    const script: Record<string, string> = this.cfg.publicBase
      ? { Url: `${this.cfg.publicBase}/twilio/twiml/${this.signToken(rowId, nonce)}` }
      : { Twiml: callTwiml(callText(info, attempt, this.cfg.repeats), this.cfg.voice, ackUrl) };
    // No Timeout parameter: trial accounts refuse it too; Twilio rings for its default 60 s.
    const body = new URLSearchParams({ To: this.cfg.to, From: this.cfg.from, ...script });
    try {
      const res = await this.fetchImpl(`${API}/Accounts/${encodeURIComponent(this.cfg.sid)}/Calls.json`, {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${this.cfg.sid}:${this.cfg.token}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
        signal: AbortSignal.timeout(10_000),
      });
      const out = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; message?: string; code?: number };
      if (!res.ok || !out.sid) throw new Error(`twilio ${res.status}${out.code ? ` (${out.code})` : ""}: ${maskText(String(out.message ?? "no call id")).slice(0, 200)}`);
      this.db.prepare("UPDATE phone_calls SET sid = ?, status = ? WHERE id = ?").run(out.sid, out.status ?? "queued", rowId);
      console.log(`phone: call ${attempt === 0 ? "placed" : `repeat ${attempt} placed`} for incident ${incidentId} to ${maskNumber(this.cfg.to)} (${out.sid.slice(0, 2)}…${out.sid.slice(-6)}, ${out.status ?? "queued"})`);
      return out.sid;
    } catch (e) {
      this.db.prepare("UPDATE phone_calls SET status = 'failed' WHERE id = ?").run(rowId);
      console.error(`phone: call for incident ${incidentId} failed:`, maskText(String(e instanceof Error ? e.message : e)));
      return null;
    }
  }

  private tokenKey() {
    return createHmac("sha256", this.cfg.token).update("jaagteraho phone ack v1").digest();
  }

  signToken(rowId: number, nonce: string): string {
    const payload = `${rowId}.${nonce}`;
    return `${payload}.${createHmac("sha256", this.tokenKey()).update(payload).digest("base64url").slice(0, 32)}`;
  }

  /** The call row a token names, if the signature is ours and the token is not expired. Does not spend it. */
  peek(token: string): { id: number; info: CallInfo; attempt: number } | null {
    const m = /^(\d{1,12})\.([A-Za-z0-9_-]{24})\.([A-Za-z0-9_-]{32})$/.exec(token);
    if (!m || !safeEqual(this.signToken(Number(m[1]), m[2]), token)) return null;
    const row = this.db.prepare("SELECT token_hash, info, attempt, created_at FROM phone_calls WHERE id = ?").get(Number(m[1])) as
      | { token_hash: string | null; info: string | null; attempt: number; created_at: string }
      | undefined;
    if (!row?.info || !row.token_hash || !safeEqual(row.token_hash, sha256(m[2]))) return null;
    if (Date.now() - Date.parse(row.created_at) > TOKEN_TTL_MS) return null;
    return { id: Number(m[1]), info: JSON.parse(row.info) as CallInfo, attempt: row.attempt };
  }

  /** Checks and spends a one-time token. Returns the incident id, or null if forged, used or expired. */
  redeem(token: string): number | null {
    const m = /^(\d{1,12})\.([A-Za-z0-9_-]{24})\.([A-Za-z0-9_-]{32})$/.exec(token);
    if (!m) return null;
    const expect = this.signToken(Number(m[1]), m[2]);
    if (!safeEqual(expect, token)) return null;
    const row = this.db.prepare("SELECT incident_id, token_hash, created_at, used_at FROM phone_calls WHERE id = ?").get(Number(m[1])) as
      | { incident_id: number; token_hash: string | null; created_at: string; used_at: string | null }
      | undefined;
    if (!row || row.used_at || !row.token_hash || !safeEqual(row.token_hash, sha256(m[2]))) return null;
    if (Date.now() - Date.parse(row.created_at) > TOKEN_TTL_MS) return null;
    const spent = this.db.prepare("UPDATE phone_calls SET used_at = ? WHERE id = ? AND used_at IS NULL").run(new Date().toISOString(), Number(m[1])).changes === 1;
    return spent ? row.incident_id : null;
  }

  /** POST /twilio/ack/:token, called by Twilio when the owner presses a key during the call. */
  routes(onAck: (incidentId: number) => Promise<void>) {
    const app = new Hono();
    const twiml = (body: string, status: 200 | 403 = 200) =>
      new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, { status, headers: { "content-type": "text/xml" } });
    const say = (t: string) => `<Say voice="${xml(this.cfg.voice)}" language="en-IN">${xml(t)}</Say>`;
    const signed = async (c: Context): Promise<Record<string, string> | null> => {
      const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(form)) if (typeof v === "string") params[k] = v;
      const sig = c.req.header("x-twilio-signature") ?? "";
      const url = `${this.cfg.publicBase}${c.req.path}`;
      return sig && safeEqual(twilioSignature(this.cfg.token, url, params), sig) ? params : null;
    };
    // POST /twilio/twiml/:token: Twilio fetches the call script for a call we placed.
    app.post("/twilio/twiml/:token", async (c) => {
      if (!this.cfg.publicBase) return c.text("forbidden", 403);
      if (!(await signed(c))) {
        console.log("phone: call script refused (bad Twilio signature)");
        return c.text("forbidden", 403);
      }
      const call = this.peek(c.req.param("token"));
      if (!call) {
        console.log("phone: call script asked for an unknown or expired call");
        return twiml(say("This JaagteRaho alert has expired. Goodbye."));
      }
      console.log(`phone: call script served (attempt ${call.attempt})`);
      const ackUrl = `${this.cfg.publicBase}/twilio/ack/${c.req.param("token")}`;
      return new Response(`<?xml version="1.0" encoding="UTF-8"?>${callTwiml(callText(call.info, call.attempt, this.cfg.repeats), this.cfg.voice, ackUrl)}`, {
        headers: { "content-type": "text/xml" },
      });
    });
    app.post("/twilio/ack/:token", async (c) => {
      if (!this.cfg.publicBase) return c.text("forbidden", 403);
      const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(form)) if (typeof v === "string") params[k] = v;
      const sig = c.req.header("x-twilio-signature") ?? "";
      const url = `${this.cfg.publicBase}${c.req.path}`;
      if (!sig || !safeEqual(twilioSignature(this.cfg.token, url, params), sig)) return c.text("forbidden", 403);
      if (params.Digits !== "1") return twiml(say("Only 1 acknowledges. Tap Acknowledge in Telegram to stop the alerts. Goodbye."));
      const incidentId = this.redeem(c.req.param("token"));
      if (incidentId === null) return twiml(say("This alert was already acknowledged or has expired. Goodbye."));
      this.db.prepare("UPDATE alerts SET acked = 1 WHERE incident_id = ?").run(incidentId);
      this.db.prepare("UPDATE phone_calls SET status = 'acknowledged' WHERE id = ?").run(Number(c.req.param("token").split(".")[0]));
      await onAck(incidentId).catch((e) => console.error("phone ack follow-up:", e));
      console.log(`phone: incident ${incidentId} acknowledged by keypress`);
      return twiml(say("Acknowledged. The repeat alerts are stopped. The cause and the proposed fix are in Telegram. Goodbye."));
    });
    return app;
  }
}

export function makePhone(db: DB, env: NodeJS.ProcessEnv = process.env): Phone | null {
  const cfg = phoneConfig(env);
  if (!cfg) return null;
  console.log(`phone: wake-up calls on, to ${maskNumber(cfg.to)}${cfg.publicBase ? ", press 1 to acknowledge" : ", no public URL so acknowledge in Telegram only"}`);
  return new Phone(db, cfg);
}
