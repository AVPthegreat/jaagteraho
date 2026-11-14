// Prints the code-picked <map> for eval cases without calling Claude (for checking what the model is shown).
// Usage: tsx scripts/map-preview.ts [--split design] [--cases file.json]
import { readFileSync } from "node:fs";
import { repoMap, traceFiles } from "../src/pipeline/diagnose.js";
import { cachedIndex, indexFromTarball } from "../src/source/repo.js";
import type { SourceProvider } from "../src/source/source.js";
import { parseTraceback } from "../src/web/paste.js";

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const split = opt("split") ? (JSON.parse(readFileSync(new URL("../eval/split.json", import.meta.url), "utf8")) as Record<string, string[]>)[opt("split")!] : null;
const cases = (JSON.parse(readFileSync(new URL(`../eval/${opt("cases") ?? "real-bugs.json"}`, import.meta.url), "utf8")) as Array<{ repo: string; issue_url: string; traceback: string; buggy_commit: string }>)
  .filter((c) => !split || split.includes(c.issue_url));
for (const c of cases) {
  const index = await cachedIndex(`${c.repo}@${c.buggy_commit}`, () => indexFromTarball(`https://codeload.github.com/${c.repo}/tar.gz/${c.buggy_commit}`));
  if (!index) continue;
  const parsed = parseTraceback(c.traceback)!;
  const pkgs = index.packages();
  const frames = parsed.frames.map((f) => ({ ...f, in_app: [...pkgs].some((p) => (f.abs_path ?? "").replace(/\\/g, "/").includes(`/${p}/`) || (f.abs_path ?? "").startsWith(`${p}/`)) }));
  const src: SourceProvider = { name: "index", getFile: async (p: string) => index.files.get(index.resolve(p) ?? "") ?? null };
  const { files } = await traceFiles(src, frames);
  for (const f of files) f.path = index.resolve(f.path) ?? f.path;
  console.log(`=== ${c.issue_url}\n${await repoMap(index, files, parsed.message)}\n`);
}
