// Works out what kind of app lives in a folder, and where the error package should be started.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SKIP = new Set(["node_modules", ".git", ".venv", "venv", "env", "__pycache__", ".next", "dist", "build", "site-packages", ".tox", ".mypy_cache"]);

/** Lists files up to a few levels deep, skipping dependency and build folders. */
export function walk(root, maxDepth = 4) {
  const out = [];
  const go = (dir, depth) => {
    if (depth > maxDepth) return;
    let names = [];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const n of names) {
      if (SKIP.has(n) || n.startsWith(".")) continue;
      const p = join(dir, n);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) go(p, depth + 1);
      else if (st.size < 400_000) out.push(p);
    }
  };
  go(root, 0);
  return out;
}

const read = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
};

function pythonDeps(root) {
  return ["requirements.txt", "pyproject.toml", "Pipfile", "setup.py"].map((f) => read(join(root, f))).join("\n").toLowerCase();
}

/**
 * Returns { framework, entry, language, notes } where framework is one of
 * django | flask | fastapi | python | express | next | node, or null when nothing is recognised.
 */
export function detect(root) {
  const pkgPath = join(root, "package.json");
  if (existsSync(pkgPath)) {
    let pkg = {};
    try {
      pkg = JSON.parse(read(pkgPath));
    } catch {
      /* broken package.json: treat as plain node */
    }
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const esm = pkg.type === "module";
    if (deps.next) {
      const src = existsSync(join(root, "src", "app")) || existsSync(join(root, "src", "pages"));
      return { framework: "next", language: "javascript", entry: join(root, src ? "src" : "", "instrumentation.ts"), esm, pkg };
    }
    const entry = nodeEntry(root, pkg);
    if (deps.express) return { framework: "express", language: "javascript", entry, esm, pkg };
    return { framework: "node", language: "javascript", entry, esm, pkg };
  }

  const files = walk(root);
  const py = files.filter((f) => f.endsWith(".py"));
  if (existsSync(join(root, "manage.py")) || py.some((f) => f.endsWith("settings.py"))) {
    const settings = py.filter((f) => f.endsWith("settings.py") && /INSTALLED_APPS/.test(read(f)));
    if (settings.length) return { framework: "django", language: "python", entry: settings.sort((a, b) => a.length - b.length)[0] };
  }
  const deps = pythonDeps(root);
  const byContent = (re) => py.filter((f) => re.test(read(f))).sort((a, b) => relative(root, a).length - relative(root, b).length)[0];
  if (/fastapi/.test(deps) || py.some((f) => /FastAPI\(/.test(read(f)))) {
    const entry = byContent(/=\s*FastAPI\(/);
    if (entry) return { framework: "fastapi", language: "python", entry };
  }
  if (/flask/.test(deps) || py.some((f) => /Flask\(__name__/.test(read(f)))) {
    const entry = byContent(/Flask\(__name__/);
    if (entry) return { framework: "flask", language: "python", entry };
  }
  if (py.length) return { framework: "python", language: "python", entry: null };
  return { framework: null, language: null, entry: null };
}

function nodeEntry(root, pkg) {
  const candidates = [];
  if (typeof pkg.main === "string") candidates.push(pkg.main);
  const start = pkg.scripts?.start ?? pkg.scripts?.dev ?? "";
  const m = start.match(/(?:node|nodemon|tsx|ts-node)\s+(?:--\S+\s+)*([\w./-]+\.(?:m?js|cjs|ts))/);
  if (m) candidates.push(m[1]);
  candidates.push("server.js", "app.js", "index.js", "src/server.js", "src/app.js", "src/index.js", "server.ts", "src/server.ts", "src/index.ts", "index.ts");
  for (const c of candidates) {
    const p = join(root, c);
    if (existsSync(p)) return p;
  }
  return null;
}
