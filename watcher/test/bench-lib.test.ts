// The bench runner's options and its "would this fix have applied itself" verdict.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { autoHealVerdict, parseBenchArgs } from "../scripts/bench-lib.js";

describe("parseBenchArgs", () => {
  it("keeps the old defaults", () => {
    const a = parseBenchArgs([]);
    assert.equal(a.stopAt, 1.5);
    assert.equal(a.casesFile, null);
    assert.equal(a.appsDir, null);
    assert.equal(a.out, null);
    assert.equal(a.validateOnly, false);
  });
  it("reads the cases file, apps folder, budget and output prefix, resolved from the working folder", () => {
    const a = parseBenchArgs(["--cases", "c.json", "--apps", "apps", "--stop-at", "2.5", "--out", "r/x", "--validate", "--only", "faurus"], "/w");
    assert.deepEqual(a, { only: "faurus", validateOnly: true, casesFile: "/w/c.json", appsDir: "/w/apps", stopAt: 2.5, out: "/w/r/x" });
  });
  it("refuses a budget that is not a positive number", () => {
    assert.throws(() => parseBenchArgs(["--stop-at", "lots"]), /positive dollar amount/);
    assert.throws(() => parseBenchArgs(["--stop-at", "0"]), /positive dollar amount/);
  });
});

describe("autoHealVerdict", () => {
  const good = { passed: true, level: "recommended", review: { unanimous: true }, risky: [] };
  const edit = [{ file: "shop/cart.py", find: "    x = d['k']", replace: "    x = d.get('k')" }];
  it("a small recommended fix to a NOTIFY or a WAKE heals on its own", () => {
    assert.equal(autoHealVerdict("notify", good, edit, "/api/x", "proved").heal, true);
    assert.equal(autoHealVerdict("wake", good, edit, "/api/exam", "skipped").heal, true);
  });
  it("logged or ignored errors never heal", () => {
    assert.deepEqual(autoHealVerdict("log", good, edit, null, null), { heal: false, blocker: "decision was log" });
  });
  it("a cautioned, withheld or split-vote fix does not heal", () => {
    assert.equal(autoHealVerdict("wake", { ...good, level: "caution" }, edit, null, null).heal, false);
    assert.equal(autoHealVerdict("wake", { passed: false, level: "withheld" }, edit, null, null).heal, false);
    assert.equal(autoHealVerdict("wake", { ...good, review: { unanimous: false } }, edit, null, null).heal, false);
  });
  it("a small bug whose own test did not prove the fix does not heal", () => {
    assert.match(autoHealVerdict("notify", good, edit, null, "not_proved").blocker ?? "", /regression test/);
  });
  it("a fix that removes a check never heals unattended", () => {
    const removes = [{ file: "a.py", find: "    if not ok:\n        return None\n    go()", replace: "    go()" }];
    assert.match(autoHealVerdict("wake", good, removes, null, null).blocker ?? "", /removes a check/);
  });
});

describe("autoHealVerdict, protected areas", () => {
  it("a fix in a protected area (exams) never heals unattended", () => {
    const good = { passed: true, level: "recommended", review: { unanimous: true }, risky: [] };
    const edit = [{ file: "exam/scoring.py", find: "    x = d['k']", replace: "    x = d.get('k')" }];
    assert.match(autoHealVerdict("wake", good, edit, "/api/exam", null).blocker ?? "", /protected area/);
  });
});
