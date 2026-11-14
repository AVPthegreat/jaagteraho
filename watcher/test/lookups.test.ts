// Looking beyond the stack trace: the repository snapshot, the lookups the diagnosis may make,
// re-anchoring a traceback from another release, and the two-round diagnosis loop.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { SpendGuard, type AI } from "../src/ai/claude.js";
import { openDb } from "../src/db/db.js";
import { anchorLine, repoMap, runDiagnosis, runLookup, type SourceFile } from "../src/pipeline/diagnose.js";
import { indexFromFolder, indexFromTarball, RepoIndex, untar } from "../src/source/repo.js";
import { GitHubSource, safeRef } from "../src/source/source.js";

const APP = `class Helper:
    def url_for(self, endpoint, **values):
        return endpoint


class Flask:
    def url_for(self, endpoint, **values):
        raise TypeError("got multiple values for argument 'self'")


def url_for(endpoint, **values):
    return current_app.url_for(endpoint, **values)
`;

function repo(): RepoIndex {
  return new RepoIndex(
    new Map([
      ["src/flask/app.py", APP],
      ["src/flask/__init__.py", "from .app import Flask\n"],
      ["tests/test_app.py", "def url_for():\n    pass\n# got multiple values for argument\n"],
    ]),
  );
}

describe("repository index", () => {
  it("finds a method inside the named class before same-named functions elsewhere", () => {
    const ix = repo();
    assert.deepEqual(ix.definitions("Flask.url_for")[0], { path: "src/flask/app.py", line: 7 });
    // Without a class, app code ranks before tests.
    assert.ok(!ix.definitions("url_for").slice(0, 2).some((d) => d.path.startsWith("tests/")));
    assert.deepEqual(ix.definitions("nothing_here"), []);
  });

  it("searches literal text, app code first, and knows its packages and paths", async () => {
    const ix = repo();
    const hits = await ix.search("got multiple values for argument");
    assert.equal(hits[0].path, "src/flask/app.py");
    assert.equal(hits[hits.length - 1].path, "tests/test_app.py");
    assert.deepEqual(await ix.search("ab"), [], "too short to be useful");
    assert.deepEqual([...ix.packages()], ["flask"]);
    assert.equal(ix.resolve("flask/app.py"), "src/flask/app.py");
    assert.equal(ix.resolve("/site-packages/flask/app.py".split("/").slice(-2).join("/")), "src/flask/app.py");
  });

  it("indexes a GitHub-style tarball (one top folder) and keeps only code", async () => {
    const dir = mkdtempSync(join(tmpdir(), "jr-tar-"));
    mkdirSync(join(dir, "owner-repo-abc123/pkg"), { recursive: true });
    mkdirSync(join(dir, "owner-repo-abc123/node_modules/x"), { recursive: true });
    writeFileSync(join(dir, "owner-repo-abc123/pkg/mod.py"), "def f():\n    return 1\n");
    writeFileSync(join(dir, "owner-repo-abc123/node_modules/x/i.js"), "x");
    writeFileSync(join(dir, "owner-repo-abc123/logo.png"), "png");
    const long = `owner-repo-abc123/pkg/${"deep/".repeat(25)}m.py`;
    mkdirSync(join(dir, long.replace(/\/m\.py$/, "")), { recursive: true });
    writeFileSync(join(dir, long), "X = 1\n");
    const tar = spawnSync("tar", ["-czf", "-", "-C", dir, "owner-repo-abc123"]);
    assert.equal(tar.status, 0);
    const ix = await indexFromTarball(`data:application/gzip;base64,${tar.stdout.toString("base64")}`);
    assert.ok(ix);
    assert.deepEqual([...ix.files.keys()].sort(), [long.split("/").slice(1).join("/"), "pkg/mod.py"].sort());
    assert.equal(ix.files.get("pkg/mod.py"), "def f():\n    return 1\n");
  });

  it("indexes a local folder", async () => {
    const dir = mkdtempSync(join(tmpdir(), "jr-dir-"));
    mkdirSync(join(dir, "app"));
    writeFileSync(join(dir, "app/x.py"), "def g():\n    pass\n");
    writeFileSync(join(dir, "README.md"), "hi");
    const ix = await indexFromFolder(dir);
    assert.deepEqual([...ix.files.keys()], ["app/x.py"]);
  });
});

describe("lookups", () => {
  it("returns numbered definitions and records the files read", async () => {
    const read = new Map<string, SourceFile>();
    const out = await runLookup(repo(), "find_definition", { name: "Flask.url_for" }, read);
    assert.match(out, /<file path="src\/flask\/app.py">/);
    assert.match(out, /\s7\| {5}def url_for/);
    assert.match(out, /\s8\| {9}raise TypeError/);
    assert.ok(read.has("src/flask/app.py"));
    assert.match(await runLookup(repo(), "search_code", { text: "multiple values" }, read), /^src\/flask\/app.py:8:/);
    assert.match(await runLookup(repo(), "read_lines", { path: "flask/__init__.py", start: 1, end: 400 }, read), /1\| from .app import Flask/);
    assert.match(await runLookup(repo(), "read_lines", { path: "../../etc/passwd", start: 1, end: 2 }, read), /No such file/);
  });
});

describe("compact file view", () => {
  it("shows the whole reported function in a long file, not 80 lines either side", async () => {
    const { numbered } = await import("../src/pipeline/diagnose.js");
    const body = Array.from({ length: 60 }, (_, i) => `    x${i} = ${i}`).join("\n");
    const text = `${"# pad\n".repeat(300)}def f():\n${body}\n${"# tail\n".repeat(300)}`;
    const out = numbered(text, [340], undefined, undefined, undefined, true);
    assert.match(out, /301\| def f\(\):/);
    assert.match(out, /361\| {5}x59 = 59/);
    assert.doesNotMatch(out, /\b420\|/);
  });
});

describe("repository map", () => {
  it("points at called functions defined elsewhere and at the error's text, not at tests", async () => {
    const ix = new RepoIndex(
      new Map([
        ["pkg/a.py", "from .b import build\n\n\ndef run(x):\n    v = build(x)\n    return local(v)\n\n\ndef local(v):\n    return v\n"],
        ["pkg/b.py", "def build(x):\n    raise ValueError('Field may not be null.')\n"],
        ["tests/test_b.py", "def build():\n    pass\n# Field may not be null.\n"],
      ]),
    );
    const map = await repoMap(ix, [{ path: "pkg/a.py", text: ix.files.get("pkg/a.py")!, focus: [5] }], "{'x': ['Field may not be null.']}");
    assert.match(map, /build -> pkg\/b.py:1/);
    assert.doesNotMatch(map, /local ->/, "defined in the file already shown");
    assert.match(map, /"Field may not be null" -> pkg\/b.py:2/);
    assert.doesNotMatch(map, /tests\//);
  });
});

describe("anchoring a traceback from another release", () => {
  const text = "def a():\n    pass\n\n\ndef get_key(task_id):\n    x = 1\n    return key_t('').join([\n";
  it("keeps a line that still holds the reported code", () => {
    assert.deepEqual(anchorLine(text, 7, "return key_t('').join([", "get_key"), { line: 7, moved: false });
  });
  it("moves to the reported code inside the reported function", () => {
    assert.deepEqual(anchorLine(text, 2, "return key_t('').join([", "get_key"), { line: 7, moved: true });
  });
  it("falls back to the function's definition", () => {
    assert.deepEqual(anchorLine(text, 400, "something else", "Backend.get_key"), { line: 5, moved: true });
  });
});

describe("diagnosis with lookups", () => {
  const event = { exception_type: "TypeError", message: "Flask.url_for() got multiple values for argument 'self'", transaction: null, frames: [] };
  const shown: SourceFile[] = [{ path: "src/flask/helpers.py", text: "def url_for(endpoint, **values):\n    return current_app.url_for(endpoint, **values)\n", focus: [2] }];
  const answer = {
    cause_plain: "x",
    cause_technical: "y",
    file: "src/flask/app.py",
    line: 7,
    confidence_words: "likely",
    edits: [],
    test_hint: "",
    regression_test: { file: "t.py", code: "" },
  };

  function fake(script: Array<"tool" | "answer" | "fail">) {
    const reqs: Array<{ tools?: unknown[]; tool_choice?: { type: string }; messages: unknown[] }> = [];
    const usage = { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 5000, cache_creation_input_tokens: 0 };
    const client = {
      messages: {
        parse: async (req: (typeof reqs)[number]) => {
          reqs.push(JSON.parse(JSON.stringify(req)));
          const step = script[reqs.length - 1] ?? "answer";
          if (step === "fail") throw new Error("simulated outage");
          if (step === "tool" && req.tools && req.tool_choice?.type !== "none") {
            return { stop_reason: "tool_use", usage, parsed_output: null, content: [{ type: "tool_use", id: `t${reqs.length}`, name: "find_definition", input: { name: "Flask.url_for" } }] };
          }
          return { stop_reason: "end_turn", usage, parsed_output: answer, content: [{ type: "text", text: "{}", parsed_output: answer }] };
        },
      },
    };
    const db = openDb(":memory:");
    const ai = { client, guard: new SpendGuard(db, 40, 45), decisionModel: "claude-haiku-5-5", diagnosisModel: "claude-sonnet-5-5" } as unknown as AI;
    return { ai, reqs, db };
  }

  it("looks up what it asks for, returns the files it read, and counts one diagnosis", async () => {
    const { ai, reqs, db } = fake(["tool", "answer"]);
    const out = await runDiagnosis(ai, event, shown, false, null, repo());
    assert.ok(!("error" in out), JSON.stringify(out));
    assert.equal(reqs.length, 2);
    assert.deepEqual(out.files_read.map((f) => f.path), ["src/flask/app.py"]);
    assert.equal(out.lookups.length, 1);
    const toolResult = JSON.stringify(reqs[1].messages);
    assert.match(toolResult, /raise TypeError/);
    assert.doesNotMatch(toolResult, /parsed_output/, "SDK-only fields are not sent back");
    assert.equal(ai.guard.countToday("diagnosis"), 1);
    // Cached reads are charged at 0.1 x the input price: 2 x (1000 x $2 + 5000 x $0.20 + 100 x $10) per million.
    assert.ok(Math.abs(out.cost - 2 * 0.004) < 1e-9, String(out.cost));
    db.close();
  });

  it("stops after three rounds of lookups and asks for the answer", async () => {
    const { ai, reqs } = fake(["tool", "tool", "tool", "tool", "tool"]);
    const out = await runDiagnosis(ai, event, shown, false, null, repo());
    assert.ok(!("error" in out), JSON.stringify(out));
    assert.equal(reqs.length, 4);
    assert.equal(reqs[3].tool_choice?.type, "none");
    assert.match(JSON.stringify(reqs[3].messages.at(-1)), /No more lookups/);
    assert.doesNotMatch(JSON.stringify(reqs[2].messages.at(-1)), /No more lookups/);
  });

  it("offers no tools without a repository index", async () => {
    const { ai, reqs } = fake(["tool"]);
    const out = await runDiagnosis(ai, event, shown, false, null, null);
    assert.ok(!("error" in out), JSON.stringify(out));
    assert.equal(reqs.length, 1);
    assert.equal(reqs[0].tools, undefined);
  });
});

describe("diagnosis safety", () => {
  const event = { exception_type: "TypeError", message: "boom", transaction: null, frames: [] };
  const shown: SourceFile[] = [{ path: "src/flask/helpers.py", text: "def f():\n    return 1\n", focus: [2] }];
  const answer = { cause_plain: "x", cause_technical: "y", file: "src/flask/helpers.py", line: 2, confidence_words: "guess", edits: [], test_hint: "", regression_test: { file: "t.py", code: "" } };
  function fake(steps: Array<"tool" | "answer" | "fail">) {
    const reqs: Array<{ tools?: unknown[] }> = [];
    const usage = { input_tokens: 1000, output_tokens: 100 };
    const client = {
      messages: {
        parse: async (req: { tools?: unknown[] }) => {
          reqs.push({ tools: req.tools });
          const step = steps[reqs.length - 1] ?? "answer";
          if (step === "fail") throw new Error("simulated outage");
          if (step === "tool" && req.tools) return { stop_reason: "tool_use", usage, parsed_output: null, content: [{ type: "tool_use", id: "t", name: "search_code", input: { text: "return 1" } }] };
          return { stop_reason: "end_turn", usage, parsed_output: answer, content: [{ type: "text", text: "{}" }] };
        },
      },
    };
    const db = openDb(":memory:");
    return { ai: { client, guard: new SpendGuard(db, 40, 45), decisionModel: "claude-haiku-5-5", diagnosisModel: "claude-sonnet-5-5" } as unknown as AI, reqs };
  }

  it("falls back once to the single call when a lookup round fails, and charges both", async () => {
    const { ai, reqs } = fake(["tool", "fail", "answer"]);
    const out = await runDiagnosis(ai, event, shown, false, null, repo());
    assert.ok(!("error" in out), JSON.stringify(out));
    assert.equal(reqs.length, 3);
    assert.equal(reqs[2].tools, undefined, "the fallback has no tools");
    assert.ok(Math.abs(out.cost - 2 * 0.003) < 1e-9, String(out.cost));
  });

  it("gives up when the fallback fails too", async () => {
    const { ai, reqs } = fake(["fail", "fail"]);
    const out = await runDiagnosis(ai, event, shown, false, null, repo());
    assert.ok("error" in out);
    assert.equal(reqs.length, 2);
  });

  it("stops between rounds when the owner's credit runs out, without a fallback", async () => {
    const { ai, reqs } = fake(["tool", "answer"]);
    let calls = 0;
    const out = await runDiagnosis(ai, event, shown, false, null, repo(), { budgetOk: () => ++calls < 1 });
    assert.deepEqual(out, { error: "spending limit reached" });
    assert.equal(reqs.length, 1);
  });
});

describe("downloading a repository safely", () => {
  async function* chunks(buf: Buffer, size: number) {
    for (let i = 0; i < buf.length; i += size) yield buf.subarray(i, i + size);
  }
  function tarOf(build: (dir: string) => void): Buffer {
    const dir = mkdtempSync(join(tmpdir(), "jr-tar-"));
    mkdirSync(join(dir, "o-r-1/pkg"), { recursive: true });
    build(join(dir, "o-r-1"));
    const out = spawnSync("tar", ["-cf", "-", "-C", dir, "o-r-1"], { maxBuffer: 64 * 1024 * 1024 });
    assert.equal(out.status, 0);
    return out.stdout;
  }

  it("skips large unwanted entries and parses any chunking", async () => {
    const tar = tarOf((d) => {
      writeFileSync(join(d, "pkg/big.bin"), Buffer.alloc(3_000_000, 7));
      writeFileSync(join(d, "pkg/a.py"), "A = 1\n");
      writeFileSync(join(d, "pkg/huge.py"), "x" .repeat(400_000));
    });
    for (const size of [1, 511, 512, 4096, 1 << 20]) {
      const files = await untar(chunks(tar, size), () => true);
      assert.deepEqual([...files.keys()], ["pkg/a.py"], `chunk size ${size}: binaries and files over 300 KB are skipped`);
      assert.equal(files.get("pkg/a.py"), "A = 1\n");
    }
  });

  it("stops at the decompressed-size cap and at the deadline", async () => {
    const tar = tarOf((d) => writeFileSync(join(d, "pkg/big.bin"), Buffer.alloc(2_000_000, 1)));
    await assert.rejects(untar(chunks(tar, 65536), () => true, { maxUnpacked: 1_000_000 }), /too large/);
    await assert.rejects(untar(chunks(tar, 65536), () => true, { deadline: Date.now() - 1 }), /too long/);
    // A small gzip that expands past the cap (a decompression bomb) gives no index.
    const bomb = spawnSync("gzip", ["-c"], { input: tar }).stdout;
    assert.ok(bomb.length < 100_000);
    assert.equal(await indexFromTarball(`data:application/gzip;base64,${bomb.toString("base64")}`, {}, { maxUnpacked: 1_000_000 }), null);
    assert.equal(await indexFromTarball(`data:application/gzip;base64,${bomb.toString("base64")}`, {}, { maxDownload: 1000 }), null);
  });

  it("accepts only safe refs", () => {
    for (const ok of ["main", "v1.2.3", "release/2026-11", "a1b2c3d4"]) assert.ok(safeRef(ok), ok);
    for (const bad of ["../x", "a/../b", "a//b", "/main", "main/", "x.lock", "a b", "?x=1", ".hidden", ""]) assert.ok(!safeRef(bad), bad);
  });

  it("keeps cached copies apart by who could read them", async () => {
    const real = globalThis.fetch;
    const urls: string[] = [];
    globalThis.fetch = (async (u: string) => (urls.push(String(u)), new Response("no", { status: 404 }))) as typeof fetch;
    try {
      await new GitHubSource("o/scoped-test", "tok", "project:1").index("main");
      await new GitHubSource("o/scoped-test", "tok", "project:1").index("main");
      await new GitHubSource("o/scoped-test", "tok", "project:2").index("main");
      await new GitHubSource("o/scoped-test").index("main");
      await new GitHubSource("o/scoped-test").index("../../etc");
    } finally {
      globalThis.fetch = real;
    }
    const main = urls.filter((u) => u.endsWith("/tarball/main"));
    assert.equal(main.length, 3, "project 1 once, project 2, public");
    assert.ok(!urls.some((u) => u.includes("..")), "an unsafe ref is never put in a URL");
  });
});

describe("public paste page", () => {
  it("does not download a repository the traceback does not match, and counts the failed attempt", async () => {
    const { pasteRoutes } = await import("../src/web/paste.js");
    const db = openDb(":memory:");
    const app = pasteRoutes(db, { client: {}, guard: new SpendGuard(db, 40, 45) } as unknown as AI);
    const real = globalThis.fetch;
    const urls: string[] = [];
    globalThis.fetch = (async (u: string) => (urls.push(String(u)), new Response("no", { status: 404 }))) as typeof fetch;
    try {
      const res = await app.request("/public/paste", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session: "abcdefgh1234", repo: "https://github.com/o/r", traceback: 'Traceback (most recent call last):\n  File "/app/x.py", line 3, in f\n    g()\nValueError: bad' }),
      });
      assert.equal(res.status, 404);
    } finally {
      globalThis.fetch = real;
    }
    assert.ok(!urls.some((u) => u.includes("/tarball")), "no tarball download");
    const rows = db.prepare("SELECT id FROM pastes").all() as Array<{ id: string }>;
    assert.equal(rows.length, 1);
    assert.match(rows[0].id, /^failed-/);
    assert.equal((await app.request(`/public/paste/${rows[0].id}`)).status, 404, "a failed attempt is never shown");
    db.close();
  });
});
