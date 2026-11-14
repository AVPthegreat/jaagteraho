// Proves a fix on the demo portal: the model's regression test must FAIL on the current code and
// PASS on the fixed code. Only for local Python projects we own (the demo portal), only for tests
// that pass a strict check: no file, network, process or environment access, imports limited to
// the code under test and a few standard modules. Runs in throwaway copies with a clean environment.
//
// Known limit (14 Nov 2026): the test runs as the same OS user as the watcher, so the OS alone would let
// it read /proc/<watcher pid>/environ, where Docker's env_file puts the secrets. Three layers stop that:
// the syntax check (no os, io, open, pathlib...), a Python audit hook in RUNNER that refuses /proc, /sys,
// /run, /data and .env files, process starts, sockets and C libraries, and the clean child environment.
// The complete fix is to run proofs in a separate container or as a separate user with no secrets.

import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

export type TestRun = {
  verdict: "proved" | "not_proved" | "skipped";
  before?: "failed" | "passed" | "error";
  after?: "failed" | "passed" | "error";
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
export const RUNNER = String.raw`
import os, sys, tempfile
# Layer 3: an audit hook (it cannot be removed from Python code) refuses what layer 1 should already
# have caught: reading /proc (another process's environment), /sys, /run, the watcher's data, .env files;
# writing outside this copy and the temp folder; starting processes; sockets; loading C libraries.
_root = os.path.realpath(os.getcwd()) + os.sep
_tmp = os.path.realpath(tempfile.gettempdir()) + os.sep
_deny = ("/proc", "/sys", "/run", "/var/run", "/data", "/dev", "/root", "/home")
_dev_ok = {"/dev/null", "/dev/urandom", "/dev/zero"}
_blocked = {"subprocess.Popen", "os.system", "os.exec", "os.posix_spawn", "os.spawn", "os.fork", "os.forkpty", "os.kill", "os.killpg",
            "socket.connect", "socket.bind", "socket.sendto", "socket.sendmsg", "socket.getaddrinfo", "ctypes.dlopen", "ctypes.dlsym", "ctypes.cdata",
            }
_wflags = os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_APPEND | os.O_TRUNC
_busy = [False]
def _bad_path(p):
    if p in _dev_ok:
        return False
    name = os.path.basename(p)
    return any(p == d or p.startswith(d + "/") for d in _deny) or name == ".env" or name.startswith(".env.")
def _hook(event, args):
    if _busy[0]:
        return
    if event in _blocked or event.startswith("subprocess.") or event.startswith("os.exec") or event.startswith("os.spawn"):
        raise PermissionError("not allowed in a regression test: " + event)
    if event in ("open", "os.listdir", "os.scandir", "shutil.copyfile", "os.remove", "os.rename", "os.rmdir", "os.mkdir", "os.symlink", "os.link", "os.truncate", "os.chmod", "os.chown"):
        path = args[0] if args else None
        if path is None or isinstance(path, int):
            return
        _busy[0] = True
        try:
            p = os.path.realpath(os.fsdecode(path))
        finally:
            _busy[0] = False
        # rename, link, symlink and copyfile have a destination too.
        dest = None
        if event in ("os.rename", "os.link", "os.symlink", "shutil.copyfile") and len(args) > 1 and isinstance(args[1], (str, bytes)):
            _busy[0] = True
            try:
                dest = os.path.realpath(os.fsdecode(args[1]))
            finally:
                _busy[0] = False
        if _bad_path(p) or (dest and _bad_path(dest)):
            raise PermissionError("not allowed in a regression test: " + p)
        if dest and not (dest + os.sep).startswith(_root) and not dest.startswith(_tmp):
            raise PermissionError("not allowed in a regression test: writing " + dest)
        writes = event != "open" and event not in ("os.listdir", "os.scandir")
        if event == "open":
            mode, flags = (args[1] if len(args) > 1 else None), (args[2] if len(args) > 2 else 0)
            writes = (isinstance(mode, str) and any(ch in mode for ch in "wax+")) or (isinstance(flags, int) and bool(flags & _wflags))
        if writes and not (p + os.sep).startswith(_root) and not p.startswith(_tmp) and p not in _dev_ok:
            raise PermissionError("not allowed in a regression test: writing " + p)
sys.addaudithook(_hook)
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

async function runIn(dir: string, settings: string | null): Promise<"passed" | "failed" | "error"> {
  const py = process.env.JR_TEST_PYTHON ?? "python3";
  const env: Record<string, string> = { PATH: process.env.PATH ?? "/usr/bin:/bin", PYTHONDONTWRITEBYTECODE: "1", LANG: "C.UTF-8" };
  if (settings) env.DJANGO_SETTINGS_MODULE = settings;
  const r = await run(py, ["-E", "-s", "-c", RUNNER], { cwd: dir, env, timeout: 20_000 });
  return readOutcome(r.status, r.signal, `${r.stdout}\n${r.stderr}`);
}

// The fixed code runs too (the test imports it), so the lines the fix adds get a check of their own:
// nothing that reaches the file system, processes, the network or dynamic code.
const RISKY_IN_FIX =
  /\b(os|io|sys|subprocess|socket|shutil|ctypes|importlib|pathlib|pickle|marshal|signal|threading|multiprocessing|asyncio|http|urllib|xmlrpc|ftplib|smtplib|telnetlib|requests|httpx|open|eval|exec|compile|__import__|getattr|setattr|delattr|globals|locals|vars|breakpoint|input)\b/;

export function riskyFixLines(original: string, patched: string): string[] {
  const before = new Set(original.split("\n").map((l) => l.trim()));
  return patched
    .split("\n")
    .map((l) => l.trim())
    // Double-underscore names (__class__, __globals__, __subclasses__...) reach the same places by another road.
    .filter((l) => l && !l.startsWith("#") && !before.has(l) && (RISKY_IN_FIX.test(l) || /__(?!name__)\w+__/.test(l)));
}

const said = (o: "passed" | "failed" | "error") => (o === "error" ? "could not run" : o);

/** root: the project's local folder. patched: repository path -> full fixed file text (from the gate). */
export async function proveFix(root: string, patched: Record<string, string>, test: { file: string; code: string } | undefined): Promise<TestRun> {
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
    const before = await runIn(broken, settings);
    const after = await runIn(fixed, settings);
    const proved = before === "failed" && after === "passed";
    return {
      verdict: proved ? "proved" : "not_proved",
      before,
      after,
      note: proved
        ? "The regression test fails on the current code and passes with the fix."
        : `The regression test ${said(before)} on the current code and ${said(after)} with the fix, so it does not prove the fix.`,
    };
  } finally {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  }
}
