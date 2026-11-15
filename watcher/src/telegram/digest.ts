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

  const scans = db
    .prepare(
      `SELECT COUNT(DISTINCT e.incident_id) AS bursts, COUNT(*) AS n FROM events e JOIN incidents i ON i.id = e.incident_id
       WHERE e.project_id IN (${inList}) AND e.received_at > ? AND i.fingerprint >= 'scan:' AND i.fingerprint < 'scan;'`,
    )
    .get(...projectIds, sinceIso) as { bursts: number; n: number };

  const lines = [`<b>${esc(title)}</b>`, `${events} ${events === 1 ? "error" : "errors"} reported.`];
  if (decisions.length) lines.push(decisions.map((d) => `${d.n} ${ACTION_WORD[d.action] ?? d.action}`).join(" · "));
  if (scans.n > 0)
    lines.push(`🛡 ${scans.bursts} blocked ${scans.bursts === 1 ? "scan" : "scans"}: ${scans.n.toLocaleString("en-US")} hostile requests, all refused by the app. No action needed.`);
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

const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * The one quiet message for a finished burst of blocked hostile traffic (intake/scan.ts), or null when the
 * incident is not a scan. Counts come from the stored events: paths and exception types as reported,
 * sources as one-way user hashes (never an IP address).
 */
export function buildScanSummary(db: DB, incidentId: number): string | null {
  const inc = db
    .prepare("SELECT i.fingerprint, i.first_seen, i.last_seen, p.name FROM incidents i JOIN projects p ON p.id = i.project_id WHERE i.id = ?")
    .get(incidentId) as { fingerprint: string; first_seen: string; last_seen: string; name: string } | undefined;
  if (!inc || !inc.fingerprint.startsWith("scan:")) return null;
  const total = (db.prepare("SELECT COUNT(*) AS n FROM events WHERE incident_id = ?").get(incidentId) as { n: number }).n;
  if (total === 0) return null;
  const paths = db
    .prepare("SELECT COALESCE(transaction_name, '?') AS p, COUNT(*) AS n FROM events WHERE incident_id = ? GROUP BY p ORDER BY n DESC, p LIMIT 5")
    .all(incidentId) as Array<{ p: string; n: number }>;
  const nPaths = (db.prepare("SELECT COUNT(DISTINCT COALESCE(transaction_name, '?')) AS n FROM events WHERE incident_id = ?").get(incidentId) as { n: number }).n;
  const types = db
    .prepare("SELECT exception_type AS t, COUNT(*) AS n FROM events WHERE incident_id = ? GROUP BY t ORDER BY n DESC LIMIT 3")
    .all(incidentId) as Array<{ t: string; n: number }>;
  const sources = (
    db.prepare("SELECT COUNT(DISTINCT json_extract(tags, '$.jr_user')) AS n FROM events WHERE incident_id = ?").get(incidentId) as { n: number }
  ).n;
  const hostRefused = types.some((t) => /(?:^|\.)DisallowedHost$/.test(t.t)) ||
    !!db.prepare("SELECT 1 FROM events WHERE incident_id = ? AND message_masked LIKE '%Invalid HTTP\\_HOST header%' ESCAPE '\\' LIMIT 1").get(incidentId);
  const minutes = Math.max(1, Math.round((Date.parse(inc.last_seen) - Date.parse(inc.first_seen)) / 60_000));

  const lines = [
    `🛡 <b>Blocked scan on ${esc(inc.name)}</b>`,
    `${fmt(total)} hostile ${total === 1 ? "request" : "requests"} in about ${minutes} min, probing ${fmt(nPaths)} ${nPaths === 1 ? "path" : "paths"}. The app refused every one (${types.map((t) => `${esc(t.t.replace(/^.*\./, ""))} ×${fmt(t.n)}`).join(", ")}).`,
    "No user was affected. No action needed.",
    "",
    "<b>Most probed</b>",
    ...paths.map((p) => `• ${esc(p.p)} ×${fmt(p.n)}`),
  ];
  if (sources > 0) lines.push(`Sources: ${fmt(sources)} (hashed; addresses are never stored)`);
  if (hostRefused) lines.push("", "Tip: drop requests with unknown Host headers at nginx (a default server that returns 444), so scans never reach the app.");
  return lines.join("\n");
}
