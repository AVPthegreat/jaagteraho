import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyRules, tally, type Answer, type Facts } from "../src/pipeline/decide.js";

const base: Facts = { critical: null, exam_open: false, owner_away: false, hits_10m: 1, users_1h: 0, change: "new", learn_mode: false, backlog: false };
const ans = (p: Partial<Answer>): Answer => ({
  is_noise: "no", severity: "2", category: "code_defect", user_blocked: "no", suggested_action: "notify", ...p,
});
const votes = (...a: Answer[]) => tally(a);

describe("rules", () => {
  it("rule 1: learn mode and backlog only log", () => {
    assert.equal(applyRules({ ...base, learn_mode: true, critical: "exam", exam_open: true }, {}, false).action, "log");
    assert.equal(applyRules({ ...base, backlog: true }, {}, false).action, "log");
  });
  it("rule 2: a critical flow during an exam always wakes, whatever the model says", () => {
    const noiseVotes = votes(...Array(5).fill(ans({ is_noise: "yes", severity: "0" })));
    assert.equal(applyRules({ ...base, critical: "code submission", exam_open: true }, noiseVotes, false).action, "wake");
    assert.equal(applyRules({ ...base, critical: "code submission", exam_open: true }, {}, true).action, "wake");
  });
  it("rule 3: repeated critical failures wake only when away", () => {
    assert.equal(applyRules({ ...base, critical: "pay", hits_10m: 3 }, {}, false).action, "notify");
    assert.equal(applyRules({ ...base, critical: "pay", hits_10m: 3, owner_away: true }, {}, false).action, "wake");
  });
  it("rule 4: any critical failure at least notifies", () => {
    const quiet = votes(...Array(5).fill(ans({ is_noise: "yes", severity: "0" })));
    assert.equal(applyRules({ ...base, critical: "pay" }, quiet, false).action, "notify");
  });
  it("a failed model call means notify, never ignore", () => {
    const r = applyRules(base, {}, true);
    assert.equal(r.action, "notify");
    assert.equal(r.rule, 0);
  });
  it("rule 5: noise needs 4 of 5 votes and low severity", () => {
    assert.equal(applyRules(base, votes(...Array(5).fill(ans({ is_noise: "yes", severity: "1" }))), false).action, "ignore");
    const split = votes(ans({ is_noise: "yes", severity: "1" }), ans({ is_noise: "yes", severity: "1" }), ans({ is_noise: "yes", severity: "1" }), ans({ is_noise: "no", severity: "1" }), ans({ is_noise: "no", severity: "1" }));
    assert.notEqual(applyRules(base, split, false).action, "ignore");
  });
  it("rules 6 to 9 follow severity", () => {
    assert.equal(applyRules(base, votes(ans({ severity: "4" })), false).action, "wake");
    assert.equal(applyRules(base, votes(ans({ severity: "3" })), false).action, "notify");
    assert.equal(applyRules(base, votes(ans({ severity: "1", user_blocked: "yes" })), false).action, "notify");
    assert.equal(applyRules(base, votes(ans({ severity: "2" })), false).action, "notify");
    assert.equal(applyRules({ ...base, owner_away: true }, votes(ans({ severity: "2" })), false).action, "log");
    assert.equal(applyRules(base, votes(ans({ severity: "1" })), false).action, "log");
  });

  it("rule 10: an error that reached many people is never quiet, except in learn mode", () => {
    const noise = votes(...Array.from({ length: 5 }, () => ans({ is_noise: "yes", severity: "0" })));
    assert.equal(applyRules({ ...base, users_1h: 4 }, noise, false).action, "ignore");
    const r = applyRules({ ...base, users_1h: 6 }, noise, false);
    assert.equal(r.action, "notify");
    assert.equal(r.rule, 10);
    assert.equal(applyRules({ ...base, users_1h: 6, owner_away: true }, votes(ans({ severity: "2" })), false).rule, 10);
    assert.equal(applyRules({ ...base, users_1h: 50, learn_mode: true }, noise, false).action, "log");
    assert.equal(applyRules({ ...base, users_1h: 50, severity: undefined } as Facts, votes(ans({ severity: "4" })), false).action, "wake");
  });
});
