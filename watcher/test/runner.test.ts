// The isolated runner: the only way app code and AI-written code is executed. Its verdicts cannot be faked
// by the code under test, it refuses folders outside the bench apps and the exam portal source, and without
// it nothing runs. Also: the playground's fenced spend lane and the per-network live-view caps.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { dailyCaps, spendContext, SpendGuard } from "../src/ai/claude.js";
import { openDb } from "../src/db/db.js";
import { proveFix, riskyFixLines } from "../src/pipeline/verify.js";
import { runJob, runnerMode } from "../src/runner/client.js";
import { execJob, judge } from "../src/runner/exec.js";
import { runnerServer } from "../src/runner/server.js";
import { NetSlots, netKey } from "../src/web/limits.js";

const MESS = { kind: "bench" as const, app: "messmenu" };

describe("runner verdicts", () => {
  it("counts a pass only with this run's token and exit code 0", () => {
    assert.equal(judge({ status: 0, signal: null, stdout: "\nabc:pass\n" }, "abc"), "passed");
    assert.equal(judge({ status: 1, signal: null, stdout: "abc:fail" }, "abc"), "failed");
    assert.equal(judge({ status: 0, signal: null, stdout: "Ran 1 test in 0.001s\n\nOK\n" }, "abc"), "error", "unittest text is not enough");
    assert.equal(judge({ status: 0, signal: null, stdout: "xyz:pass" }, "abc"), "error", "another token");
    assert.equal(judge({ status: 1, signal: null, stdout: "abc:pass" }, "abc"), "error", "exit code must agree");
    assert.equal(judge({ status: null, signal: "SIGKILL", stdout: "abc:pass" }, "abc"), "error");
  });

  it("code that exits early or prints a fake verdict cannot pass a test", async () => {
    const quit = await execJob({ kind: "hidden", base: MESS, patched: {}, test: "import os\nos._exit(0)\n" }, { allowLocal: false });
    assert.deepEqual(quit, { kind: "hidden", outcome: "error" });
    const fake = "import sys\nprint('Ran 1 test in 0.001s')\nprint('OK')\nsys.stdout.write('0000:pass\\n')\nimport unittest\nclass T(unittest.TestCase):\n    def test_x(self):\n        self.fail('no')\n";
    assert.deepEqual(await execJob({ kind: "hidden", base: MESS, patched: {}, test: fake }, { allowLocal: false }), { kind: "hidden", outcome: "failed" });
    const ok = "import unittest\nclass T(unittest.TestCase):\n    def test_x(self):\n        self.assertTrue(True)\n";
    assert.deepEqual(await execJob({ kind: "hidden", base: MESS, patched: {}, test: ok }, { allowLocal: false }), { kind: "hidden", outcome: "passed" });
  });

  it("Node.js tests are judged the same way", async () => {
    const tb = { kind: "bench" as const, app: "tiffinbox" };
    const pass = "const test = require('node:test'); const assert = require('node:assert'); test('a', () => assert.equal(1, 1));\n";
    const fail = "const test = require('node:test'); const assert = require('node:assert'); console.log('# pass 5'); test('a', () => assert.equal(1, 2));\n";
    const quit = "process.exit(0);\n";
    assert.equal(((await execJob({ kind: "hidden", base: tb, patched: {}, test: pass }, { allowLocal: false })) as { outcome: string }).outcome, "passed");
    assert.equal(((await execJob({ kind: "hidden", base: tb, patched: {}, test: fail }, { allowLocal: false })) as { outcome: string }).outcome, "failed");
    assert.equal(((await execJob({ kind: "hidden", base: tb, patched: {}, test: quit }, { allowLocal: false })) as { outcome: string }).outcome, "error");
  });

  it("refuses folders outside the bench apps and the exam portal source unless in-process", async () => {
    await assert.rejects(execJob({ kind: "trigger", base: { kind: "local", path: "/etc" }, code: "1" }, { allowLocal: false }));
    await assert.rejects(execJob({ kind: "trigger", base: { kind: "bench", app: "../../etc" }, code: "1" }, { allowLocal: false }));
    await assert.rejects(execJob({ kind: "hidden", base: MESS, patched: { "../escape.py": "x" }, test: "" }, { allowLocal: false }));
  });

  it("the fix filter flags file-descriptor tricks", () => {
    assert.ok(riskyFixLines("", "    fd = os.open('proc/self/environ', os.O_RDONLY, dir_fd=root)").length > 0);
    assert.ok(riskyFixLines("", "    x = openat(3, 'environ')").length > 0);
    assert.ok(riskyFixLines("", "    import gc").length > 0);
  });
});

describe("runner service over a unix socket", () => {
  const dir = mkdtempSync(join(tmpdir(), "jrsock-"));
  const socket = join(dir, "runner.sock");
  const server = runnerServer();
  const saved = { socket: process.env.JR_RUNNER_SOCKET, mode: process.env.JR_RUNNER };
  after(() => {
    server.close();
    rmSync(dir, { recursive: true, force: true });
    process.env.JR_RUNNER = saved.mode;
    if (saved.socket === undefined) delete process.env.JR_RUNNER_SOCKET;
    else process.env.JR_RUNNER_SOCKET = saved.socket;
  });

  it("runs a planted bug's trigger and returns the real crash", async () => {
    await new Promise<void>((r) => server.listen(socket, r));
    process.env.JR_RUNNER_SOCKET = socket;
    assert.equal(runnerMode(), "socket");
    const r = await runJob({
      kind: "trigger",
      base: { kind: "bench", app: "messmenu", edits: [{ file: "messmenu/booking/routes.py", find: 'require_fields(body, "student", "meal_id", "plates", "booked_on")', replace: 'require_fields(body, "student", "meal_id", "booked_on")' }] },
      code: "from messmenu.app import handle\nhandle('POST', '/api/meals', {'title': 'R', 'price': '60', 'served_on': '2026-11-13', 'plates': 2})\nhandle('POST', '/api/bookings', {'student': 'A', 'meal_id': 1, 'booked_on': '2026-11-13'})",
    });
    assert.equal(r.kind, "trigger");
    assert.match((r as { stderr: string }).stderr, /KeyError: 'plates'/);
  });

  it("the service refuses local folders and bad jobs", async () => {
    await assert.rejects(runJob({ kind: "trigger", base: { kind: "local", path: "/etc" }, code: "1" }), /400/);
    await assert.rejects(runJob({ kind: "trigger", base: { kind: "bench", app: "../x" }, code: "1" }), /400/);
  });

  it("without a runner nothing is executed: proofs are skipped", async () => {
    delete process.env.JR_RUNNER_SOCKET;
    process.env.JR_RUNNER = "";
    assert.equal(runnerMode(), null);
    const r = await proveFix("/nonexistent", { "a/b.py": "x = 1\n" }, { file: "t.py", code: "import unittest\nclass T(unittest.TestCase):\n    def test_x(self):\n        self.assertTrue(True)\n" });
    assert.equal(r.verdict, "skipped");
    assert.match(r.note, /isolated test runner/);
    await assert.rejects(runJob({ kind: "trigger", base: MESS, code: "1" }), /no isolated runner/);
  });
});

describe("the playground's spend lane is fenced off", () => {
  it("its own cap stops it, and its spend never stops the other lanes", () => {
    const db = openDb(":memory:");
    const guard = new SpendGuard(db, 40, 45, { ...dailyCaps({}), total: 10, playground: 3 });
    const inLane = <T>(lane: "playground" | "demo" | "faurus", f: () => T) => spendContext.run({ projectId: 0, lane }, f);
    const pick = (lane: "playground" | "demo" | "faurus") => inLane(lane, () => guard.pick("claude-sonnet-5-5", "claude-haiku-5-5"));
    inLane("playground", () => guard.record("claude-sonnet-5-5", "diagnosis", { input_tokens: 1_600_000, output_tokens: 0 })); // $3.2
    assert.equal(pick("playground"), null, "its own cap");
    assert.equal(pick("demo"), "claude-sonnet-5-5");
    assert.equal(pick("faurus"), "claude-sonnet-5-5");
    // Even far beyond the all-lane daily cap and the all-time stop, the other lanes are not held by it.
    inLane("playground", () => guard.record("claude-sonnet-5-5", "diagnosis", { input_tokens: 25_000_000, output_tokens: 0 })); // +$50
    assert.equal(pick("faurus"), "claude-sonnet-5-5");
    assert.equal(pick("demo"), "claude-sonnet-5-5");
    // But what the other lanes spend does hold the playground (the all-lane caps still apply to it).
    const db2 = openDb(":memory:");
    const g2 = new SpendGuard(db2, 40, 45, { ...dailyCaps({}), total: 10, playground: 3 });
    spendContext.run({ projectId: 0, lane: "faurus" }, () => g2.record("claude-sonnet-5-5", "diagnosis", { input_tokens: 5_000_000, output_tokens: 0 })); // $10
    assert.equal(spendContext.run({ projectId: 0, lane: "playground" }, () => g2.pick("claude-sonnet-5-5", "claude-haiku-5-5")), null);
  });
});

describe("live views are capped per network", () => {
  it("buckets IPv4 by /24 and IPv6 by /64", () => {
    assert.equal(netKey("203.0.113.7"), netKey("203.0.113.200"));
    assert.notEqual(netKey("203.0.113.7"), netKey("203.0.114.7"));
    assert.equal(netKey("::ffff:203.0.113.7"), netKey("203.0.113.9"));
    assert.equal(netKey("2001:db8:1:2::1"), netKey("2001:db8:1:2:ffff:0:0:9"));
    assert.equal(netKey("2001:0db8:0001:0002::1"), netKey("2001:db8:1:2::abcd"));
    assert.notEqual(netKey("2001:db8:1:2::1"), netKey("2001:db8:1:3::1"));
  });

  it("one network cannot take more than its share, even from many addresses", () => {
    const s = new NetSlots(20, 30, 300);
    let got = 0;
    for (let i = 0; i < 100; i++) if (s.take(`2001:db8:1:2::${i.toString(16)}`)) got++;
    assert.equal(got, 30);
    assert.ok(s.take("2001:db8:9:9::1"), "another network still gets in");
    for (let i = 0; i < 30; i++) s.release(`2001:db8:1:2::${i.toString(16)}`);
    assert.ok(s.take("2001:db8:1:2::ff"));
  });
});
