import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openDb } from "../src/db/db.js";
import { renderCard, renderWhy } from "../src/telegram/card.js";

// Telegram refuses a whole message if its HTML is malformed, so an alert would be lost.
function balanced(html: string): boolean {
  const stack: string[] = [];
  for (const m of html.matchAll(/<(\/?)([a-z]+)[^>]*>/g)) {
    if (!["b", "i", "code", "a", "pre"].includes(m[2])) return false;
    if (m[1]) {
      if (stack.pop() !== m[2]) return false;
    } else stack.push(m[2]);
  }
  return stack.length === 0;
}

function seed() {
  const db = openDb(":memory:");
  const now = new Date().toISOString();
  db.prepare("INSERT INTO projects (id, name, public_key, kind, created_at) VALUES (1, 'shop <&> co', 'k', 'sandbox', ?)").run(now);
  db.prepare("INSERT INTO incidents (id, project_id, fingerprint, exception_type, transaction_name, first_seen, last_seen, hits) VALUES (1, 1, 'f', 'KeyError', '/api/<submit>', ?, ?, 3)").run(now, now);
  db.prepare("INSERT INTO decisions (incident_id, facts, votes, rule_number, rule_text, action, engine, created_at) VALUES (1, ?, ?, 2, 'critical flow (a<b) failing during an exam', 'wake', 'claude', ?)").run(
    JSON.stringify({ critical: "code <submission>", exam_open: true, owner_away: false, hits_10m: 3, change: "new", learn_mode: false, backlog: false }),
    JSON.stringify({ severity: { value: "3", count: 4, of: 5 }, user_blocked: { value: "yes", count: 5, of: 5 } }),
    now,
  );
  return db;
}

describe("Telegram alert card", () => {
  it("renders balanced HTML and escapes text from the app", () => {
    const db = seed();
    const card = renderCard(db, 1)!;
    assert.ok(balanced(card.text), card.text);
    assert.ok(!card.text.includes("<submission>"));
    assert.match(card.text, /WAKE/);
    assert.match(card.text, /exam window open/);
    assert.ok(card.markup.inline_keyboard.flat().some((b) => b.text === "Acknowledge"));
  });

  it("stays balanced once a cause and a withheld fix are added", () => {
    const db = seed();
    const now = new Date().toISOString();
    db.prepare("INSERT INTO diagnoses (id, incident_id, model, result, created_at) VALUES (1, 1, 'm', ?, ?)").run(
      JSON.stringify({ cause_plain: "x < y & z", file: "a<b>.py", line: 3, confidence_words: "sure" }),
      now,
    );
    db.prepare("INSERT INTO fixes (diagnosis_id, diff, gate_result, status, created_at) VALUES (1, '', ?, 'rejected', ?)").run(
      JSON.stringify({ passed: false, reasons: ["touches a protected area: <payments>"], changed_lines: 2 }),
      now,
    );
    const card = renderCard(db, 1)!;
    assert.ok(balanced(card.text), card.text);
    assert.match(card.text, /withheld/);
    assert.ok(card.markup.inline_keyboard.flat().some((b) => b.text === "Diagnosis right"));
    assert.ok(balanced(renderWhy(db, 1)));
  });
});
