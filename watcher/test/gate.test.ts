import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DiagnosisResult } from "../src/pipeline/diagnose.js";
import { codeChecks } from "../src/pipeline/gate.js";

const file = { path: "portal/submissions.py", text: 'def f(data):\n    language = data["language"]\n    return language\n' };
const diag = (edits: DiagnosisResult["edits"]): DiagnosisResult => ({
  cause_plain: "x", cause_technical: "x", file: file.path, line: 2, confidence_words: "sure", edits, test_hint: "", regression_test: { file: "", code: "" },
});

describe("fix gate, code checks", () => {
  it("passes a small exact edit", () => {
    const g = codeChecks(diag([{ file: file.path, find: 'language = data["language"]', replace: 'language = data.get("language")' }]), [file]);
    assert.equal(g.passed, true, g.reasons.join(", "));
    assert.match(g.diff, /^\+    language = data\.get/m);
  });
  it("rejects text that is not in the file", () => {
    assert.equal(codeChecks(diag([{ file: file.path, find: "nope", replace: "x" }]), [file]).passed, false);
  });
  it("rejects files it was not shown", () => {
    const g = codeChecks(diag([{ file: "other.py", find: "a", replace: "b" }]), [file]);
    assert.ok(g.reasons.some((r) => r.includes("not shown")));
  });
  it("rejects protected areas such as payments", () => {
    const pay = { path: "portal/payments.py", text: "x = a / b\n" };
    const g = codeChecks(diag([{ file: pay.path, find: "x = a / b", replace: "x = a / b if b else 0" }]), [pay]);
    assert.ok(g.reasons.some((r) => r.includes("protected")));
  });
  it("rejects new imports and URLs", () => {
    const g = codeChecks(diag([{ file: file.path, find: "def f(data):", replace: "import requests\ndef f(data):\n    requests.get('https://evil.example')" }]), [file]);
    assert.ok(g.reasons.includes("adds a new import"));
    assert.ok(g.reasons.includes("adds a URL"));
  });
  it("rejects edits that break Python syntax", () => {
    const g = codeChecks(diag([{ file: file.path, find: "    return language", replace: "    return (language" }]), [file]);
    assert.ok(g.reasons.some((r) => r.includes("valid Python")));
  });
  it("rejects non-unique text", () => {
    const dup = { path: "a.py", text: "x = 1\nx = 1\n" };
    assert.equal(codeChecks(diag([{ file: "a.py", find: "x = 1", replace: "x = 2" }]), [dup]).passed, false);
  });
});

describe("fix gate, imports", () => {
  it("allows a new import from the Python standard library", () => {
    const f = { path: "portal/exams.py", text: "from datetime import datetime\nx = datetime.now()\n" };
    const g = codeChecks(diag([{ file: f.path, find: "from datetime import datetime\n", replace: "from datetime import datetime\nfrom zoneinfo import ZoneInfo\n" }]), [f]);
    assert.ok(!g.reasons.includes("adds a new import"), g.reasons.join(", "));
  });
  it("still refuses a third-party package", () => {
    const f = { path: "portal/exams.py", text: "x = 1\n" };
    const g = codeChecks(diag([{ file: f.path, find: "x = 1", replace: "import pytz\nx = 1" }]), [f]);
    assert.ok(g.reasons.includes("adds a new import"));
  });
});
