// Runs app code and AI-written code: a planted bug's trigger, our hidden test on a patched copy, and the
// model's regression test before and after a fix (fix proof). In production this module runs ONLY inside the
// isolated runner service (runner/server.ts: no network, no secrets, read-only root, its own tmpfs, pid,
// memory and CPU limits), reached over a unix socket. The watcher never executes app or patch code itself;
// the in-process path (runner/client.ts, JR_RUNNER=inprocess) exists for tests and local development only.
//
// Inside the runner, every run is also confined in-process, as defence in depth: a throwaway copy, a clean
// environment, a hard time limit, and for Python an audit hook plus resource limits; Node.js runs under its
// permission model (reads only inside the copy, no child processes) with a heap limit.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

export type Edit = { file: string; find: string; replace: string };

/** Which code a job starts from. "local" (any folder) is accepted only in-process, never by the runner service. */
export type Base = { kind: "bench"; app: string; edits?: Edit[]; dir?: string } | { kind: "sandbox" } | { kind: "local"; path: string };

export type Job =
  | { kind: "trigger"; base: Base; code: string; patched?: Record<string, string>; respond?: boolean }
  | { kind: "hidden"; base: Base; patched: Record<string, string>; test: string }
  | { kind: "prove"; base: Base; patched: Record<string, string>; test: string };

export type Outcome = "passed" | "failed" | "error";
export type JobResult =
  | { kind: "trigger"; status: number | null; signal: string | null; stderr: string; dir: string; response?: string | null }
  | { kind: "hidden"; outcome: Outcome }
  | { kind: "prove"; before: Outcome; after: Outcome };

export const RUN_TIMEOUT_MS = 20_000;
const APP_NAME = /^[a-z][a-z0-9_-]{0,39}$/;
const PY = () => process.env.JR_TEST_PYTHON ?? process.env.JR_BENCH_PYTHON ?? "python3";

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

// The confinement part of RUNNER, without its last line (which starts unittest on a fixed module).
const PY_PRELUDE = RUNNER.slice(0, RUNNER.lastIndexOf("unittest.main("));

/**
 * The Python test harness. The per-run token is read from stdin and stdin is closed BEFORE any app or test
 * code is imported, so the code under test cannot print a fake verdict: a run counts only when the harness
 * itself prints "<token>:pass" (or ":fail") and exits with the matching code.
 */
const pyHarness = (module: string) => `import sys
_jr_token = sys.stdin.readline().strip()
sys.stdin.close()
${PY_PRELUDE}
import importlib
def _jr_run(name):
    try:
        mod = importlib.import_module(name)
    except BaseException:
        return "error"
    suite = unittest.defaultTestLoader.loadTestsFromModule(mod)
    result = unittest.TextTestRunner(stream=sys.stderr, verbosity=1).run(suite)
    if result.testsRun == 0:
        return "error"
    return "pass" if result.wasSuccessful() else "fail"
_jr_outcome = _jr_run(${JSON.stringify(module)})
sys.stdout.write("\\n" + _jr_token + ":" + _jr_outcome + "\\n")
sys.stdout.flush()
sys.exit(0 if _jr_outcome == "pass" else 1)
`;

/** The Node.js test harness: node:test's run() in this process (no child processes), same token rule. */
const NODE_HARNESS = `const fs = require("node:fs");
const token = fs.readFileSync(0, "utf8").split("\\n")[0].trim();
const { run } = require("node:test");
let pass = 0, fail = 0;
const stream = run({ files: [process.argv[2]], isolation: "none", concurrency: 1 });
stream.on("test:pass", (d) => { if (!d.skip && !d.todo) pass++; });
stream.on("test:fail", () => { fail++; });
stream.on("data", () => {});
stream.on("end", () => {
  const o = fail ? "fail" : pass ? "pass" : "error";
  process.stdout.write("\\n" + token + ":" + o + "\\n", () => process.exit(o === "pass" ? 0 : 1));
});
`;

type Ran = { status: number | null; signal: string | null; stdout: string; stderr: string };

/** Spawns without blocking; SIGKILL at the limit; at most 256 KB of each stream kept. */
function run(cmd: string, args: string[], cwd: string, timeoutMs: number, input = ""): Promise<Ran> {
  const env: Record<string, string> = { PATH: process.env.PATH ?? "/usr/bin:/bin", PYTHONDONTWRITEBYTECODE: "1", LANG: "C.UTF-8" };
  return new Promise((done) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(cmd, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    const finish = (r: Ran) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done(r);
    };
    child.stdout.setEncoding("utf8").on("data", (d: string) => void (stdout.length < 1 << 18 && (stdout += d)));
    child.stderr.setEncoding("utf8").on("data", (d: string) => void (stderr.length < 1 << 18 && (stderr += d)));
    child.on("error", () => finish({ status: null, signal: "error", stdout, stderr }));
    child.on("close", (status, signal) => finish({ status, signal, stdout, stderr }));
    child.stdin.on("error", () => undefined);
    child.stdin.end(input);
  });
}

const isNode = (dir: string) => existsSync(join(dir, "package.json"));
const nodeArgs = (dir: string) => ["--permission", `--allow-fs-read=${dir}`, "--max-old-space-size=256", "--stack-size=984"];
const SKIP_COPY = /(^|[\\/])(\.venv|venv|node_modules|\.git|__pycache__|data|\.env[^\\/]*)([\\/]|$)/;

export type ExecOptions = { allowLocal: boolean };

function rootOf(base: Base, opts: ExecOptions): string {
  if (base.kind === "sandbox") {
    const s = process.env.JR_SANDBOX_SOURCE;
    if (!s) throw new Error("no sandbox source");
    return resolve(s);
  }
  if (base.kind === "local") {
    if (!opts.allowLocal) throw new Error("local folders are not accepted");
    return resolve(base.path);
  }
  if (!APP_NAME.test(base.app)) throw new Error("bad app name");
  const benchDir = base.dir && opts.allowLocal ? base.dir : (process.env.JR_BENCH_DIR ?? new URL("../../../bench", import.meta.url).pathname);
  const root = resolve(benchDir, "apps", base.app);
  if (!existsSync(root)) throw new Error("unknown app");
  return root;
}

/** A fresh copy of the base with its edits (each "find" must occur exactly once) and the patched files. */
async function prepare(base: Base, opts: ExecOptions, patched: Record<string, string> = {}): Promise<string> {
  const root = rootOf(base, opts);
  const to = await mkdtemp(join(tmpdir(), "jrrun-"));
  await cp(root, to, { recursive: true, filter: (src) => !SKIP_COPY.test(src.slice(root.length)) });
  const inside = (p: string) => {
    const full = resolve(to, p);
    if (!full.startsWith(to + sep)) throw new Error("path outside the copy");
    return full;
  };
  for (const e of base.kind === "bench" ? (base.edits ?? []) : []) {
    const path = inside(e.file);
    const text = await readFile(path, "utf8");
    if (text.split(e.find).length - 1 !== 1) throw new Error(`${e.file}: find text must occur once`);
    await writeFile(path, text.replace(e.find, e.replace));
  }
  for (const [p, text] of Object.entries(patched)) await writeFile(inside(p), text);
  return to;
}

function djangoSettings(root: string): string | null {
  const manage = join(root, "manage.py");
  if (!existsSync(manage)) return null;
  return readFileSync(manage, "utf8").match(/DJANGO_SETTINGS_MODULE["']\s*,\s*["']([\w.]+)["']/)?.[1] ?? null;
}

/** Runs one test file in a prepared copy and reads the harness's verdict (token + exit code). */
async function runTests(dir: string, file: string): Promise<Outcome> {
  const token = randomBytes(16).toString("hex");
  let r: Ran;
  if (isNode(dir)) {
    const harness = join(dir, "jr_harness.cjs");
    await writeFile(harness, NODE_HARNESS);
    r = await run(process.execPath, [...nodeArgs(dir), harness, join(dir, file)], dir, RUN_TIMEOUT_MS, `${token}\n`);
  } else {
    const module = file.replace(/\.py$/, "");
    const settings = djangoSettings(dir);
    const harness = settings ? `import os\nos.environ.setdefault("DJANGO_SETTINGS_MODULE", ${JSON.stringify(settings)})\n${pyHarness(module)}` : pyHarness(module);
    r = await run(PY(), ["-E", "-s", "-c", harness], dir, RUN_TIMEOUT_MS, `${token}\n`);
  }
  return judge(r, token);
}

/** passed: exit 0 and the harness's own "<token>:pass"; failed: tests ran and some failed; anything else: error. */
export function judge(r: { status: number | null; signal: string | null; stdout: string }, token: string): Outcome {
  if (r.signal || r.status === null) return "error";
  const lines = r.stdout.split("\n").map((l) => l.trim());
  if (r.status === 0 && lines.includes(`${token}:pass`)) return "passed";
  if (r.status === 1 && lines.includes(`${token}:fail`)) return "failed";
  return "error";
}

const RESULT = "__JR_RESPONSE__";

/**
 * The trigger's last line is the request a user makes (handle(...)); with respond, its return value is
 * printed so the playground can show the app's real answer once the bug is fixed. Our code, not visitor input.
 */
export function withResponse(code: string, node: boolean): string {
  const lines = code.replace(/\s+$/, "").split("\n");
  const last = lines.pop()!.trim().replace(/;$/, "");
  if (!/^handle\(/.test(last)) return code;
  return node
    ? [...lines, `process.stdout.write("\\n${RESULT}" + JSON.stringify(${last}) + "\\n");`].join("\n")
    : [...lines, `import json as _jr_json`, `print("\\n${RESULT}" + _jr_json.dumps(${last}, default=str))`].join("\n");
}

function responseOf(stdout: string): string | null {
  const at = stdout.lastIndexOf(RESULT);
  if (at < 0) return null;
  return stdout.slice(at + RESULT.length).split("\n")[0].slice(0, 4000);
}

export async function execJob(job: Job, opts: ExecOptions): Promise<JobResult> {
  const dirs: string[] = [];
  try {
    if (job.kind === "trigger") {
      const dir = await prepare(job.base, opts, job.patched ?? {});
      dirs.push(dir);
      const node = isNode(dir);
      const code = job.respond ? withResponse(job.code, node) : job.code;
      if (node) {
        const r = await run(process.execPath, [...nodeArgs(dir), "-e", code], dir, RUN_TIMEOUT_MS);
        return { kind: "trigger", status: r.status, signal: r.signal, stderr: r.stderr, dir, response: job.respond ? responseOf(r.stdout) : undefined };
      }
      // The confinement is imported from a file, so the trigger's own line numbers stay close to what it says.
      await writeFile(join(dir, "jr_sandbox.py"), PY_PRELUDE);
      const r = await run(PY(), ["-E", "-s", "-c", `import jr_sandbox\n${code}`], dir, RUN_TIMEOUT_MS);
      return { kind: "trigger", status: r.status, signal: r.signal, stderr: r.stderr, dir, response: job.respond ? responseOf(r.stdout) : undefined };
    }
    if (job.kind === "hidden") {
      const dir = await prepare(job.base, opts, job.patched);
      dirs.push(dir);
      const file = isNode(dir) ? "jr_hidden_test.js" : "jr_hidden_test.py";
      await writeFile(join(dir, file), job.test);
      return { kind: "hidden", outcome: await runTests(dir, file) };
    }
    const broken = await prepare(job.base, opts);
    dirs.push(broken);
    const fixed = await prepare(job.base, opts, job.patched);
    dirs.push(fixed);
    for (const d of [broken, fixed]) await writeFile(join(d, "jr_regression_test.py"), job.test);
    const before = await runTests(broken, "jr_regression_test.py");
    const after = await runTests(fixed, "jr_regression_test.py");
    return { kind: "prove", before, after };
  } finally {
    for (const d of dirs) await rm(d, { recursive: true, force: true }).catch(() => undefined);
  }
}
