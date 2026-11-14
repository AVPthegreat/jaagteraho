// Proves a fix: the model's regression test must FAIL on the current code and PASS on the fixed code.
// Only for Python code we own (the exam portal demo and the playground's live apps), only for tests that
// pass a strict check: no file, network, process or environment access, imports limited to the code under
// test and a few standard modules.
//
// The watcher only CHECKS here (the test's syntax tree, the fix's added lines). Running the test, which
// executes AI-written code, happens in the isolated runner service (runner/server.ts: no network, no
// secrets, read-only root, its own temp space and limits), reached through runner/client.ts. Without a
// runner the proof is skipped; the in-process path is a test/development flag only (JR_RUNNER=inprocess).

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { runJob, runnerMode } from "../runner/client.js";
import type { Base } from "../runner/exec.js";

export type TestRun = {
  verdict: "proved" | "not_proved" | "skipped";
  before?: "failed" | "passed" | "error";
  after?: "failed" | "passed" | "error";
  note: string;
};

// Layer 1 of 2: a strict check of the test's syntax tree. Imports are an allowlist; no name or
// attribute may start with "_" (closes __builtins__, __class__ and the like); nothing may name a
// standard-library module that is not explicitly allowed, whether imported directly, imported from
// another module that re-exports it, or reached as an attribute. Layer 2 is the isolated runner.
const SAFETY = String.raw`
import ast, json, sys
project = set(json.loads(sys.argv[1]))
safe_std = {"unittest", "datetime", "decimal", "fractions", "math", "re", "collections", "zoneinfo", "json"}
django_ok = {"django.test", "django.utils.timezone"}
stdlib = set(sys.stdlib_module_names)
risky_std = stdlib - safe_std
banned_names = {"open", "exec", "eval", "compile", "globals", "locals", "vars", "input", "breakpoint", "getattr", "setattr", "delattr", "memoryview", "exit", "quit", "patch", "help", "type", "super", "object", "classmethod", "staticmethod", "property"}
banned_attrs = {"system", "popen", "remove", "unlink", "rmtree", "environ", "spawn", "fork", "kill", "rename", "chmod", "chown", "write_text", "write_bytes", "mkdir", "rmdir", "symlink", "patch", "mock", "urlopen", "connect", "import_string", "import_module", "resolve_name", "load_source"}
def module_ok(m):
    if not m:
        return False
    root = m.split(".")[0]
    if m == "unittest.mock" or m.startswith("unittest.mock."):
        return False
    if root == "django":
        return m in django_ok
    return root in safe_std or root in project
bad = []
try:
    tree = ast.parse(sys.stdin.read())
except SyntaxError:
    print(json.dumps(["does not parse"])); sys.exit()
for n in ast.walk(tree):
    if isinstance(n, ast.Import):
        for a in n.names:
            if not module_ok(a.name):
                bad.append("imports " + a.name)
    elif isinstance(n, ast.ImportFrom):
        if n.level:
            bad.append("relative import")
        # "from django.utils import timezone" is fine when each imported name is itself an allowed module.
        if not module_ok(n.module or "") and not all(module_ok((n.module or "") + "." + a.name) for a in n.names):
            bad.append("imports " + (n.module or "?"))
        for a in n.names:
            if a.name == "*" or a.name.startswith("_") or a.name in risky_std or a.name in banned_names or a.name in banned_attrs or (a.asname or "").startswith("_"):
                bad.append("imports " + a.name)
    elif isinstance(n, ast.Name):
        if (n.id.startswith("_") and n.id != "__name__") or n.id in banned_names or n.id in risky_std:
            bad.append("uses " + n.id)
    elif isinstance(n, ast.Attribute):
        if n.attr.startswith("_") or n.attr in banned_attrs or n.attr in risky_std:
            bad.append("uses ." + n.attr)
    elif isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        if n.decorator_list:
            bad.append("uses decorators")
print(json.dumps(sorted(set(bad))))
`;

export { RUNNER } from "../runner/exec.js";

type Ran = { status: number | null; signal: string | null; stdout: string; stderr: string };

/**
 * Runs a process without blocking the event loop (a proof takes a second or more; with spawnSync the
 * whole watcher, intake, live feeds and the bot included, froze for that long on every demo run).
 * Killed with SIGKILL at the time limit; output kept to the first 1 MB of each stream.
 */
function run(cmd: string, args: string[], opts: { cwd?: string; env?: Record<string, string>; input?: string; timeout: number }): Promise<Ran> {
  return new Promise((done) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (r: Ran) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        done(r);
      }
    };
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env, stdio: ["pipe", "pipe", "pipe"] });
    const timer = setTimeout(() => child.kill("SIGKILL"), opts.timeout);
    child.stdout.setEncoding("utf8").on("data", (d: string) => void (stdout.length < 1 << 20 && (stdout += d)));
    child.stderr.setEncoding("utf8").on("data", (d: string) => void (stderr.length < 1 << 20 && (stderr += d)));
    child.on("error", () => finish({ status: null, signal: "error", stdout, stderr }));
    child.on("close", (status, signal) => finish({ status, signal, stdout, stderr }));
    child.stdin.on("error", () => undefined);
    child.stdin.end(opts.input ?? "");
  });
}

const readProblems = (r: { status: number | null; stdout: string }): string[] => {
  if (r.status !== 0) return ["the safety check could not run"];
  try {
    return JSON.parse(r.stdout.trim()) as string[];
  } catch {
    return ["the safety check could not run"];
  }
};

/** Problems that stop a test from being run; empty means it may run. */
export function testProblems(code: string, packages: string[]): string[] {
  const py = process.env.JR_TEST_PYTHON ?? "python3";
  return readProblems(spawnSync(py, ["-E", "-s", "-c", SAFETY, JSON.stringify(packages)], { input: code, encoding: "utf8", timeout: 10_000 }));
}

async function testProblemsAsync(code: string, packages: string[]): Promise<string[]> {
  const py = process.env.JR_TEST_PYTHON ?? "python3";
  return readProblems(await run(py, ["-E", "-s", "-c", SAFETY, JSON.stringify(packages)], { input: code, timeout: 10_000 }));
}

function djangoSettings(root: string): string | null {
  const manage = join(root, "manage.py");
  if (!existsSync(manage)) return null;
  return readFileSync(manage, "utf8").match(/DJANGO_SETTINGS_MODULE["']\s*,\s*["']([\w.]+)["']/)?.[1] ?? null;
}

/**
 * "failed" only when the tests actually ran and at least one failed. A test file that cannot even be
 * imported, a crash, a timeout or a resource-limit kill is "error": it says nothing about the bug.
 */
export function readOutcome(status: number | null, signal: string | null, output: string): "passed" | "failed" | "error" {
  if (signal || status === null) return "error";
  const ran = /^Ran [1-9]\d* tests? in /m.test(output);
  if (status === 0) return ran && /^OK\b/m.test(output) ? "passed" : "error";
  return ran && /^FAILED \(/m.test(output) ? "failed" : "error";
}

// The fixed code runs too (the test imports it), so the lines the fix adds get a check of their own:
// nothing that reaches the file system, processes, the network or dynamic code.
const RISKY_IN_FIX =
  /\b(os|io|sys|subprocess|socket|shutil|ctypes|importlib|pathlib|pickle|marshal|signal|threading|multiprocessing|asyncio|http|urllib|xmlrpc|ftplib|smtplib|telnetlib|requests|httpx|open|eval|exec|compile|__import__|getattr|setattr|delattr|globals|locals|vars|breakpoint|input|dir_fd|openat|fdopen|gc|inspect|builtins|_getframe)\b/;

export function riskyFixLines(original: string, patched: string): string[] {
  const before = new Set(original.split("\n").map((l) => l.trim()));
  return patched
    .split("\n")
    .map((l) => l.trim())
    // Double-underscore names (__class__, __globals__, __subclasses__...) reach the same places by another road.
    .filter((l) => l && !l.startsWith("#") && !before.has(l) && (RISKY_IN_FIX.test(l) || /__(?!name__)\w+__/.test(l)));
}

const said = (o: "passed" | "failed" | "error") => (o === "error" ? "could not run" : o);

/** root: a readable local copy of the code (for the checks); runFrom: what the runner starts from (default: derived from root). patched: repository path -> full fixed file text (from the gate). */
export async function proveFix(
  root: string,
  patched: Record<string, string>,
  test: { file: string; code: string } | undefined,
  runFrom?: Base,
): Promise<TestRun> {
  if (!test?.code?.trim()) return { verdict: "skipped", note: "No regression test was written." };
  if (Object.keys(patched).some((p) => !p.endsWith(".py"))) return { verdict: "skipped", note: "Tests are run only for Python fixes." };
  const packages = [...new Set(Object.keys(patched).map((p) => p.split("/")[0].replace(/\.py$/, "")))];
  const settings = djangoSettings(root);
  if (settings) packages.push("django");
  const problems = await testProblemsAsync(test.code, packages);
  if (problems.length) return { verdict: "skipped", note: `Test not run: ${problems.slice(0, 3).join(", ")}.` };

  const base = resolve(root);
  for (const [path, text] of Object.entries(patched)) {
    const file = resolve(base, path);
    if (!file.startsWith(base + sep)) return { verdict: "skipped", note: "Test not run: a fixed file is outside the project." };
    const risky = riskyFixLines(existsSync(file) ? readFileSync(file, "utf8") : "", text);
    if (risky.length) return { verdict: "skipped", note: `Test not run: the fix adds code that reaches outside the program (${risky[0].slice(0, 60)}).` };
  }
  // Which code the runner starts from: the exam portal's mounted source, a playground app (given by the
  // caller), or (in-process only) this folder.
  const sandbox = process.env.JR_SANDBOX_SOURCE;
  const from: Base = runFrom ?? (sandbox && resolve(sandbox) === base ? { kind: "sandbox" } : { kind: "local", path: base });
  const mode = runnerMode();
  if (!mode) return { verdict: "skipped", note: "Test not run: the isolated test runner is not set up." };
  if (from.kind === "local" && mode !== "inprocess") return { verdict: "skipped", note: "Test not run: this project's code is not available to the isolated runner." };
  let before: "passed" | "failed" | "error";
  let after: "passed" | "failed" | "error";
  try {
    const r = await runJob({ kind: "prove", base: from, patched, test: test.code });
    if (r.kind !== "prove") throw new Error("unexpected runner answer");
    ({ before, after } = r);
  } catch (e) {
    console.error("proveFix runner:", String(e));
    return { verdict: "skipped", note: "Test not run: the isolated test runner did not answer." };
  }
  {
    const proved = before === "failed" && after === "passed";
    return {
      verdict: proved ? "proved" : "not_proved",
      before,
      after,
      note: proved
        ? "The regression test fails on the current code and passes with the fix."
        : `The regression test ${said(before)} on the current code and ${said(after)} with the fix, so it does not prove the fix.`,
    };
  }
}
