import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { applyRules, startupFailure, tally, type Answer, type Facts } from "../src/pipeline/decide.js";
import { parseTraceback } from "../src/web/paste.js";

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

describe("rule 11: the app fails to start", () => {
  const tb = (text: string) => parseTraceback(text)!;
  const django = tb(`Traceback (most recent call last):
  File "/app/manage.py", line 22, in <module>
    main()
  File "/app/manage.py", line 18, in main
    execute_from_command_line(sys.argv)
  File "/usr/lib/python3/dist-packages/django/core/management/__init__.py", line 416, in execute
    settings.INSTALLED_APPS
  File "/app/oj/settings.py", line 40, in <module>
    SECRET_KEY = os.environ["SECRET_KEY"]
django.core.exceptions.ImproperlyConfigured: The SECRET_KEY setting must not be empty.`);
  const redis = tb(`Traceback (most recent call last):
  File "/app/wsgi.py", line 9, in <module>
    application = create_app()
  File "/app/web/__init__.py", line 31, in create_app
    cache.ping()
  File "/usr/lib/python3/dist-packages/redis/client.py", line 1269, in ping
    return self.execute_command("PING")
redis.exceptions.ConnectionError: Error 111 connecting to redis:6379. Connection refused.`);
  const ev = (p: ReturnType<typeof tb>, transaction: string | null = null) => ({ transaction, exception_type: p.exception_type, message: p.message, frames: p.frames });

  it("recognises boot-time failures with no request route", () => {
    assert.match(startupFailure(ev(django)) ?? "", /cannot load its code or settings/);
    assert.match(startupFailure(ev(redis)) ?? "", /cannot reach a service/);
    assert.equal(startupFailure(ev(redis, "/api/submit")), null, "with a route, the request rules judge it");
  });

  it("leaves the bench's noise alone (client disconnects, scanners, favicon, shutdown)", () => {
    const bench = JSON.parse(readFileSync(new URL("../../bench/cases.json", import.meta.url), "utf8")) as { cases: Array<{ id: string; kind: string; route: string | null; traceback?: string }> };
    const noise = bench.cases.filter((c) => c.kind === "noise");
    assert.equal(noise.length, 4);
    for (const c of noise) {
      const facts: Facts = { ...base, hits_10m: 5, startup: startupFailure(ev(tb(c.traceback!), c.route)) };
      assert.equal(facts.startup, null, c.id);
      assert.notEqual(applyRules(facts, votes(ans({ is_noise: "yes", severity: "0" }), ans({ is_noise: "yes", severity: "0" }), ans({ is_noise: "yes", severity: "0" }), ans({ is_noise: "yes", severity: "0" }), ans({ is_noise: "yes", severity: "0" })), false).action, "wake", c.id);
    }
  });

  it("wakes when it repeats or arrives with a new release, whatever the model says; a one-off does not", () => {
    const quiet = votes(ans({ is_noise: "yes", severity: "0" }), ans({ is_noise: "yes", severity: "0" }), ans({ is_noise: "yes", severity: "0" }), ans({ is_noise: "yes", severity: "0" }), ans({ is_noise: "yes", severity: "0" }));
    const startup = "it cannot load its code or settings";
    const r = applyRules({ ...base, startup, hits_10m: 2 }, quiet, false);
    assert.equal(r.action, "wake");
    assert.equal(r.rule, 11);
    assert.match(r.rule_text, /fails to start.*every request is affected/);
    assert.equal(applyRules({ ...base, startup, hits_10m: 1, new_release: true }, quiet, false).action, "wake");
    assert.notEqual(applyRules({ ...base, startup, hits_10m: 1 }, quiet, false).rule, 11, "a single boot error with no new release is judged as before");
    assert.equal(applyRules({ ...base, startup, hits_10m: 5, learn_mode: true }, quiet, false).action, "log", "learn mode still comes first");
  });
});
