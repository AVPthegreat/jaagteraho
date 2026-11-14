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
export const SECONDARY = /(^|\/)(tests?|testing|docs?|examples?|benchmarks?|scripts)(\/|$)|(^|\/)(test_[^/]*|[^/]*_test)\.py$|\.(test|spec)\.\w+$/;

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

  private defs: Map<string, Array<{ path: string; line: number; owner: string | null }>> | null = null;

  /**
   * Builds the name -> definitions table in one pass over the code, yielding to the event loop between
   * files so a large repository never blocks other requests. Lookups and the map then cost a Map read.
   */
  async buildDefinitions(): Promise<void> {
    if (this.defs) return;
    const defs = new Map<string, Array<{ path: string; line: number; owner: string | null }>>();
    let n = 0;
    for (const [path, text] of this.files) {
      indexFile(defs, path, text);
      if (++n % 50 === 0) await new Promise((r) => setImmediate(r));
    }
    this.defs = defs;
  }

  private table() {
    if (!this.defs) {
      const defs = new Map<string, Array<{ path: string; line: number; owner: string | null }>>();
      for (const [path, text] of this.files) indexFile(defs, path, text);
      this.defs = defs;
    }
    return this.defs;
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
    const hits = (this.table().get(target) ?? []).map((d) => ({
      path: d.path,
      line: d.line,
      rank: (owner && d.owner !== owner ? 2 : 0) + (SECONDARY.test(d.path) ? 4 : 0) + (d.path.endsWith(".pyi") ? 1 : 0),
    }));
    return hits.sort((a, b) => a.rank - b.rank || a.path.length - b.path.length).slice(0, limit).map(({ path, line }) => ({ path, line }));
  }

  /** Lines containing `needle` literally, app code first. Yields to the event loop while it scans. */
  async search(needle: string, limit = 15): Promise<Array<{ path: string; line: number; text: string }>> {
    if (needle.trim().length < 3) return [];
    const hits: Array<{ path: string; line: number; text: string; secondary: boolean }> = [];
    let n = 0;
    for (const [path, text] of this.files) {
      if (++n % 200 === 0) await new Promise((r) => setImmediate(r));
      if (!text.includes(needle)) continue;
      text.split("\n").forEach((l, i) => {
        if (l.includes(needle) && hits.length < 500) hits.push({ path, line: i + 1, text: l.trim().slice(0, 200), secondary: SECONDARY.test(path) });
      });
    }
    return hits.sort((a, b) => Number(a.secondary) - Number(b.secondary)).slice(0, limit).map(({ path, line, text }) => ({ path, line, text }));
  }

  /**
   * Where a variable or attribute gets its value: statements that assign it (x = ..., self.x = ..., a, x = ...,
   * x += ...), class-level declarations (x: int), loop targets and setattr(obj, "x", ...). App code first.
   */
  async writers(name: string, limit = 15, attribute = false): Promise<Array<{ path: string; line: number; text: string }>> {
    const n = name.split(".").pop() ?? "";
    if (!/^\w{2,60}$/.test(n)) return [];
    // An attribute is set through an object (x.name = ...), declared in a class body (name: T) or setattr.
    const re = attribute ? new RegExp(`${writerPattern(`(?:[\\w\\])]+\\.)+${n}`).source}|^\\s+${n}\\s*:\\s*[\\w\\[\\]. |'"]+\\s*(=.*)?$|setattr\\([^,]+,\\s*["']${n}["']`) : writerPattern(n);
    const hits: Array<{ path: string; line: number; text: string; secondary: boolean }> = [];
    let k = 0;
    for (const [path, text] of this.files) {
      if (++k % 200 === 0) await new Promise((r) => setImmediate(r));
      if (!text.includes(n)) continue;
      text.split("\n").forEach((l, i) => {
        if (l.length < 400 && hits.length < 500 && re.test(l) && !/,\s*(#.*)?$/.test(l)) hits.push({ path, line: i + 1, text: l.trim().slice(0, 200), secondary: SECONDARY.test(path) });
      });
    }
    return hits.sort((a, b) => Number(a.secondary) - Number(b.secondary)).slice(0, limit).map(({ path, line, text }) => ({ path, line, text }));
  }
}

/** A line that gives `name` (a plain name or an attribute) a value or declares it. */
export function writerPattern(name: string, throughObject = true): RegExp {
  const target = throughObject ? `(?:[\\w\\]\\)]+\\.)*${name}` : name;
  const other = `(?:\\*?[\\w.\\[\\]'"]+)`;
  return new RegExp(
    [
      // x = ..., self.x = ..., a, x = ..., x: T = ..., x += ...
      `^\\s*(?:${other}\\s*,\\s*)*\\(?${target}\\)?\\s*(?:,\\s*${other}\\s*)*(?::\\s*[^=]+)?(?:[-+*/|&%^]|//|<<|>>)?=(?!=)`,
      // const x = ..., let x = ...
      `^\\s*(?:export\\s+)?(?:const|let|var)\\s+${name}\\b`,
      // for x in ..., for a, x in ...
      `^\\s*(?:async\\s+)?for\\s+(?:${other}\\s*,\\s*)*${name}\\s*(?:,\\s*${other}\\s*)*\\s+in\\b`,
      // class-level declaration without a value: x: int
      `^\\s+${name}\\s*:\\s*[\\w\\[\\]. |'"]+\\s*$`,
      // setattr(obj, "x", ...), with ... as x
      `setattr\\([^,]+,\\s*["']${name}["']`,
      `\\bas\\s+${name}\\s*[:,)]`,
    ].join("|"),
  );
}

const DEF = /^(\s*)(?:async\s+)?(?:def|class|function)\s+(\w+)|^(\s*)(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=|^()(\w+)\s*=|^(\s+)(?:static\s+|async\s+|get\s+|set\s+)*(\w+)\s*\([^)]*\)\s*\{/;
const NOT_NAMES = new Set(["if", "for", "while", "switch", "catch", "return", "function"]);

/** Adds every definition in one file to `defs`, with the class it sits in (by indentation). */
function indexFile(defs: Map<string, Array<{ path: string; line: number; owner: string | null }>>, path: string, text: string) {
  const classes: Array<{ indent: number; name: string }> = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.length > 400) continue;
    const m = l.match(DEF);
    if (!m) continue;
    const indent = (m[1] ?? m[3] ?? m[5] ?? m[7] ?? "").length;
    const name = m[2] ?? m[4] ?? m[6] ?? m[8];
    if (!name || NOT_NAMES.has(name)) continue;
    while (classes.length && classes[classes.length - 1].indent >= indent) classes.pop();
    const owner = indent > 0 && classes.length ? classes[classes.length - 1].name : null;
    let list = defs.get(name);
    if (!list) defs.set(name, (list = []));
    if (list.length < 200) list.push({ path, line: i + 1, owner });
    if (/^\s*class\s/.test(l)) classes.push({ indent, name });
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

const MAX_UNPACKED = 200_000_000;
const MAX_HEADER_DATA = 65_536;
const LOAD_TIME_MS = 60_000;

/** Bytes waiting to be parsed, kept as a list of chunks (no copy per chunk). */
class ByteQueue {
  private chunks: Buffer[] = [];
  length = 0;
  push(c: Buffer) {
    if (c.length) {
      this.chunks.push(c);
      this.length += c.length;
    }
  }
  /** Removes and returns exactly n bytes (n must be <= length). */
  take(n: number): Buffer {
    const parts: Buffer[] = [];
    let need = n;
    while (need > 0) {
      const c = this.chunks[0];
      if (c.length <= need) {
        parts.push(c);
        this.chunks.shift();
        need -= c.length;
      } else {
        parts.push(c.subarray(0, need));
        this.chunks[0] = c.subarray(need);
        need = 0;
      }
    }
    this.length -= n;
    return parts.length === 1 ? parts[0] : Buffer.concat(parts, n);
  }
  /** Drops up to n bytes; returns how many were dropped. */
  skip(n: number): number {
    let left = n;
    while (left > 0 && this.chunks.length) {
      const c = this.chunks[0];
      if (c.length <= left) {
        this.chunks.shift();
        left -= c.length;
      } else {
        this.chunks[0] = c.subarray(left);
        left = 0;
      }
    }
    this.length -= n - left;
    return n - left;
  }
}

/**
 * Streaming tar reader. Keeps code files only; every other entry is skipped by counting its bytes, never
 * held in memory. Throws past `maxUnpacked` decompressed bytes or after the deadline.
 */
export async function untar(stream: AsyncIterable<Buffer>, keep: (path: string, size: number) => boolean, opts: { maxUnpacked?: number; deadline?: number } = {}): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const q = new ByteQueue();
  const maxUnpacked = opts.maxUnpacked ?? MAX_UNPACKED;
  let unpacked = 0;
  let total = 0;
  let longName: string | null = null;
  // The entry being read: its data is kept (whole, at most MAX_FILE) or skipped; then its padding is skipped.
  let entry: { path: string; size: number; keep: boolean; skipLeft: number; padLeft: number } | null = null;
  for await (const chunk of stream) {
    unpacked += chunk.length;
    if (unpacked > maxUnpacked) throw new Error("repository too large");
    if (opts.deadline && Date.now() > opts.deadline) throw new Error("repository took too long to read");
    q.push(chunk);
    for (;;) {
      if (!entry) {
        if (q.length < 512) break;
        const h = q.take(512);
        if (h.every((b) => b === 0)) continue;
        const str = (a: number, b: number) => h.subarray(a, b).toString("utf8").replace(/\0.*$/s, "");
        const size = parseInt(str(124, 136).trim() || "0", 8);
        if (!Number.isFinite(size) || size < 0) throw new Error("bad tar header");
        const type = String.fromCharCode(h[156]);
        const prefix = str(345, 500);
        let path: string = longName ?? (prefix ? `${prefix}/${str(0, 100)}` : str(0, 100));
        longName = null;
        const padLeft = Math.ceil(size / 512) * 512 - size;
        if (type === "x" || type === "L") {
          // A pax header or GNU long name: the next entry's real path (kept only if small).
          const ok = size <= MAX_HEADER_DATA;
          entry = { path: type === "L" ? "\0longname" : "\0pax", size, keep: ok, skipLeft: ok ? 0 : size, padLeft };
          continue;
        }
        // GitHub tarballs put everything under "<owner>-<repo>-<sha>/".
        path = path.split("/").slice(1).join("/");
        const isFile = type === "0" || type === "\0";
        const kept = isFile && size <= MAX_FILE && files.size < MAX_FILES && total + size <= MAX_TOTAL && keep(path, size);
        entry = { path, size, keep: kept, skipLeft: kept ? 0 : size, padLeft };
      }
      if (entry.keep) {
        if (q.length < entry.size) break;
        const data: string = q.take(entry.size).toString("utf8");
        if (entry.path === "\0longname") longName = data.replace(/\0.*$/s, "");
        else if (entry.path === "\0pax") longName = data.match(/(?:^|\n)\d+ path=([^\n]*)\n/)?.[1] ?? null;
        else {
          files.set(entry.path, data);
          total += entry.size;
        }
        entry.keep = false;
      }
      if (entry.skipLeft > 0) {
        entry.skipLeft -= q.skip(entry.skipLeft);
        if (entry.skipLeft > 0) break;
      }
      if (entry.padLeft > 0) {
        entry.padLeft -= q.skip(entry.padLeft);
        if (entry.padLeft > 0) break;
      }
      entry = null;
    }
  }
  return files;
}

const wanted = (path: string, size: number) => CODE.test(path) && !SKIP_DIR.test(path) && size <= MAX_FILE;

/**
 * Downloads `https://...tar.gz` and indexes its code files. One time limit covers the download, the
 * decompression and the parsing; compressed and decompressed sizes are both capped.
 */
export async function indexFromTarball(url: string, headers: Record<string, string> = {}, opts: { timeoutMs?: number; maxDownload?: number; maxUnpacked?: number } = {}): Promise<RepoIndex | null> {
  const timeoutMs = opts.timeoutMs ?? LOAD_TIME_MS;
  const maxDownload = opts.maxDownload ?? MAX_DOWNLOAD;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("repository took too long to read")), timeoutMs);
  const deadline = Date.now() + timeoutMs;
  let body: Readable | null = null;
  let gunzip: ReturnType<typeof createGunzip> | null = null;
  try {
    const res = await fetch(url, { headers: { "user-agent": "jaagteraho-watcher", ...headers }, signal: ctrl.signal });
    if (!res.ok || !res.body) return null;
    if (Number(res.headers.get("content-length") ?? 0) > maxDownload) return null;
    let seen = 0;
    body = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);
    gunzip = createGunzip();
    const g = gunzip;
    body.on("data", (c: Buffer) => {
      seen += c.length;
      if (seen > maxDownload) g.destroy(new Error("repository too large"));
    });
    body.on("error", (e) => g.destroy(e));
    ctrl.signal.addEventListener("abort", () => g.destroy(new Error("repository took too long to read")));
    const files = await untar(body.pipe(g), wanted, { maxUnpacked: opts.maxUnpacked, deadline });
    const index = new RepoIndex(files);
    await index.buildDefinitions();
    if (Date.now() > deadline) return null;
    return index;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    body?.destroy();
    gunzip?.destroy();
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
  const index = new RepoIndex(files);
  await index.buildDefinitions();
  return index;
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
