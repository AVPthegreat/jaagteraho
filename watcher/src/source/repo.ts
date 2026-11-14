// A read-only snapshot of the app's code at one commit, so the diagnosis can look beyond the stack trace:
// find where a function or class is defined, search for a text (an error message), read a few lines.
// The snapshot is the repository's tarball (one request), unpacked in memory; only code files are kept.

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";

const CODE = /\.(py|pyi|js|mjs|cjs|ts|tsx|jsx|cfg|toml|ini)$/;
const SKIP_DIR = /(^|\/)(node_modules|\.git|\.venv|venv|dist|build|vendor|__pycache__|site-packages|\.tox|\.mypy_cache|docs_src)(\/|$)/;
const MAX_FILE = 300_000;
const MAX_TOTAL = 40_000_000;
const MAX_FILES = 20_000;
const MAX_DOWNLOAD = 80_000_000;
/** Tests, docs and examples rarely hold the cause; they rank after the app's own code. */
const SECONDARY = /(^|\/)(tests?|testing|docs?|examples?|benchmarks?|scripts)(\/|$)|(^|\/)(test_[^/]*|[^/]*_test)\.py$|\.(test|spec)\.\w+$/;

export class RepoIndex {
  constructor(readonly files: Map<string, string>) {}

  has(path: string): boolean {
    return this.files.has(path);
  }

  /** The repository path for a path seen in a stack trace or named by the model (suffix match). */
  resolve(path: string): string | null {
    const p = path.replace(/\\/g, "/").replace(/^\.?\//, "");
    if (this.files.has(p)) return p;
    let best: string | null = null;
    for (const k of this.files.keys()) if (k.endsWith(`/${p}`) && (!best || k.length < best.length)) best = k;
    return best;
  }

  /** Top-level importable package names: Python packages (a folder with __init__.py) at the root or under src/, or top-level modules. */
  packages(): Set<string> {
    const out = new Set<string>();
    for (const k of this.files.keys()) {
      const parts = k.split("/");
      const rest = parts[0] === "src" ? parts.slice(1) : parts;
      if (rest.length === 2 && rest[1] === "__init__.py") out.add(rest[0]);
      else if (rest.length === 1 && /\.py$/.test(rest[0]) && !/^(setup|conftest|noxfile|tasks|docs?)\.py$/.test(rest[0])) out.add(rest[0].replace(/\.py$/, ""));
    }
    return out;
  }

  /**
   * Where `name` is defined. "Class.method" finds the method inside that class first.
   * Returns at most `limit` hits, app code before tests.
   */
  definitions(name: string, limit = 3): Array<{ path: string; line: number }> {
    const parts = name.replace(/\(\)$/, "").split(".").filter((x) => /^\w+$/.test(x));
    if (!parts.length) return [];
    const target = parts[parts.length - 1];
    const owner = parts.length > 1 ? parts[parts.length - 2] : null;
    const def = new RegExp(`^(\\s*)(?:async\\s+)?(?:def|class|function)\\s+${target}\\b|^(\\s*)(?:export\\s+)?(?:const|let|var)\\s+${target}\\s*=|^()${target}\\s*=|^(\\s+)(?:static\\s+|async\\s+|get\\s+|set\\s+)*${target}\\s*\\([^)]*\\)\\s*\\{`);
    const hits: Array<{ path: string; line: number; rank: number }> = [];
    for (const [path, text] of this.files) {
      if (!text.includes(target)) continue;
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(def);
        if (!m) continue;
        const indent = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? "").length;
        let inOwner = false;
        if (owner && indent > 0) {
          for (let j = i - 1; j >= 0; j--) {
            const c = lines[j].match(/^(\s*)class\s+(\w+)/);
            if (c && c[1].length < indent) {
              inOwner = c[2] === owner;
              break;
            }
          }
        }
        const rank = (owner && !inOwner ? 2 : 0) + (SECONDARY.test(path) ? 4 : 0) + (path.endsWith(".pyi") ? 1 : 0);
        hits.push({ path, line: i + 1, rank });
      }
    }
    return hits.sort((a, b) => a.rank - b.rank || a.path.length - b.path.length).slice(0, limit).map(({ path, line }) => ({ path, line }));
  }

  /** Lines containing `needle` literally, app code first. */
  search(needle: string, limit = 15): Array<{ path: string; line: number; text: string }> {
    if (needle.trim().length < 3) return [];
    const hits: Array<{ path: string; line: number; text: string; secondary: boolean }> = [];
    for (const [path, text] of this.files) {
      if (!text.includes(needle)) continue;
      text.split("\n").forEach((l, i) => {
        if (l.includes(needle)) hits.push({ path, line: i + 1, text: l.trim().slice(0, 200), secondary: SECONDARY.test(path) });
      });
    }
    return hits.sort((a, b) => Number(a.secondary) - Number(b.secondary)).slice(0, limit).map(({ path, line, text }) => ({ path, line, text }));
  }
}

const numberedSlice = (text: string, start: number, end: number) =>
  text.split("\n").slice(start - 1, end).map((l, i) => `${String(start + i).padStart(5)}| ${l}`).join("\n");

/** What a lookup returns to the model: the definition at `line` and its body, numbered and capped. */
export function showDefinition(index: RepoIndex, path: string, line: number, maxLines = 90): string {
  const lines = (index.files.get(path) ?? "").split("\n");
  const indent = (s: string) => s.match(/^\s*/)![0].length;
  const base = indent(lines[line - 1] ?? "");
  let end = line;
  // The signature may span lines; then the body is everything indented deeper (or a closing bracket).
  while (end < lines.length && end - line < maxLines - 1 && (lines[end].trim() === "" || indent(lines[end]) > base || /^\s*[)}\]]/.test(lines[end]))) end++;
  while (end > line && lines[end - 1].trim() === "") end--;
  return numberedSlice(index.files.get(path) ?? "", line, end);
}

export function showLines(index: RepoIndex, path: string, start: number, end: number): string {
  const text = index.files.get(path) ?? "";
  const n = text.split("\n").length;
  const s = Math.max(1, Math.min(start, n));
  return numberedSlice(text, s, Math.min(n, Math.max(s, end), s + 149));
}

// ---- Loading ----

/** Minimal streaming tar reader: keeps code files only, never buffers the whole archive. */
async function untar(stream: Readable, keep: (path: string, size: number) => boolean): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  let buf: Buffer = Buffer.alloc(0);
  let want: { path: string; size: number; keep: boolean } | null = null;
  let total = 0;
  let longName: string | null = null;
  for await (const chunk of stream) {
    buf = buf.length ? Buffer.concat([buf, chunk as Buffer]) : (chunk as Buffer);
    for (;;) {
      if (!want) {
        if (buf.length < 512) break;
        const h = buf.subarray(0, 512);
        if (h.every((b) => b === 0)) {
          buf = buf.subarray(512);
          continue;
        }
        const str = (a: number, b: number) => h.subarray(a, b).toString("utf8").replace(/\0.*$/s, "");
        const size = parseInt(str(124, 136).trim() || "0", 8);
        const type = String.fromCharCode(h[156]);
        const prefix = str(345, 500);
        let path: string = longName ?? (prefix ? `${prefix}/${str(0, 100)}` : str(0, 100));
        longName = null;
        if (type === "x" || type === "L") {
          // A pax header or GNU long name: the next entry's real path.
          buf = buf.subarray(512);
          want = { path: type === "L" ? "\0longname" : "\0pax", size, keep: true };
          continue;
        }
        // GitHub tarballs put everything under "<owner>-<repo>-<sha>/".
        path = path.split("/").slice(1).join("/");
        buf = buf.subarray(512);
        const isFile = type === "0" || type === "\0";
        want = { path, size, keep: isFile && files.size < MAX_FILES && total + size <= MAX_TOTAL && keep(path, size) };
      }
      const padded = Math.ceil(want.size / 512) * 512;
      if (buf.length < padded) break;
      if (want.keep) {
        const data: string = buf.subarray(0, want.size).toString("utf8");
        if (want.path === "\0longname") longName = data.replace(/\0.*$/s, "");
        else if (want.path === "\0pax") longName = data.match(/(?:^|\n)\d+ path=([^\n]*)\n/)?.[1] ?? null;
        else {
          files.set(want.path, data);
          total += want.size;
        }
      }
      buf = buf.subarray(padded);
      want = null;
    }
  }
  return files;
}

const wanted = (path: string, size: number) => CODE.test(path) && !SKIP_DIR.test(path) && size <= MAX_FILE;

/** Downloads `https://...tar.gz` and indexes its code files. */
export async function indexFromTarball(url: string, headers: Record<string, string> = {}): Promise<RepoIndex | null> {
  const res = await fetch(url, { headers: { "user-agent": "jaagteraho-watcher", ...headers }, signal: AbortSignal.timeout(60_000) }).catch(() => null);
  if (!res?.ok || !res.body) return null;
  if (Number(res.headers.get("content-length") ?? 0) > MAX_DOWNLOAD) return null;
  let seen = 0;
  const body = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);
  body.on("data", (c: Buffer) => {
    seen += c.length;
    if (seen > MAX_DOWNLOAD) body.destroy(new Error("repository too large"));
  });
  try {
    return new RepoIndex(await untar(body.pipe(createGunzip()), wanted));
  } catch {
    return null;
  }
}

/** Indexes a local folder (development, LocalSource). */
export async function indexFromFolder(root: string): Promise<RepoIndex> {
  const files = new Map<string, string>();
  let total = 0;
  const base = resolve(root);
  const walk = async (dir: string): Promise<void> => {
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (files.size >= MAX_FILES || total >= MAX_TOTAL) return;
      const full = join(dir, e.name);
      const rel = relative(base, full).split(sep).join("/");
      if (e.isDirectory()) {
        if (!SKIP_DIR.test(`${rel}/`) && !e.name.startsWith(".")) await walk(full);
      } else if (e.isFile()) {
        const size = (await stat(full)).size;
        if (!wanted(rel, size)) continue;
        files.set(rel, await readFile(full, "utf8"));
        total += size;
      }
    }
  };
  await walk(base);
  return new RepoIndex(files);
}

/** A few recent snapshots, so a burst of errors from one app downloads its code once. */
const cache = new Map<string, { at: number; index: Promise<RepoIndex | null> }>();
export function cachedIndex(key: string, load: () => Promise<RepoIndex | null>): Promise<RepoIndex | null> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < 10 * 60_000) return hit.index;
  const index = load().catch(() => null);
  cache.set(key, { at: now, index });
  while (cache.size > 3) cache.delete(cache.keys().next().value!);
  return index;
}
