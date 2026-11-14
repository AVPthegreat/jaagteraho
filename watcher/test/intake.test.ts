import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { gzipSync } from "node:zlib";
import { openDb } from "../src/db/db.js";
import { allowlistEvent } from "../src/intake/allowlist.js";
import { parseEnvelope } from "../src/intake/envelope.js";
import { fingerprint } from "../src/intake/fingerprint.js";
import { mask } from "../src/intake/mask.js";
import { intakeRoutes } from "../src/intake/route.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/sdk-2.71.0-keyerror.json", import.meta.url), "utf8"));

function envelopeBytes(event: unknown, extraItems: Array<[object, string]> = []): Buffer {
  const payload = Buffer.from(JSON.stringify(event));
  const parts = [JSON.stringify(fixture.envelope_header), JSON.stringify({ type: "event", length: payload.length })];
  const head = Buffer.from(parts.join("\n") + "\n");
  const extra = extraItems.map(([h, p]) => `${JSON.stringify(h)}\n${p}\n`).join("");
  return Buffer.concat([head, payload, Buffer.from("\n" + extra)]);
}

function setup(ratePerMin = 60) {
  const db = openDb(":memory:");
  db.prepare(
    "INSERT INTO projects (id, name, public_key, kind, rate_per_min, created_at) VALUES (42, 'sandbox', 'abc123key', 'sandbox', ?, ?)",
  ).run(ratePerMin, new Date().toISOString());
  let clock = new Date("2026-11-13T02:00:00Z");
  const app = intakeRoutes({ db, now: () => clock });
  const send = (body: Buffer, key = "abc123key", gzip = true) =>
    app.request("/api/42/envelope/", {
      method: "POST",
      headers: {
        "content-type": "application/x-sentry-envelope",
        ...(gzip ? { "content-encoding": "gzip" } : {}),
        "x-sentry-auth": `Sentry sentry_key=${key}, sentry_version=7`,
      },
      body: new Uint8Array(gzip ? gzipSync(body) : body),
    });
  return { db, send, setClock: (d: Date) => (clock = d) };
}

const withId = (id: string) => ({ ...fixture.event, event_id: id });

describe("mask", () => {
  it("hides secrets and personal data", () => {
    const s = mask("user student@example.com token=abc.def sk_live_should_not_leave from 10.2.3.4 call +91 98765 43210 https://x.io/a?code=9");
    assert.ok(!s.includes("student@example.com"));
    assert.ok(!s.includes("sk_live_should_not_leave"));
    assert.ok(!s.includes("abc.def"));
    assert.ok(!s.includes("10.2.3.4"));
    assert.ok(!s.includes("98765"));
    assert.ok(!s.includes("code=9"));
  });
  it("keeps file paths, line numbers and ordinary code", () => {
    const s = "submissions/views.py line 88: lang = data['language']";
    assert.equal(mask(s), s);
  });
});

describe("envelope", () => {
  it("parses the real sentry-sdk 2.71.0 shape, including byte lengths", () => {
    const env = parseEnvelope(envelopeBytes(fixture.event, [[{ type: "session" }, "{}"]]));
    assert.equal(env.items.length, 2);
    assert.equal(env.items[0].header.type, "event");
    assert.equal(JSON.parse(env.items[0].payload.toString()).event_id, fixture.event.event_id);
  });
});

describe("allowlist", () => {
  it("drops local variables, server name and everything not allowlisted", () => {
    const clean = allowlistEvent(fixture.event)!;
    const text = JSON.stringify(clean);
    assert.ok(!text.includes("sk_live_should_not_leave"), "secret from local variables leaked");
    assert.ok(!text.includes("student@example.com"), "email from local variables leaked");
    assert.ok(!text.includes("test-host"), "server name leaked");
    assert.equal(clean.exception_type, "KeyError");
    assert.deepEqual(clean.tags, { jr_session: "sess-xyz" });
    assert.ok(clean.frames.every((f) => !("vars" in f)));
  });
  it("gives the same fingerprint when only the message changes", () => {
    const a = allowlistEvent(fixture.event)!;
    const b = allowlistEvent({ ...fixture.event, exception: { values: [{ ...fixture.event.exception.values[0], value: "'lang_2'" }] } })!;
    assert.equal(fingerprint(42, a), fingerprint(42, b));
  });
});

describe("intake route", () => {
  it("stores a real event and never stores the planted secrets", async () => {
    const { db, send } = setup();
    const res = await send(envelopeBytes(fixture.event));
    assert.equal(res.status, 200);
    const rows = db.prepare("SELECT * FROM events").all();
    assert.equal(rows.length, 1);
    const dump = JSON.stringify(db.prepare("SELECT * FROM events").all()) + JSON.stringify(db.prepare("SELECT * FROM incidents").all());
    assert.ok(!dump.includes("sk_live_should_not_leave"));
    assert.ok(!dump.includes("student@example.com"));
    assert.equal((db.prepare("SELECT COUNT(*) n FROM jobs").get() as { n: number }).n, 1);
  });

  it("groups repeats into one incident and ignores duplicates", async () => {
    const { db, send } = setup();
    await send(envelopeBytes(withId("a".repeat(32))));
    await send(envelopeBytes(withId("b".repeat(32))));
    await send(envelopeBytes(withId("b".repeat(32))));
    const inc = db.prepare("SELECT hits FROM incidents").all() as Array<{ hits: number }>;
    assert.equal(inc.length, 1);
    assert.equal(inc[0].hits, 2);
  });

  it("reopens an incident after six quiet hours", async () => {
    const { db, send, setClock } = setup();
    await send(envelopeBytes(withId("c".repeat(32))));
    setClock(new Date("2026-11-13T09:00:00Z"));
    await send(envelopeBytes(withId("d".repeat(32))));
    const inc = db.prepare("SELECT hits, reopened_count FROM incidents").get() as { hits: number; reopened_count: number };
    assert.equal(inc.reopened_count, 1);
    assert.equal(inc.hits, 1);
  });

  it("refuses a wrong key, oversized bodies and floods", async () => {
    const { send } = setup(2);
    assert.equal((await send(envelopeBytes(fixture.event), "wrong")).status, 403);
    assert.equal((await send(Buffer.alloc(300 * 1024, 65), "abc123key", false)).status, 413);
    assert.equal((await send(envelopeBytes(withId("e".repeat(32))))).status, 200);
    assert.equal((await send(envelopeBytes(withId("f".repeat(32))))).status, 200);
    assert.equal((await send(envelopeBytes(withId("0".repeat(32))))).status, 429);
  });

  it("accepts and drops non-error items such as transactions", async () => {
    const { db, send } = setup();
    const body = Buffer.from(`${JSON.stringify(fixture.envelope_header)}\n${JSON.stringify({ type: "transaction" })}\n{"x":1}\n`);
    assert.equal((await send(body)).status, 200);
    assert.equal((db.prepare("SELECT COUNT(*) n FROM events").get() as { n: number }).n, 0);
  });

  it("rejects garbage without crashing", async () => {
    const { send } = setup();
    assert.equal((await send(Buffer.from("not an envelope"))).status, 400);
  });
});

describe("intake: performance traces", () => {
  it("tells the SDK to stop sending traces and never rate-limits errors because of them", async () => {
    const { db, send } = setup(2);
    const tx = Buffer.from(`${JSON.stringify(fixture.envelope_header)}\n${JSON.stringify({ type: "transaction" })}\n{"x":1}\n`);
    for (let i = 0; i < 5; i++) {
      const res = await send(tx);
      assert.equal(res.status, 200);
      assert.match(res.headers.get("x-sentry-rate-limits") ?? "", /^3600:transaction:organization$/);
    }
    // Errors still get through: the trace flood did not use up the limit of 2 per minute.
    assert.equal((await send(envelopeBytes(withId("1".repeat(32))))).status, 200);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number }).n, 1);
  });
});
