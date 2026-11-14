// Turns a full playground-e2e run into the hint list "Surprise me" prefers: the bugs whose fix could be
// applied in the visitor's copy AND passed our hidden test.
// Usage: npx tsx scripts/playground-hints.ts <playground-e2e.json> [../bench/playground-hints.json]

import { readFileSync, writeFileSync } from "node:fs";

const [src, out = new URL("../../bench/playground-hints.json", import.meta.url).pathname] = process.argv.slice(2);
if (!src) throw new Error("Give the playground-e2e.json to read.");
const run = JSON.parse(readFileSync(src, "utf8")) as { at?: string; rows: Array<{ case_id: string; appliable_in_copy: boolean | null; hidden_test: string | null }> };
const good = run.rows.filter((r) => r.appliable_in_copy === true && r.hidden_test === "passed").map((r) => r.case_id).sort();
writeFileSync(out, `${JSON.stringify({ about: "Bugs whose fix was applied and passed our hidden test in a full playground-e2e run; Surprise me picks from these first.", from_run: run.at ?? null, good }, null, 2)}\n`);
console.log(`${good.length} of ${run.rows.length} bugs written to ${out}`);
