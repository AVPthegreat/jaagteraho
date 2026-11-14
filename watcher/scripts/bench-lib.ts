// Pure helpers for the bench runner (scripts/bench.ts), kept apart so they can be tested without model calls.
import { resolve } from "node:path";
import { riskyAdditions } from "../src/pipeline/gate.js";
import { DEFAULT_POLICY, editShape, healBlocker } from "../src/pipeline/heal.js";

export type BenchArgs = {
  only: string | null;
  validateOnly: boolean;
  casesFile: string | null;
  appsDir: string | null; // where the case file's apps live (default: bench/apps)
  stopAt: number; // stop spending after this many dollars
  out: string | null; // results path prefix: <out>.md and <out>.json (default: bench/RESULTS[-tag])
};

export function parseBenchArgs(args: string[], cwd = process.cwd()): BenchArgs {
  const val = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] ?? null : null);
  const stop = val("--stop-at");
  const stopAt = stop === null ? 1.5 : Number(stop);
  if (!Number.isFinite(stopAt) || stopAt <= 0) throw new Error(`--stop-at needs a positive dollar amount, got ${stop}`);
  const path = (v: string | null) => (v === null ? null : resolve(cwd, v));
  return {
    only: val("--only"),
    validateOnly: args.includes("--validate"),
    casesFile: path(val("--cases")),
    appsDir: path(val("--apps")),
    stopAt,
    out: path(val("--out")),
  };
}

type Edit = { file: string; find: string; replace: string };

/**
 * Would this fix have applied itself under the default heal policy, with no person? A WAKE that nobody answers heals
 * after a wait (auto-after); a NOTIFY is a small bug (auto-minor). Same rules as the live healer (healBlocker), for a
 * fresh, authenticated, open incident with no earlier heals tonight.
 */
export function autoHealVerdict(
  decision: string,
  gate: { passed?: boolean; level?: string; review?: { unanimous?: boolean } | null; risky?: string[] },
  edits: Edit[],
  route: string | null,
  proof: string | null,
): { heal: boolean; blocker: string | null } {
  if (decision !== "wake" && decision !== "notify") return { heal: false, blocker: `decision was ${decision}` };
  const blocker = healBlocker({
    policy: DEFAULT_POLICY,
    trigger: decision === "wake" ? "auto-after" : "auto-minor",
    kind: "faurus",
    route,
    incident_status: "open",
    owner_paused: false,
    fix_status: gate.passed ? "shown" : "rejected",
    gate: { ...gate, test_run: proof && proof !== "skipped" ? { verdict: proof } : null },
    files: edits.map((e) => e.file),
    risky: [...new Set([...riskyAdditions(edits), ...(gate.risky ?? [])])],
    authenticated: true,
    ...editShape(edits),
    heals_last_night: 0,
    minor_heals_last_night: 0,
    now: Date.now(),
  });
  return { heal: blocker === null, blocker };
}
