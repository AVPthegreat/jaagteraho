// Phone wake-up call (Twilio) with a stand-in fetch: calls only on WAKE, press 1 acknowledges
// through a signed one-time link with a valid Twilio signature, and no config means no calls.

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { openDb } from "../src/db/db.js";
import type { CleanEvent } from "../src/intake/allowlist.js";
import { storeEvent } from "../src/intake/store.js";
import { phoneAllowedFor, Worker } from "../src/pipeline/worker.js";
import { callTwiml, maskNumber, maskText, phoneConfig, Phone, twilioSignature } from "../src/phone/phone.js";
import type { Telegram } from "../src/telegram/api.js";

const SANDBOX = fileURLToPath(new URL("../../sandbox", import.meta.url)).replace(/\/$/, "");
const ENV = {
  JR_TWILIO_ACCOUNT_SID: "AC0000000000000000000000000000test",
  JR_TWILIO_AUTH_TOKEN: "test-auth-token",
  JR_TWILIO_FROM: "+15005550006",
  JR_TWILIO_TO: "+919876543210",
  JR_PUBLIC_INTAKE_URL: "https://jr-api.example.test",
} as NodeJS.ProcessEnv;
// These tests ring on the demo portal (a sandbox project), which needs the founder's own-demo switch.
process.env.JR_DEMO_PHONE = "1";

function fakeFetch() {
  const calls: Array<{ url: string; body: URLSearchParams; auth: string }> = [];
  let n = 0;
  const impl = async (url: string, init: RequestInit) => {
    calls.push({ url, body: new URLSearchParams(String(init.body)), auth: String((init.headers as Record<string, string>).authorization) });
    return new Response(JSON.stringify({ sid: `CA${String(++n).padStart(32, "0")}`, status: "queued" }), { status: 201 });
  };
  return { impl, calls };
}

function fakeTelegram() {
  const sent: string[] = [];
  let id = 100;
  const tg = {
    send: async (_chat: number, text: string) => (sent.push(text), { message_id: ++id, chat: { id: 1, type: "private" } }),
    edit: async () => undefined,
    sendVoice: async () => undefined,
    call: async (_m: string, p: { text?: string }) => (p.text && sent.push(p.text), {}),
    answer: async () => undefined,
  } as unknown as Telegram;
  return { tg, sent };
}

function setup(settings: Record<string, unknown> = { critical: [{ name: "code submission", match: "/api/submit" }] }) {
  const db = openDb(":memory:");
  db.prepare("INSERT INTO projects (id, name, public_key, kind, repo, repo_access, settings, created_at) VALUES (1, 'exam portal', 'k', 'sandbox', ?, 'sandbox-write', ?, ?)").run(
    `local:${SANDBOX}`,
    JSON.stringify(settings),
    new Date().toISOString(),
  );
  db.prepare("INSERT INTO owners (project_id, chat_id, user_id, linked_at) VALUES (1, 42, 7, ?)").run(new Date().toISOString());
  return db;
}

const event = (exam: "on" | "off", route = "/api/submit"): CleanEvent => ({
  event_id: Math.random().toString(16).slice(2).padEnd(32, "0"),
  timestamp: new Date().toISOString(),
  level: "error",
  platform: "python",
  release: "test",
  environment: "test",
  transaction: route,
  exception_type: "KeyError",
  message: "'language'",
  chain: [],
  frames: [{ filename: "portal/submissions.py", abs_path: `${SANDBOX}/portal/submissions.py`, module: "portal.submissions", function: "prepare_submission", lineno: 14, in_app: true, context_line: '    language = data["language"]', pre_context: [], post_context: [] }],
  tags: { jr_exam: exam, jr_session: "sess-phone" },
  sdk: "test",
});

async function drain(db: ReturnType<typeof openDb>, worker: Worker) {
  worker.start();
  for (let i = 0; i < 100; i++) {
    const n = (db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('queued', 'running')").get() as { n: number }).n;
    if (n === 0) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  worker.stop();
}

/** Posts the keypress the way Twilio would, signed with the auth token (or a wrong one). */
async function press(phone: Phone, ackUrl: string, digits: string, token = ENV.JR_TWILIO_AUTH_TOKEN!) {
  const params = { CallSid: "CA1", Digits: digits, From: "+15005550006" };
  const path = new URL(ackUrl).pathname;
  return phone.routes(async () => undefined).request(path, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": twilioSignature(token, ackUrl, params) },
    body: new URLSearchParams(params).toString(),
  });
}

const ackUrlOf = (twiml: string) => /action="([^"]+)"/.exec(twiml)![1].replace(/&amp;/g, "&");

/** The call script Twilio would play: fetched from our signed script URL the way Twilio does it. */
async function scriptOf(phone: Phone, body: URLSearchParams, token = ENV.JR_TWILIO_AUTH_TOKEN!): Promise<string> {
  const inline = body.get("Twiml");
  if (inline) return inline;
  const url = body.get("Url")!;
  const params = { CallSid: "CA1", From: "+15005550006" };
  const res = await phone.routes(async () => undefined).request(new URL(url).pathname, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": twilioSignature(token, url, params) },
    body: new URLSearchParams(params).toString(),
  });
  assert.equal(res.status, 200, "the call script is served to a signed request");
  return res.text();
}

describe("phone wake-up call", () => {
  it("is off unless all four Twilio settings are present", () => {
    assert.equal(phoneConfig({}), null);
    assert.equal(phoneConfig({ ...ENV, JR_TWILIO_TO: "" }), null);
    assert.equal(phoneConfig({ ...ENV, JR_TWILIO_AUTH_TOKEN: undefined }), null);
    const cfg = phoneConfig(ENV)!;
    assert.equal(cfg.publicBase, "https://jr-api.example.test");
    assert.equal(cfg.repeats, 3);
    // No https public URL: the call still rings but has no keypress link.
    assert.equal(phoneConfig({ ...ENV, JR_PUBLIC_INTAKE_URL: "http://127.0.0.1:8787" })!.publicBase, null);
  });

  it("masks phone numbers in logs", () => {
    assert.equal(maskNumber("+919876543210"), "**********210");
    assert.equal(maskText("The number +91 98765 43210 is unverified"), "The number **********210 is unverified");
  });

  it("the public demo never rings the phone unless JR_DEMO_PHONE=1", async () => {
    assert.equal(phoneAllowedFor("sandbox", {}), false);
    assert.equal(phoneAllowedFor("sandbox", { JR_DEMO_PHONE: "0" }), false);
    assert.equal(phoneAllowedFor("sandbox", { JR_DEMO_PHONE: "1" }), true);
    assert.equal(phoneAllowedFor("faurus", {}), true);
    const before = process.env.JR_DEMO_PHONE;
    delete process.env.JR_DEMO_PHONE;
    try {
      const db = setup();
      const f = fakeFetch();
      const { tg, sent } = fakeTelegram();
      storeEvent(db, 1, event("on"));
      await drain(db, new Worker(db, null, tg, null, new Phone(db, phoneConfig(ENV)!, f.impl)));
      assert.equal((db.prepare("SELECT action FROM decisions").get() as { action: string }).action, "wake");
      assert.equal(sent.length >= 1, true, "the Telegram alert still goes out");
      assert.equal(f.calls.length, 0, "no Twilio call for an anonymous demo visitor");
    } finally {
      process.env.JR_DEMO_PHONE = before;
    }
  });

  it("calls on WAKE (critical flow during an exam), with no error text in the spoken words", async () => {
    const db = setup();
    const f = fakeFetch();
    const phone = new Phone(db, phoneConfig(ENV)!, f.impl);
    const { tg, sent } = fakeTelegram();
    storeEvent(db, 1, event("on"));
    await drain(db, new Worker(db, null, tg, null, phone));
    assert.equal((db.prepare("SELECT action FROM decisions").get() as { action: string }).action, "wake");
    assert.equal(sent.length >= 1, true, "the Telegram alert still goes out");
    assert.equal(f.calls.length, 1);
    const c = f.calls[0];
    assert.match(c.url, /\/Accounts\/AC0000000000000000000000000000test\/Calls\.json$/);
    assert.equal(c.auth, `Basic ${Buffer.from(`${ENV.JR_TWILIO_ACCOUNT_SID}:${ENV.JR_TWILIO_AUTH_TOKEN}`).toString("base64")}`);
    assert.equal(c.body.get("To"), ENV.JR_TWILIO_TO);
    const twiml = await scriptOf(phone, c.body);
    assert.match(twiml, /JaagteRaho alert for exam portal\. Critical: code submission is failing during an exam\./);
    assert.match(twiml, /<Gather numDigits="1"[^>]*action="https:\/\/jr-api\.example\.test\/twilio\/ack\//);
    assert.doesNotMatch(twiml, /'language'|KeyError/);
  });

  it("serves the call script only to Twilio-signed requests, and sends a script URL (trial accounts refuse inline Twiml)", async () => {
    const db = setup();
    const f = fakeFetch();
    const phone = new Phone(db, phoneConfig(ENV)!, f.impl);
    const { tg } = fakeTelegram();
    storeEvent(db, 1, event("on"));
    await drain(db, new Worker(db, null, tg, null, phone));
    const body = f.calls[0].body;
    assert.equal(body.get("Twiml"), null);
    assert.match(body.get("Url")!, /^https:\/\/jr-api\.example\.test\/twilio\/twiml\//);
    const path = new URL(body.get("Url")!).pathname;
    const forged = await phone.routes(async () => undefined).request(path, { method: "POST", headers: { "x-twilio-signature": "nope" }, body: "" });
    assert.equal(forged.status, 403);
    // Unsigned (Twilio may omit the signature) with a guessed token: nothing about the call is revealed.
    const wrongToken = await phone.routes(async () => undefined).request(path.replace(/\.[^.]+$/, ".AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), { method: "POST" });
    const wrongText = await wrongToken.text();
    assert.match(wrongText, /has expired/);
    assert.doesNotMatch(wrongText, /exam portal|Press 1/);
    // Unsigned with the real per-call link: served (seen live: Twilio sent no X-Twilio-Signature).
    const unsignedReal = await phone.routes(async () => undefined).request(path, { method: "POST", body: new URLSearchParams({ CallSid: "CA1" }) });
    assert.match(await unsignedReal.text(), /Press 1 to acknowledge/);
    assert.match(await scriptOf(phone, body), /Press 1 to acknowledge/);
  });

  it("does not call on notify or log", async () => {
    for (const settings of [{ critical: [{ name: "code submission", match: "/api/submit" }] }, {}]) {
      const db = setup(settings);
      const f = fakeFetch();
      const { tg } = fakeTelegram();
      // No exam: a critical flow is "notify"; a non-critical route without AI is at most notify/log.
      storeEvent(db, 1, event("off", Object.keys(settings).length ? "/api/submit" : "/api/other"));
      await drain(db, new Worker(db, null, tg, null, new Phone(db, phoneConfig(ENV)!, f.impl)));
      const action = (db.prepare("SELECT action FROM decisions").get() as { action: string }).action;
      assert.notEqual(action, "wake");
      assert.equal(f.calls.length, 0, `no call for ${action}`);
    }
  });

  it("never calls for an outside developer's app", async () => {
    const db = setup({ critical: [{ name: "code submission", match: "/api/submit" }], outside: true });
    const f = fakeFetch();
    const phone = new Phone(db, phoneConfig(ENV)!, f.impl);
    assert.equal(await phone.wake(1, 1, { project: "x", flow: "y", hits: 1, exam: true }), null);
    assert.equal(f.calls.length, 0);
  });

  it("press 1 with a valid signature acknowledges and stops the repeats; the link works once", async () => {
    const db = setup();
    const f = fakeFetch();
    const phone = new Phone(db, phoneConfig(ENV)!, f.impl);
    const { tg } = fakeTelegram();
    const worker = new Worker(db, null, tg, null, phone);
    storeEvent(db, 1, event("on"));
    await drain(db, worker);
    const incident = (db.prepare("SELECT id FROM incidents").get() as { id: number }).id;

    // A repeat is placed while unacknowledged.
    assert.ok(await phone.repeat(incident, 1));
    assert.equal(f.calls.length, 2);
    assert.match((await scriptOf(phone, f.calls[1].body)), /Repeat call 1 of 3\./);

    const res = await press(phone, ackUrlOf((await scriptOf(phone, f.calls[0].body))), "1");
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Acknowledged/);
    assert.equal((db.prepare("SELECT acked FROM alerts WHERE incident_id = ?").get(incident) as { acked: number }).acked, 1);

    // The worker's ping loop now finds nothing to repeat: no further Telegram ping, no further call.
    db.prepare("UPDATE alerts SET last_ping_at = ? WHERE incident_id = ?").run(new Date(Date.now() - 10 * 60_000).toISOString(), incident);
    await (worker as unknown as { pings(): Promise<void> }).pings();
    assert.equal(f.calls.length, 2);

    // The same link cannot be used twice.
    const again = await press(phone, ackUrlOf((await scriptOf(phone, f.calls[0].body))), "1");
    assert.match(await again.text(), /already acknowledged or has expired/);
  });

  it("an unacknowledged wake repeats with the ping, up to the cap", async () => {
    const db = setup();
    const f = fakeFetch();
    const phone = new Phone(db, phoneConfig(ENV)!, f.impl);
    const { tg } = fakeTelegram();
    const worker = new Worker(db, null, tg, null, phone);
    storeEvent(db, 1, event("on"));
    await drain(db, worker);
    for (let i = 0; i < 5; i++) {
      db.prepare("UPDATE alerts SET last_ping_at = ?").run(new Date(Date.now() - 10 * 60_000).toISOString());
      await (worker as unknown as { pings(): Promise<void> }).pings();
    }
    assert.equal(f.calls.length, 4, "first call + 3 repeats");
  });

  it("rejects a bad signature (403) and a forged token; the real link works without a signature", async () => {
    const db = setup();
    const f = fakeFetch();
    const phone = new Phone(db, phoneConfig(ENV)!, f.impl);
    await phone.wake(5, 1, { project: "exam portal", flow: "code submission", hits: 2, exam: true });
    const url = ackUrlOf((await scriptOf(phone, f.calls[0].body)));
    const bad = await press(phone, url, "1", "wrong-token");
    assert.equal(bad.status, 403);
    // A guessed token (right shape, wrong signature) acknowledges nothing, signed or not.
    const forged = url.replace(/\.[A-Za-z0-9_-]{32}$/, `.${"A".repeat(32)}`);
    const r = await press(phone, forged, "1");
    assert.match(await r.text(), /already acknowledged or has expired/);
    const unsignedForged = await phone.routes(async () => undefined).request(new URL(forged).pathname, { method: "POST", body: new URLSearchParams({ Digits: "1" }) });
    assert.match(await unsignedForged.text(), /already acknowledged or has expired/);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM phone_calls WHERE used_at IS NOT NULL").get() as { n: number }).n, 0);
    // The real link without a signature (Twilio may omit it) acknowledges once.
    const unsigned = await phone.routes(async () => undefined).request(new URL(url).pathname, { method: "POST", body: new URLSearchParams({ Digits: "1" }) });
    assert.match(await unsigned.text(), /Acknowledged/);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM phone_calls WHERE used_at IS NOT NULL").get() as { n: number }).n, 1);
  });

  it("holds calls past 3 wakes in 12 hours per app, and logs a Twilio error without throwing", async () => {
    const db = setup();
    const f = fakeFetch();
    const phone = new Phone(db, phoneConfig(ENV)!, f.impl);
    const info = { project: "exam portal", flow: "code submission", hits: 1, exam: true };
    for (const id of [1, 2, 3, 4]) await phone.wake(id, 1, info);
    assert.equal(f.calls.length, 3);
    const failing = new Phone(setup(), phoneConfig(ENV)!, async () => new Response(JSON.stringify({ code: 21608, message: "The number +919876543210 is unverified" }), { status: 400 }));
    assert.equal(await failing.wake(1, 1, info), null);
  });

  it("builds TwiML that escapes names", () => {
    const t = callTwiml('Alert for <b>&"', "Polly.Aditi", null);
    assert.match(t, /&lt;b&gt;&amp;&quot;/);
    assert.doesNotMatch(t, /<Gather/);
  });
});
