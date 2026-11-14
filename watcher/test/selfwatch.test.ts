import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DiagnosisResult } from "../src/pipeline/diagnose.js";
import { codeChecks } from "../src/pipeline/gate.js";
import { parseV8Stack } from "../src/selfwatch.js";

describe("self-watch: V8 stacks", () => {
  it("reads frames oldest first and marks library frames", () => {
    const stack = `TypeError: Cannot read properties of undefined (reading 'n')
    at tally (/app/src/pipeline/decide.ts:120:33)
    at Worker.process (file:///app/src/pipeline/worker.ts:98:5)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async /app/node_modules/hono/dist/hono.js:10:3`;
    const f = parseV8Stack(stack);
    assert.equal(f.length, 4);
    assert.equal(f.at(-1)!.function, "tally");
    assert.equal(f.at(-1)!.abs_path, "/app/src/pipeline/decide.ts");
    assert.equal(f.at(-1)!.lineno, 120);
    assert.equal(f.at(-2)!.abs_path, "/app/src/pipeline/worker.ts");
    assert.equal(f[0].in_app, false);
    assert.equal(f[1].in_app, false);
  });
});

describe("fix gate: TypeScript syntax", () => {
  const file = { path: "src/x.ts", text: "export const f = (a: number) => a + 1;\n" };
  const diag = (replace: string): DiagnosisResult => ({
    cause_plain: "", cause_technical: "", file: file.path, line: 1, confidence_words: "sure",
    edits: [{ file: file.path, find: "a + 1", replace }], test_hint: "", regression_test: { file: "", code: "" },
  });
  it("passes valid TypeScript", () => assert.equal(codeChecks(diag("(a ?? 0) + 1"), [file]).passed, true));
  it("rejects broken TypeScript", () => assert.ok(codeChecks(diag("(a + 1"), [file]).reasons.some((r) => r.includes("valid TypeScript"))));
});
