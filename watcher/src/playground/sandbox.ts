// The playground's live apps: the list, their file trees, and readable copies with a planted bench bug
// (for the diagnosis to READ). Nothing here runs app code: crashes, hidden tests and proofs run in the
// isolated runner (runner/exec.ts via runner/client.ts).

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";

export type Edit = { file: string; find: string; replace: string };
export type BenchCase = {
  id: string;
  app: string;
  route: string | null;
  kind: "bug" | "noise";
  difficulty?: "in_trace" | "root_elsewhere";
  story: string;
  inject?: Edit[];
  clean_inject?: Edit[];
  trigger?: string;
  test?: string;
  /** "benchmark": a published JR-Bench case (bench/cases.json); "playground": an extra case (bench/playground-cases.json). */
  source?: "benchmark" | "playground";
};
export type BenchApp = { critical: Array<{ name: string; match: string }>; exam_open?: boolean; language?: "node" };
export type Bench = { apps: Record<string, BenchApp>; cases: BenchCase[] };

export type AppInfo = { name: string; title: string; tagline: string; description: string; stack: string; files: number; tree: string[]; bugs: number; critical: string[] };

/** How the playground presents each live app: apps we built and run for the playground, named like small startups. */
export const APP_LOOK: Record<string, { title: string; tagline: string }> = {
  campuskart: { title: "CampusKart", tagline: "Buy and sell anything on campus" },
  clinicq: { title: "ClinicQ", tagline: "Queues, prescriptions and bills for small clinics" },
  examhall: { title: "ExamHall", tagline: "Online exams and code submissions for colleges" },
  fleetwise: { title: "Fleetwise", tagline: "Bus routes, trips and fuel for college fleets" },
  ledgerly: { title: "Ledgerly", tagline: "Invoices, payments and GST for small shops" },
  messmenu: { title: "MessMenu", tagline: "Hostel meals, bookings and monthly bills" },
  tiffinbox: { title: "TiffinBox", tagline: "Tiffin orders, kitchens and delivery riders" },
};

export const benchDir = (env: NodeJS.ProcessEnv = process.env) => resolve(env.JR_BENCH_DIR ?? new URL("../../../bench", import.meta.url).pathname);

/** The published bench cases plus the playground's extra cases (if that file exists). */
export function loadBench(dir = benchDir()): Bench {
  const bench = JSON.parse(readFileSync(join(dir, "cases.json"), "utf8")) as Bench;
  const cases: BenchCase[] = bench.cases.map((c) => ({ ...c, source: "benchmark" }));
  const extra = join(dir, "playground-cases.json");
  if (existsSync(extra)) {
    const more = (JSON.parse(readFileSync(extra, "utf8")) as { cases: BenchCase[] }).cases;
    for (const c of more) if (c.kind === "bug" && Object.hasOwn(bench.apps, c.app)) cases.push({ ...c, source: "playground" });
  }
  return { apps: bench.apps, cases };
}

const CODE = /\.(py|js)$/;
function walk(root: string, at = root, out: string[] = []): string[] {
  for (const name of readdirSync(at).sort()) {
    if (name.startsWith(".") || name === "__pycache__" || name === "node_modules") continue;
    const p = join(at, name);
    if (statSync(p).isDirectory()) walk(root, p, out);
    else if (CODE.test(name)) out.push(relative(root, p));
  }
  return out;
}

/** The apps a visitor can pick: name, a line from its README, its stack and its file tree (from disk, never typed in). */
export function describeApps(bench: Bench, dir = benchDir()): AppInfo[] {
  return Object.keys(bench.apps)
    .sort()
    .filter((name) => existsSync(join(dir, "apps", name)))
    .map((name) => {
      const root = join(dir, "apps", name);
      const readme = existsSync(join(root, "README.md")) ? readFileSync(join(root, "README.md"), "utf8") : "";
      const line = readme.split("\n").find((l) => l.trim() && !l.startsWith("#")) ?? "";
      const description = line.replace(/\s*Part of JR-Bench.*$/, "").trim();
      const tree = walk(root);
      const node = bench.apps[name].language === "node" || existsSync(join(root, "package.json"));
      return {
        name,
        title: APP_LOOK[name]?.title ?? name,
        tagline: APP_LOOK[name]?.tagline ?? description,
        description,
        stack: node ? "Node.js" : "Python",
        files: tree.length,
        tree,
        bugs: bench.cases.filter((c) => c.app === name && c.kind === "bug").length,
        critical: bench.apps[name].critical.map((c) => c.name),
      };
    });
}

/** A fresh temporary copy of a sample app with the given edits planted (each "find" must occur exactly once). */
export async function copyApp(dir: string, app: string, edits: Edit[] = []): Promise<string> {
  const to = await mkdtemp(join(tmpdir(), `jrplay-${app}-`));
  await cp(join(dir, "apps", app), to, { recursive: true });
  for (const e of edits) {
    const path = resolve(to, e.file);
    if (!path.startsWith(to + sep)) throw new Error(`edit outside the app: ${e.file}`);
    const text = await readFile(path, "utf8");
    if (text.split(e.find).length - 1 !== 1) throw new Error(`${app}/${e.file}: find text must occur once`);
    await writeFile(path, text.replace(e.find, e.replace));
  }
  return to;
}

export const removeDir = (d: string) => rm(d, { recursive: true, force: true });
export const isNodeApp = (dir: string) => existsSync(join(dir, "package.json"));

/** The error report as the app prints it: a Python traceback, or a Node.js error and its stack. */
export function crashReport(dir: string, stderr: string): string {
  if (!isNodeApp(dir)) {
    const at = stderr.lastIndexOf("Traceback (most recent call last):");
    return at >= 0 ? stderr.slice(at).trim() : "";
  }
  const lines = stderr.split("\n");
  const head = lines.findIndex((l) => /^(?:[A-Z]\w*)?(?:Error|Exception)\b/.test(l));
  return head >= 0 ? lines.slice(head).filter((l) => !/^Node\.js v/.test(l)).join("\n").trim() : "";
}
