// Runs diagnosis + fix gate several times on each stored sandbox incident and reports how stable
// the results are. Spends real money (about a cent per diagnosis). Usage: npx tsx scripts/eval-gate.ts [runs]

import { makeAI } from "../src/ai/claude.js";
import { openDb } from "../src/db/db.js";
import type { CleanFrame } from "../src/intake/allowlist.js";
import { gatherFiles, runDiagnosis } from "../src/pipeline/diagnose.js";
import { runGate } from "../src/pipeline/gate.js";
import { sourceFor } from "../src/pipeline/worker.js";

process.loadEnvFile(new URL("../.env", import.meta.url));
const runs = Number(process.argv[2] ?? 3);
const db = openDb(`${process.env.JR_DATA_DIR ?? new URL("../data/", import.meta.url).pathname}/jaagteraho.db`);
const ai = makeAI(db);
if (!ai) throw new Error("no AI key");

type Row = { incident_id: number; project_id: number; transaction_name: string; exception_type: string; message_masked: string; frames: string; release: string | null };
const rows = db
  .prepare(
    `SELECT e.incident_id, e.project_id, e.transaction_name, e.exception_type, e.message_masked, e.frames, e.release
     FROM events e JOIN projects p ON p.id = e.project_id WHERE p.kind = 'sandbox'
     AND e.id IN (SELECT MAX(id) FROM events GROUP BY incident_id)`,
  )
  .all() as Row[];

const spentBefore = ai.guard.total();
for (const r of rows) {
  const project = db.prepare("SELECT id, name, kind, repo, created_at FROM projects WHERE id = ?").get(r.project_id) as Parameters<typeof sourceFor>[0];
  const src = sourceFor(project)!;
  const frames = JSON.parse(r.frames) as CleanFrame[];
  const { files } = await gatherFiles(db, src, r.project_id, frames, r.release);
  const outcomes: string[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = Date.now();
    const d = await runDiagnosis(ai, { exception_type: r.exception_type, message: r.message_masked, transaction: r.transaction_name, frames }, files, false);
    if ("error" in d) { outcomes.push(`error: ${d.error}`); continue; }
    const g = await runGate(ai, d.result, files);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    outcomes.push(`${g.passed ? "SHOWN" : "withheld"} in ${secs}s, ${d.result.file}:${d.result.line} ${d.result.confidence_words}${g.passed ? "" : ` | ${g.reasons.join("; ")}`}${g.review ? ` | review q${g.review.fix_quality} s:${g.review.touches_sensitive} b:${g.review.could_break}` : ""}`);
  }
  console.log(`\n${r.transaction_name} (${r.exception_type})`);
  outcomes.forEach((o, i) => console.log(`  run ${i + 1}: ${o}`));
}
console.log(`\nspent $${(ai.guard.total() - spentBefore).toFixed(4)}`);
