// Fix proof on the demo portal, the safety check on model-written tests, and the "last change" clue.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import type { CleanFrame } from "../src/intake/allowlist.js";
import { proveFix, readOutcome, riskyFixLines, testProblems } from "../src/pipeline/verify.js";
import { describeChange, lastChange, suspects } from "../src/source/changes.js";

const SANDBOX = fileURLToPath(new URL("../../sandbox", import.meta.url)).replace(/\/$/, "");
const original = readFileSync(`${SANDBOX}/portal/submissions.py`, "utf8");
const fixed = original.replace('    language = data["language"]', '    language = data.get("language", "python")');
const TEST = `import unittest
from portal.submissions import prepare_submission


class MissingLanguage(unittest.TestCase):
    def test_no_language_does_not_crash(self):
        out = prepare_submission({"code": "print(1)"})
        self.assertTrue(out["ok"])
`;

describe("fix proof", () => {
  it("proves a real fix: the test fails before and passes after", () => {
    const r = proveFix(SANDBOX, { "portal/submissions.py": fixed }, { file: "tests/test_submissions.py", code: TEST });
    assert.equal(r.verdict, "proved", r.note);
    assert.equal(r.before, "failed");
    assert.equal(r.after, "passed");
  });

  it("does not prove a fix that changes nothing", () => {
    const r = proveFix(SANDBOX, { "portal/submissions.py": original }, { file: "t.py", code: TEST });
    assert.equal(r.verdict, "not_proved");
  });

  it("never runs a test that reaches files, processes or the environment", () => {
    for (const bad of [
      "import os\nos.system('id')",
      "import subprocess",
      "open('/etc/passwd').read()",
      "from portal.submissions import os",
      "x = __import__('os')",
      "import unittest\nunittest.mock.patch('x')",
      "from unittest.mock import patch\npatch('a')",
      "import requests",
      "from . import x",
      "().__class__.__bases__",
      // Found by the security review: all three passed the first version of the check.
      'import unittest\nclass T(unittest.TestCase):\n    def test_x(self):\n        __builtins__["__import__"]("subprocess").check_output(["id"])',
      'from django.utils.module_loading import import_string\nimport_string("subprocess.check_output")(["id"])',
      'from unittest.mock import pkgutil\npkgutil.resolve_name("subprocess:check_output")(["id"])',
      // More of the same family.
      "from django.test import utils\nutils.os.system('id')",
      "import unittest.mock",
      "from collections import abc\nabc.__dict__",
      "from portal.submissions import pkgutil",
      "import json\njson.decoder.re.sys.modules",
      "x = type('X', (), {})",
    ]) {
      assert.ok(testProblems(bad, ["portal"]).length > 0, `should refuse: ${bad}`);
    }
    assert.deepEqual(testProblems(TEST, ["portal"]), []);
    assert.deepEqual(testProblems(`${TEST}\n\nif __name__ == "__main__":\n    unittest.main()\n`, ["portal"]), []);
    assert.deepEqual(testProblems("from django.utils import timezone\nimport unittest\nx = timezone.now()", ["portal", "django"]), []);
    const r = proveFix(SANDBOX, { "portal/submissions.py": fixed }, { file: "t.py", code: "import os\nos.system('touch /tmp/jr-pwned')" });
    assert.equal(r.verdict, "skipped");
  });

  it("does not count a test that cannot even run on the current code as proof", () => {
    // Imports a name that exists only after the fix: it "fails" before, but not because of the bug.
    const helper = `${fixed}\n\ndef jr_helper():\n    return 1\n`;
    const test = "import unittest\nfrom portal.submissions import jr_helper\n\n\nclass T(unittest.TestCase):\n    def test_x(self):\n        self.assertEqual(jr_helper(), 1)\n";
    const r = proveFix(SANDBOX, { "portal/submissions.py": helper }, { file: "t.py", code: test });
    assert.equal(r.verdict, "not_proved");
    assert.equal(r.before, "error");
    assert.match(r.note, /could not run on the current code/);
  });

  it("reads unittest output: only a run with a failure counts as failed", () => {
    assert.equal(readOutcome(1, null, "F\n----\nRan 1 test in 0.001s\n\nFAILED (failures=1)"), "failed");
    assert.equal(readOutcome(1, null, "E\n----\nRan 1 test in 0.001s\n\nFAILED (errors=1)"), "failed");
    assert.equal(readOutcome(0, null, "Ran 2 tests in 0.002s\n\nOK"), "passed");
    assert.equal(readOutcome(1, null, "ImportError: cannot import name 'x'"), "error");
    assert.equal(readOutcome(null, "SIGKILL", ""), "error");
    assert.equal(readOutcome(0, null, "Ran 0 tests in 0.000s\n\nOK"), "error");
  });

  it("does not run a fix that adds code reaching outside the program", () => {
    for (const line of ['    import os; os.system("x")', '    __import__("socket")', "    open('/etc/passwd').read()"]) {
      const bad = original.replace('    language = data["language"]', `    language = data.get("language", "python")\n${line}`);
      const r = proveFix(SANDBOX, { "portal/submissions.py": bad }, { file: "t.py", code: TEST });
      assert.equal(r.verdict, "skipped", line);
      assert.match(r.note, /reaches outside the program/);
    }
    assert.deepEqual(riskyFixLines("a = 1\n", "a = 1\nb = data.get('x')\n"), []);
  });

  it("skips when there is no test", () => {
    assert.equal(proveFix(SANDBOX, { "portal/submissions.py": fixed }, { file: "", code: "" }).verdict, "skipped");
  });
});

describe("last change", () => {
  const frames = [{ abs_path: "/srv/app/quiz/views.py", filename: "quiz/views.py", in_app: true } as CleanFrame];

  it("flags changed files that appear in the stack", () => {
    assert.deepEqual(suspects(["quiz/views.py", "README.md"], frames), ["quiz/views.py"]);
    assert.deepEqual(suspects(["views.py.bak"], frames), []);
  });

  it("finds the commit before the error began and describes it", async () => {
    const real = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      if (String(url).includes("/commits?until=")) return new Response(JSON.stringify([{ sha: "abc1234def" }]));
      return new Response(
        JSON.stringify({ sha: "abc1234def5678", commit: { message: "Speed up quiz submit\n\nlong body", author: { name: "Riya", date: "2026-11-13T10:00:00Z" }, committer: { date: "2026-11-13T10:00:00Z" } }, files: [{ filename: "quiz/views.py" }, { filename: "docs/x.md" }] }),
      );
    }) as typeof fetch;
    try {
      const c = await lastChange("riya/quizkart", undefined, "2026-11-13T10:20:00Z", null, frames);
      assert.ok(c);
      assert.equal(c.minutes_before, 20);
      assert.deepEqual(c.suspect, ["quiz/views.py"]);
      assert.equal(describeChange(c), 'Began 20 min after commit abc1234 "Speed up quiz submit" by Riya, which changed quiz/views.py (in the stack trace).');
      assert.match(calls[0], /until=2026-11-13T10%3A20%3A00Z/);

      // A release that is a commit hash is used directly.
      const r = await lastChange("riya/quizkart", undefined, "2026-11-13T10:20:00Z", "quizkart@abc1234", frames);
      assert.equal(r?.via, "release");

      // A commit from weeks ago says nothing about tonight.
      assert.equal(await lastChange("riya/quizkart", undefined, "2026-12-13T10:20:00Z", null, frames), null);
    } finally {
      globalThis.fetch = real;
    }
  });
});
