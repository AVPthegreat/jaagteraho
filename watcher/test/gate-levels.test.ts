// The three-level fix gate: recommended, use with care (shown, never approvable), withheld.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SpendGuard, type AI } from "../src/ai/claude.js";
import { openDb } from "../src/db/db.js";
import type { DiagnosisResult } from "../src/pipeline/diagnose.js";
import { runGate } from "../src/pipeline/gate.js";
import { publicRoutes } from "../src/web/public.js";

const file = { path: "portal/submissions.py", text: 'def f(data):\n    language = data["language"]\n    return language\n' };
const diag: DiagnosisResult = {
  cause_plain: "x",
  cause_technical: "x",
  file: file.path,
  line: 2,
  confidence_words: "sure",
  edits: [{ file: file.path, find: '    language = data["language"]', replace: '    language = data.get("language", "python")' }],
  test_hint: "",
  regression_test: { file: "", code: "" },
};

function ai(review: { fix_quality: string; touches_sensitive: string; could_break: string }): AI {
  const db = openDb(":memory:");
  const client = { messages: { parse: async () => ({ stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 10 }, parsed_output: review }) } };
  return { client, guard: new SpendGuard(db, 40, 45), decisionModel: "claude-haiku-5-5", diagnosisModel: "claude-sonnet-5-5" } as unknown as AI;
}

describe("fix gate levels", () => {
  it("recommends a fix every check agrees with", async () => {
    const g = await runGate(ai({ fix_quality: "3", touches_sensitive: "no", could_break: "no" }), diag, [file]);
    assert.equal(g.level, "recommended");
    assert.equal(g.passed, true);
  });

  it("shows a fix with concerns as 'use with care', with the concerns spelled out", async () => {
    const g = await runGate(ai({ fix_quality: "2", touches_sensitive: "yes", could_break: "yes" }), diag, [file]);
    assert.equal(g.level, "caution");
    assert.equal(g.passed, true);
    assert.equal(g.reasons.length, 3);
  });

  it("withholds a fix the reviewer says does not remove the cause, and any fix that fails a code check", async () => {
    assert.equal((await runGate(ai({ fix_quality: "1", touches_sensitive: "no", could_break: "no" }), diag, [file])).level, "withheld");
    const protectedFile = { ...file, path: "portal/payments.py" };
    const g = await runGate(ai({ fix_quality: "3", touches_sensitive: "no", could_break: "no" }), { ...diag, file: protectedFile.path, edits: [{ ...diag.edits[0], file: protectedFile.path }] }, [protectedFile]);
    assert.equal(g.level, "withheld");
    assert.match(g.reasons.join(), /protected area/);
  });

  it("a 'use with care' fix cannot be approved from the website", async () => {
    const db = openDb(":memory:");
    const now = new Date().toISOString();
    db.prepare("INSERT INTO projects (id, name, public_key, kind, repo, repo_access, settings, created_at) VALUES (1, 'sandbox', 'k', 'sandbox', NULL, 'sandbox-write', '{}', ?)").run(now);
    db.prepare("INSERT INTO incidents (id, project_id, fingerprint, exception_type, transaction_name, first_seen, last_seen) VALUES (1, 1, 'f', 'KeyError', '/api/submit', ?, ?)").run(now, now);
    db.prepare("INSERT INTO diagnoses (id, incident_id, model, result, created_at) VALUES (1, 1, 'm', '{}', ?)").run(now);
    db.prepare("INSERT INTO fixes (id, diagnosis_id, diff, gate_result, status, created_at) VALUES (1, 1, 'd', ?, 'shown', ?), (2, 1, 'd', ?, 'shown', ?)").run(
      JSON.stringify({ level: "caution", reasons: ["x"] }), now, JSON.stringify({ level: "recommended", reasons: [] }), now,
    );
    const app = publicRoutes({ db, voice: null, twinBroken: "http://127.0.0.1:1", twinFixed: "http://127.0.0.1:1", allowedOrigins: [] } as never);
    const approve = (fix_id: number) => app.request("/public/approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session: "sess-12345678", flow: "submit", fix_id }) });
    assert.equal((await approve(1)).status, 409);
    assert.equal((await approve(2)).status, 200);
  });
});
