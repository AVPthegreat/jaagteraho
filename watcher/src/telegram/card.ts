// Builds the alert card. The same card is edited in place as the pipeline moves.

import type { DB } from "../db/db.js";
import { severityWord, usersAffected, type Decision } from "../pipeline/decide.js";
import type { TestRun } from "../pipeline/verify.js";
import { describeChange, loadChange } from "../source/changes.js";
import { ownerLink } from "../web/owner.js";
import { esc, type Markup } from "./api.js";

const LABEL: Record<string, string> = { wake: "🔴 WAKE", notify: "🟠 NOTIFY", log: "LOG", ignore: "IGNORED" };

type DiagnosisResult = { cause_plain: string; file: string; line: number; confidence_words: string };
type GateResult = { passed: boolean; level?: "recommended" | "caution" | "withheld"; reasons: string[]; changed_lines: number };

export function renderCard(db: DB, incidentId: number): { text: string; markup: Markup } | null {
  const inc = db
    .prepare(
      `SELECT i.id, i.hits, i.first_seen, i.last_seen, i.transaction_name, i.exception_type, p.name AS project, p.kind
       FROM incidents i JOIN projects p ON p.id = i.project_id WHERE i.id = ?`,
    )
    .get(incidentId) as
    | { id: number; hits: number; first_seen: string; last_seen: string; transaction_name: string | null; exception_type: string; project: string; kind: string }
    | undefined;
  if (!inc) return null;
  const dRow = db.prepare("SELECT facts, votes, rule_number, rule_text, action, engine FROM decisions WHERE incident_id = ? ORDER BY id DESC LIMIT 1").get(incidentId) as
    | { facts: string; votes: string; rule_number: number; rule_text: string; action: string; engine: string }
    | undefined;
  if (!dRow) return null;
  const facts = JSON.parse(dRow.facts) as Decision["facts"];
  const votes = JSON.parse(dRow.votes) as Decision["votes"];
  const diag = db.prepare("SELECT id, result, replayed_from FROM diagnoses WHERE incident_id = ? ORDER BY id DESC LIMIT 1").get(incidentId) as
    | { id: number; result: string; replayed_from: number | null }
    | undefined;
  const fix = diag
    ? (db.prepare("SELECT id, gate_result, status, pr_url FROM fixes WHERE diagnosis_id = ? ORDER BY id DESC LIMIT 1").get(diag.id) as
        | { id: number; gate_result: string; status: string; pr_url: string | null }
        | undefined)
    : undefined;
  const alert = db.prepare("SELECT acked FROM alerts WHERE incident_id = ?").get(incidentId) as { acked: number } | undefined;

  const what = facts.critical ? `${facts.critical} failing` : `${inc.exception_type} on ${inc.transaction_name ?? "unknown route"}`;
  const minutes = Math.max(1, Math.round((Date.parse(inc.last_seen) - Date.parse(inc.first_seen)) / 60000));
  const people = inc.kind === "sandbox" ? 0 : usersAffected(db, incidentId, 60);
  const lines = [
    `<b>${LABEL[dRow.action] ?? dRow.action}</b> · ${esc(inc.project)} · ${esc(what)}`,
    `${inc.hits} ${inc.hits === 1 ? "failure" : "failures"}${inc.hits > 1 ? ` in ${minutes} min` : ""}${people > 1 ? ` · ${people} people affected in the last hour` : ""}${facts.exam_open ? " · exam window open" : ""}${facts.change === "reopened" ? " · came back after a quiet spell" : ""}`,
    `Rule ${dRow.rule_number}: ${esc(dRow.rule_text)}`,
  ];
  if (votes.severity) {
    const s = votes.severity;
    const b = votes.user_blocked;
    lines.push(`Claude: severity ${s.value} ${severityWord(s.value)} (${s.count}/${s.of})${b ? `, user blocked ${b.value} (${b.count}/${b.of})` : ""} · uncalibrated`);
  } else if (dRow.engine === "rules-only") {
    lines.push("Decided by rules alone.");
  }

  const change = loadChange(db, incidentId);
  if (change) lines.push(`<b>Last change:</b> ${esc(describeChange(change))}`);

  const buttons: Markup["inline_keyboard"] = [];
  if (diag) {
    const r = JSON.parse(diag.result) as DiagnosisResult;
    lines.push("", `<b>Cause:</b> ${esc(r.cause_plain)}`, `<code>${esc(r.file)}:${r.line}</code> · ${esc(r.confidence_words)}${diag.replayed_from ? " · replayed" : ""}`);
    if (fix) {
      const g = JSON.parse(fix.gate_result) as GateResult;
      if (fix.status === "rejected") lines.push(`<b>Fix:</b> withheld (${esc(g.reasons.join("; "))})`);
      else if (fix.status === "merged") lines.push(`<b>Fix:</b> approved and merged ✅`);
      else if (fix.status === "approved") lines.push(`<b>Fix:</b> approved by you${fix.pr_url ? ` · <a href="${esc(fix.pr_url)}">pull request</a>` : ""}`);
      else if (g.level === "caution") lines.push(`<b>Fix:</b> ${g.changed_lines} lines · use with care: ${esc(g.reasons.join("; "))} · AI-written`);
      else lines.push(`<b>Fix:</b> ${g.changed_lines} lines · all checks passed · AI-written`);
      const t = (g as GateResult & { test_run?: TestRun | null }).test_run;
      if (fix.status !== "rejected" && t && t.verdict !== "skipped") lines.push(t.verdict === "proved" ? "<b>Proof:</b> its test fails on the current code and passes with the fix ✅" : `<b>Proof:</b> ${esc(t.note)}`);
    } else {
      lines.push("<b>Fix:</b> <i>checking…</i>");
    }
  } else if (dRow.action === "notify" || dRow.action === "wake") {
    lines.push("", "<b>Cause:</b> <i>working on it…</i>");
  }
  if (alert?.acked) lines.push("", "✔️ Acknowledged");

  const row1 = [{ text: "Why?", callback_data: `w:${incidentId}` }];
  if (fix && fix.status !== "rejected") row1.push({ text: "Show fix", callback_data: `f:${fix.id}` });
  buttons.push(row1);
  const row2 = [];
  const approvable = fix && fix.status === "shown" && inc.kind === "sandbox" && (JSON.parse(fix.gate_result) as GateResult).level !== "caution";
  if (fix && approvable) row2.push({ text: "Approve fix", callback_data: `p:${fix.id}` });
  if (!alert?.acked && (dRow.action === "wake" || dRow.action === "notify")) row2.push({ text: "Acknowledge", callback_data: `a:${incidentId}` });
  if (row2.length) buttons.push(row2);
  if (diag) buttons.push([{ text: "Diagnosis right", callback_data: `r:${diag.id}` }, { text: "Diagnosis wrong", callback_data: `x:${diag.id}` }]);
  // Telegram accepts only public https links on buttons; locally the page is reachable from "Why?" instead.
  const link = ownerLink(incidentId);
  if (link?.startsWith("https://")) buttons.push([{ text: "Open logbook", url: link }]);

  return { text: lines.join("\n"), markup: { inline_keyboard: buttons } };
}

export function renderWhy(db: DB, incidentId: number): string {
  const d = db.prepare("SELECT facts, votes, rule_number, rule_text, action, engine FROM decisions WHERE incident_id = ? ORDER BY id DESC LIMIT 1").get(incidentId) as
    | { facts: string; votes: string; rule_number: number; rule_text: string; action: string; engine: string }
    | undefined;
  if (!d) return "No decision recorded yet.";
  const f = JSON.parse(d.facts) as Decision["facts"];
  const v = JSON.parse(d.votes) as Decision["votes"];
  const vote = (k: keyof Decision["votes"]) => (v[k] ? `${v[k]!.value} (${v[k]!.count}/${v[k]!.of})` : "not asked");
  return [
    `<b>Why ${esc(d.action.toUpperCase())}</b> · rule ${d.rule_number}: ${esc(d.rule_text)}`,
    "",
    "<b>Facts code knew</b>",
    `Critical flow: ${f.critical ? esc(f.critical) : "no"}`,
    `Exam window open: ${f.exam_open ? "yes" : "no"}`,
    `You were away: ${f.owner_away ? "yes" : "no"}`,
    `Failures in the last 10 min: ${f.hits_10m}`,
    ...(f.users_1h ? [`Different people affected in the last hour: ${f.users_1h}`] : []),
    `Incident: ${f.change}`,
    "",
    `<b>Claude's answers</b> (${d.engine === "claude" ? "5 votes each, uncalibrated" : "not used"})`,
    `Noise: ${vote("is_noise")}`,
    `Severity: ${vote("severity")}`,
    `User blocked: ${vote("user_blocked")}`,
    `Category: ${vote("category")}`,
    `Suggested: ${vote("suggested_action")}`,
    "",
    "Rules 2 to 4 cannot be lowered by any model answer.",
    ...(ownerLink(incidentId) ? ["", `<a href="${ownerLink(incidentId)}">Open the full logbook entry</a> (link valid 30 min)`] : []),
  ].join("\n");
}
