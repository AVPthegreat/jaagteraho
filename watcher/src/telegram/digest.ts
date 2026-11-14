// "While you slept": a summary of what the watchman saw, decided and proposed since a time.

import type { DB } from "../db/db.js";
import { esc } from "./api.js";

const ACTION_WORD: Record<string, string> = { wake: "woke you", notify: "notified you", log: "logged quietly", ignore: "ignored as noise" };

export function buildDigest(db: DB, projectIds: number[], sinceIso: string, title = "While you slept"): string | null {
  if (projectIds.length === 0) return null;
  const inList = projectIds.map(() => "?").join(",");
  const events = (db.prepare(`SELECT COUNT(*) AS n FROM events WHERE project_id IN (${inList}) AND received_at > ?`).get(...projectIds, sinceIso) as { n: number }).n;
  const decisions = db
    .prepare(
      `SELECT d.action, COUNT(*) AS n FROM decisions d JOIN incidents i ON i.id = d.incident_id
       WHERE i.project_id IN (${inList}) AND d.created_at > ? GROUP BY d.action`,
    )
    .all(...projectIds, sinceIso) as Array<{ action: string; n: number }>;
  if (events === 0 && decisions.length === 0) return null;

  const top = db
    .prepare(
      `SELECT i.id, i.exception_type, i.transaction_name, p.name AS project, COUNT(e.id) AS n,
              (SELECT action FROM decisions WHERE incident_id = i.id ORDER BY id DESC LIMIT 1) AS action
       FROM events e JOIN incidents i ON i.id = e.incident_id JOIN projects p ON p.id = i.project_id
       WHERE e.project_id IN (${inList}) AND e.received_at > ? GROUP BY i.id ORDER BY n DESC LIMIT 3`,
    )
    .all(...projectIds, sinceIso) as Array<{ id: number; exception_type: string; transaction_name: string | null; project: string; n: number; action: string | null }>;
  const fixes = db
    .prepare(
      `SELECT f.status, COUNT(*) AS n FROM fixes f JOIN diagnoses d ON d.id = f.diagnosis_id JOIN incidents i ON i.id = d.incident_id
       WHERE i.project_id IN (${inList}) AND d.replayed_from IS NULL AND f.created_at > ? GROUP BY f.status`,
    )
    .all(...projectIds, sinceIso) as Array<{ status: string; n: number }>;
  // Only this owner's diagnoses: the spend table covers every project, which other owners must not see.
  const spend = (
    db
      .prepare(
        `SELECT COALESCE(SUM(d.cost_usd), 0) AS t FROM diagnoses d JOIN incidents i ON i.id = d.incident_id
         WHERE i.project_id IN (${inList}) AND d.replayed_from IS NULL AND d.created_at > ?`,
      )
      .get(...projectIds, sinceIso) as { t: number }
  ).t;

  const lines = [`<b>${esc(title)}</b>`, `${events} ${events === 1 ? "error" : "errors"} reported.`];
  if (decisions.length) lines.push(decisions.map((d) => `${d.n} ${ACTION_WORD[d.action] ?? d.action}`).join(" · "));
  if (top.length) {
    lines.push("", "<b>Most frequent</b>");
    for (const t of top) lines.push(`• ${esc(t.project)}: ${esc(t.exception_type)} on ${esc(t.transaction_name ?? "?")} ×${t.n}${t.action ? ` (${ACTION_WORD[t.action] ?? t.action})` : ""}`);
  }
  const shown = fixes.filter((f) => f.status !== "rejected").reduce((a, f) => a + f.n, 0);
  const withheld = fixes.find((f) => f.status === "rejected")?.n ?? 0;
  if (shown || withheld) lines.push("", `Fixes: ${shown} proposed, ${withheld} withheld by safety rules.`);
  if (spend > 0) lines.push(`Diagnosis cost: $${spend.toFixed(3)}`);
  return lines.join("\n");
}

/** Time in India as YYYY-MM-DD and hour, for the 08:00 IST digest. */
export function istNow(now = new Date()): { date: string; hour: number } {
  const ist = new Date(now.getTime() + 5.5 * 3_600_000);
  return { date: ist.toISOString().slice(0, 10), hour: ist.getUTCHours() };
}
