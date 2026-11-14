// Reads an app's source files, either from a local folder (development) or GitHub (read-only).

import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { cachedIndex, indexFromFolder, indexFromTarball, type RepoIndex } from "./repo.js";

export interface SourceProvider {
  name: string;
  getFile(path: string, ref?: string | null): Promise<string | null>;
  /** The whole repository's code at `ref`, for lookups beyond the stack trace. Null if unavailable. */
  index?(ref?: string | null): Promise<RepoIndex | null>;
}

const cleanPath = (p: string) => {
  const parts = p.replace(/\\/g, "/").split("/").filter((x) => x && x !== ".");
  if (parts.some((x) => x === "..")) return null;
  return parts.join("/");
};

export class LocalSource implements SourceProvider {
  name = "local";
  constructor(private root: string) {}
  index(): Promise<RepoIndex | null> {
    return cachedIndex(`local:${resolve(this.root)}`, () => indexFromFolder(this.root));
  }
  async getFile(path: string): Promise<string | null> {
    const rel = cleanPath(path);
    if (!rel) return null;
    const full = resolve(this.root, rel);
    if (!full.startsWith(resolve(this.root) + sep)) return null;
    try {
      return await readFile(full, "utf8");
    } catch {
      return null;
    }
  }
}

/** A branch, tag or commit name safe to put in a URL: no "..", no "//", no leading or trailing "/" or ".". */
export function safeRef(ref: string): boolean {
  return /^[A-Za-z0-9_][\w.\/-]{0,99}$/.test(ref) && !ref.includes("..") && !ref.includes("//") && !/[./]$/.test(ref) && !ref.endsWith(".lock");
}

/** A fixed token, or a function that mints one (GitHub App installation tokens). */
export type GitHubToken = string | undefined | (() => Promise<string | undefined>);

export class GitHubSource implements SourceProvider {
  name = "github";
  /** cacheScope: who the token belongs to (e.g. "project:12"), so cached private code stays with its owner. */
  constructor(private repo: string, private tokenSource?: GitHubToken, private cacheScope?: string) {}
  index(ref?: string | null): Promise<RepoIndex | null> {
    const at = ref && safeRef(ref) ? ref : "";
    // A copy read with a token belongs to whoever owns that token: the cache key carries its scope, so a
    // private repository is never served to another app or to the public paste page.
    const scope = this.tokenSource ? (this.cacheScope ?? "token") : "public";
    return cachedIndex(`github:${scope}:${this.repo}@${at}`, async () => {
      const token = typeof this.tokenSource === "function" ? await this.tokenSource() : this.tokenSource;
      const headers: Record<string, string> = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(token ? { authorization: `Bearer ${token}` } : {}) };
      const url = (r: string) => `https://api.github.com/repos/${this.repo}/tarball${r ? `/${r.split("/").map(encodeURIComponent).join("/")}` : ""}`;
      // A release name that is not a ref falls back to the default branch, as getFile does.
      return (await indexFromTarball(url(at), headers)) ?? (at ? indexFromTarball(url(""), headers) : null);
    });
  }
  async getFile(path: string, ref?: string | null): Promise<string | null> {
    const rel = cleanPath(path);
    if (!rel) return null;
    const token = typeof this.tokenSource === "function" ? await this.tokenSource() : this.tokenSource;
    const url = `https://api.github.com/repos/${this.repo}/contents/${rel.split("/").map(encodeURIComponent).join("/")}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`;
    const res = await fetch(url, {
      headers: {
        accept: "application/vnd.github.raw+json",
        "user-agent": "jaagteraho-watcher",
        "x-github-api-version": "2022-11-28",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404 && ref) return this.getFile(path, null);
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > 400_000 ? null : text;
  }
}

/** Maps a path from a stack trace (as deployed) to a path in the repository by trying shorter suffixes. */
export async function locate(src: SourceProvider, absPath: string, prefix?: string, ref?: string | null): Promise<{ path: string; text: string } | null> {
  let p = absPath.replace(/\\/g, "/");
  if (prefix && p.startsWith(prefix)) p = p.slice(prefix.length);
  const parts = p.split("/").filter(Boolean);
  for (let i = Math.max(0, parts.length - 6); i < parts.length; i++) {
    const candidate = parts.slice(i).join("/");
    const text = await src.getFile(candidate, ref);
    if (text !== null) return { path: candidate, text };
  }
  return null;
}
