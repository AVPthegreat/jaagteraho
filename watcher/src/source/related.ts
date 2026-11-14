// One hop beyond the stack trace: the files that the failing functions import AND use.
// Many bugs crash in one place but live in another (a shared helper, a setting, a validator);
// showing those files lets the diagnosis find the real cause. Code picks them, never the model.

import type { SourceFile } from "../pipeline/diagnose.js";
import type { SourceProvider } from "./source.js";

const MAX_RELATED = 2;
const MAX_LINES = 600;
// Modules that rarely hold a bug's cause: exception classes, constants, re-exports, type stubs.
const TRIVIAL = /(^|\/)(exceptions?|errors?|constants|_?compat|typing|_types|types|__init__|index)\.(py|ts|js|mjs)$/;

/** 1-based lines where any of `names` is defined (def, class, function, or assigned). */
export function definitionLines(text: string, names: Set<string>): number[] {
  const out: number[] = [];
  text.split("\n").forEach((l, i) => {
    const m = l.match(/^\s*(?:async\s+)?(?:def|class|function)\s+(\w+)|^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=|^(\w+)\s*=/);
    const name = m?.[1] ?? m?.[2] ?? m?.[3];
    if (name && names.has(name)) out.push(i + 1);
  });
  return out;
}

/** The lines of the function that contains `line` (1-based), for Python and JavaScript. */
export function enclosingFunction(text: string, line: number): string[] {
  const [start, end] = enclosingRange(text, line);
  return text.split("\n").slice(start, end);
}

/** 0-based [start, end) of the function that contains `line` (1-based), at most 200 lines. */
export function enclosingRange(text: string, line: number): [number, number] {
  const lines = text.split("\n");
  const i = Math.min(Math.max(0, line - 1), lines.length - 1);
  const indent = (s: string) => s.match(/^\s*/)![0].length;
  let start = i;
  const isDef = (s: string) => /^\s*(async\s+)?def\s|^\s*(export\s+)?(async\s+)?function\s|^\s*(public|private|protected|static|async|\w+)\s*\(.*\)\s*\{\s*$|=>\s*\{\s*$/.test(s);
  while (start > 0 && !isDef(lines[start])) start--;
  const base = indent(lines[start] ?? "");
  let end = i + 1;
  while (end < lines.length && (lines[end].trim() === "" || indent(lines[end]) > base || /^\s*[)}\]]/.test(lines[end]))) end++;
  return [start, Math.min(end, start + 200)];
}

type Import = { names: string[]; module: string; level: number; js: boolean };

export function parseImports(text: string): Import[] {
  const out: Import[] = [];
  // Python: join parenthesised imports onto one line first.
  const flat = text.replace(/from\s+([.\w]+)\s+import\s*\(([^)]*)\)/g, (_, m, names) => `from ${m} import ${String(names).replace(/\s+/g, " ")}`);
  for (const l of flat.split("\n")) {
    let m = l.match(/^\s*from\s+(\.*)([\w.]*)\s+import\s+(.+)$/);
    if (m) {
      const names = m[3].split(",").map((n) => n.trim().split(/\s+as\s+/).pop()!.trim()).filter((n) => /^\w+$/.test(n));
      out.push({ names, module: m[2], level: m[1].length, js: false });
      continue;
    }
    m = l.match(/^\s*import\s+([\w.]+)(?:\s+as\s+(\w+))?\s*$/);
    if (m) {
      out.push({ names: [m[2] ?? m[1].split(".")[0]], module: m[1], level: 0, js: false });
      continue;
    }
    // JavaScript / TypeScript: import { a, b as c } from "./x"; import x from "./x"; const { a } = require("./x")
    m = l.match(/^\s*import\s+(?:type\s+)?(.+?)\s+from\s+["'](\.{1,2}\/[^"']+)["']/);
    if (m) {
      const names = m[1].replace(/[{}*]/g, " ").split(/[\s,]+/).filter((n) => /^\w+$/.test(n) && n !== "as" && n !== "type");
      out.push({ names, module: m[2], level: 0, js: true });
      continue;
    }
    m = l.match(/^\s*(?:const|let|var)\s+(.+?)\s*=\s*require\(["'](\.{1,2}\/[^"']+)["']\)/);
    if (m) out.push({ names: m[1].replace(/[{}]/g, " ").split(/[\s,:]+/).filter((n) => /^\w+$/.test(n)), module: m[2], level: 0, js: true });
  }
  return out;
}

/** Candidate repository paths for an import made from `fromPath`. */
export function candidates(fromPath: string, imp: Import): string[] {
  const dir = fromPath.split("/").slice(0, -1);
  if (imp.js) {
    const parts = [...dir];
    for (const seg of imp.module.split("/")) {
      if (seg === "..") parts.pop();
      else if (seg !== ".") parts.push(seg);
    }
    const base = parts.join("/");
    return /\.\w+$/.test(base) ? [base] : [".ts", ".js", ".tsx", ".mjs", "/index.ts", "/index.js"].map((e) => base + e);
  }
  const mod = imp.module.split(".").filter(Boolean);
  if (imp.level > 0) {
    const up = dir.slice(0, dir.length - (imp.level - 1));
    const p = [...up, ...mod].join("/");
    return mod.length ? [`${p}.py`, `${p}/__init__.py`] : [];
  }
  // Absolute: from the repository root, or from the folder above the file's top package (src/ layouts).
  const p = mod.join("/");
  const roots = ["", ...dir.slice(0, 1).map((d) => (d === "src" ? "src/" : ""))];
  return [...new Set(roots.flatMap((r) => [`${r}${p}.py`, `${r}${p}/__init__.py`]))];
}

/**
 * Files imported and used by the functions in the stack trace, most used first.
 * Skips files already shown and anything that does not exist in the repository (installed packages).
 */
export async function relatedFiles(src: SourceProvider, shown: SourceFile[], ref?: string | null): Promise<SourceFile[]> {
  const score = new Map<string, number>();
  const tried = new Map<string, SourceFile | null>();
  const wanted = new Set<string>();
  const methods = new Set<string>();
  for (const f of shown) {
    const body = (f.focus?.length ? f.focus : [1]).flatMap((line) => enclosingFunction(f.text, line)).join("\n");
    // Only names the failing code calls or reaches into (name( or name.x) count; a name merely
    // mentioned, like an exception class in an except clause, says little about the cause.
    const called = new Set([...body.matchAll(/\b([A-Za-z_]\w*)\s*(?:\(|\.)/g)].map((m) => m[1]));
    for (const m of body.matchAll(/\.([A-Za-z_]\w*)\s*\(/g)) methods.add(m[1]);
    for (const imp of parseImports(f.text)) {
      const hits = imp.names.filter((n) => called.has(n));
      if (!hits.length) continue;
      for (const c of candidates(f.path, imp)) {
        if (TRIVIAL.test(c)) continue;
        score.set(c, (score.get(c) ?? 0) + hits.length);
        for (const h of hits) wanted.add(h);
      }
    }
  }
  const out: SourceFile[] = [];
  for (const [path] of [...score].sort((a, b) => b[1] - a[1])) {
    if (out.length >= MAX_RELATED) break;
    const bare = path.replace(/\/__init__\.py$|\.py$|\.(ts|js|tsx|mjs)$|\/index\.(ts|js)$/, "");
    if (shown.some((s) => s.path === path || s.path.endsWith(`/${path}`)) || out.some((o) => o.path.replace(/\.\w+$/, "") === bare)) continue;
    if (!tried.has(path)) {
      const text = await src.getFile(path, ref).catch(() => null);
      if (!text) tried.set(path, null);
      else if (text.split("\n").length <= MAX_LINES) tried.set(path, { path, text, focus: [] });
      else {
        // A big module: show only the definitions the failing code calls.
        const focus = definitionLines(text, new Set([...wanted, ...methods]));
        tried.set(path, focus.length ? { path, text, focus: focus.slice(0, 4) } : null);
      }
    }
    const f = tried.get(path);
    if (f) out.push(f);
  }
  return out;
}
