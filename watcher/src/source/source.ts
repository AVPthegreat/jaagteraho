// Reads an app's source files, either from a local folder (development) or GitHub (read-only).

import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

export interface SourceProvider {
  name: string;
  getFile(path: string, ref?: string | null): Promise<string | null>;
}

const cleanPath = (p: string) => {
  const parts = p.replace(/\\/g, "/").split("/").filter((x) => x && x !== ".");
  if (parts.some((x) => x === "..")) return null;
  return parts.join("/");
};

export class LocalSource implements SourceProvider {
  name = "local";
  constructor(private root: string) {}
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

/** A fixed token, or a function that mints one (GitHub App installation tokens). */
export type GitHubToken = string | undefined | (() => Promise<string | undefined>);

export class GitHubSource implements SourceProvider {
  name = "github";
  constructor(private repo: string, private tokenSource?: GitHubToken) {}
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
