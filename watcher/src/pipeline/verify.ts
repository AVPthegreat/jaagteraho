// Proves a fix on the demo portal: the model's regression test must FAIL on the current code and
// PASS on the fixed code. Only for local Python projects we own (the demo portal), only for tests
// that pass a strict check: no file, network, process or environment access, imports limited to
// the code under test and a few standard modules. Runs in throwaway copies with a clean environment.

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

export type TestRun = {
  verdict: "proved" | "not_proved" | "skipped";
  before?: "failed" | "passed";
  after?: "failed" | "passed";
  note: string;
};

// Layer 1 of 2: a strict check of the test's syntax tree. Imports are an allowlist; no name or
// attribute may start with "_" (closes __builtins__, __class__ and the like); nothing may name a
// standard-library module that is not explicitly allowed, whether imported directly, imported from
// another module that re-exports it, or reached as an attribute. Layer 2 is in runIn: OS limits.
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

// Layer 2: the test process may not start any other process, write big files, use much memory
// or run long. Limits are set inside the child before the test is imported.
const RUNNER = String.raw`
import resource, unittest
for name, value in (("RLIMIT_NPROC", 0), ("RLIMIT_FSIZE", 1 << 20), ("RLIMIT_CPU", 15), ("RLIMIT_AS", 1 << 30), ("RLIMIT_CORE", 0)):
    lim = getattr(resource, name, None)
    if lim is not None:
        try:
            resource.setrlimit(lim, (value, value))
        except (ValueError, OSError):
            pass
unittest.main(module="jr_regression_test", argv=["jr"], exit=True)
`;

/** Problems that stop a test from being run; empty means it may run. */
export function testProblems(code: string, packages: string[]): string[] {
  const py = process.env.JR_TEST_PYTHON ?? "python3";
  const r = spawnSync(py, ["-E", "-s", "-c", SAFETY, JSON.stringify(packages)], { input: code, encoding: "utf8", timeout: 10_000 });
  if (r.status !== 0) return ["the safety check could not run"];
  try {
    return JSON.parse(r.stdout.trim()) as string[];
  } catch {
    return ["the safety check could not run"];
  }
}

function djangoSettings(root: string): string | null {
  const manage = join(root, "manage.py");
  if (!existsSync(manage)) return null;
  return readFileSync(manage, "utf8").match(/DJANGO_SETTINGS_MODULE["']\s*,\s*["']([\w.]+)["']/)?.[1] ?? null;
}

function runIn(dir: string, settings: string | null): "passed" | "failed" {
  const py = process.env.JR_TEST_PYTHON ?? "python3";
  const env: Record<string, string> = { PATH: process.env.PATH ?? "/usr/bin:/bin", PYTHONDONTWRITEBYTECODE: "1", LANG: "C.UTF-8" };
  if (settings) env.DJANGO_SETTINGS_MODULE = settings;
  const r = spawnSync(py, ["-E", "-s", "-c", RUNNER], { cwd: dir, env, encoding: "utf8", timeout: 20_000, killSignal: "SIGKILL" });
  return r.status === 0 ? "passed" : "failed";
}

/** root: the project's local folder. patched: repository path -> full fixed file text (from the gate). */
export function proveFix(root: string, patched: Record<string, string>, test: { file: string; code: string } | undefined): TestRun {
  if (!test?.code?.trim()) return { verdict: "skipped", note: "No regression test was written." };
  if (Object.keys(patched).some((p) => !p.endsWith(".py"))) return { verdict: "skipped", note: "Tests are run only for Python fixes." };
  const packages = [...new Set(Object.keys(patched).map((p) => p.split("/")[0].replace(/\.py$/, "")))];
  const settings = djangoSettings(root);
  if (settings) packages.push("django");
  const problems = testProblems(test.code, packages);
  if (problems.length) return { verdict: "skipped", note: `Test not run: ${problems.slice(0, 3).join(", ")}.` };

  const base = resolve(root);
  const dirs: string[] = [];
  try {
    const copy = () => {
      const d = mkdtempSync(join(tmpdir(), "jr-verify-"));
      dirs.push(d);
      cpSync(base, d, { recursive: true, filter: (src) => !/(^|[\\/])(\.venv|venv|node_modules|\.git|__pycache__|data)([\\/]|$)/.test(src.slice(base.length)) });
      writeFileSync(join(d, "jr_regression_test.py"), test.code);
      return d;
    };
    const broken = copy();
    const fixed = copy();
    for (const [path, text] of Object.entries(patched)) {
      const target = resolve(fixed, path);
      if (!target.startsWith(resolve(fixed) + sep)) return { verdict: "skipped", note: "Test not run: a fixed file is outside the project." };
      writeFileSync(target, text);
    }
    const before = runIn(broken, settings);
    const after = runIn(fixed, settings);
    const proved = before === "failed" && after === "passed";
    return {
      verdict: proved ? "proved" : "not_proved",
      before,
      after,
      note: proved
        ? "The regression test fails on the current code and passes with the fix."
        : `The regression test ${before} on the current code and ${after} with the fix, so it does not prove the fix.`,
    };
  } finally {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  }
}
