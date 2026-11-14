// Stores a clean event and updates its incident in one transaction, then queues work.

import type { DB } from "../db/db.js";
import type { CleanEvent } from "./allowlist.js";
import { fingerprint } from "./fingerprint.js";

const QUIET_BEFORE_REOPEN_MS = 6 * 60 * 60 * 1000;

export type StoreResult =
  | { stored: false; reason: "duplicate" }
  | { stored: true; incidentId: number; change: "new" | "repeat" | "reopened"; hits: number };

type IncidentRow = { id: number; status: string; last_seen: string; hits: number };

/** authenticated: the event carried the app's server-only ingest secret (needed before a fix may apply itself). */
export function storeEvent(db: DB, projectId: number, ev: CleanEvent, now = new Date(), authenticated = false): StoreResult {
  const fp = fingerprint(projectId, ev);
  const nowIso = now.toISOString();

  return db.transaction((): StoreResult => {
    const dup = db.prepare("SELECT 1 FROM events WHERE project_id = ? AND event_id = ?").get(projectId, ev.event_id);
    if (dup) return { stored: false, reason: "duplicate" };

    const existing = db
      .prepare("SELECT id, status, last_seen, hits FROM incidents WHERE project_id = ? AND fingerprint = ?")
      .get(projectId, fp) as IncidentRow | undefined;

    let incidentId: number;
    let change: "new" | "repeat" | "reopened";
    let hits: number;

    if (!existing) {
      const r = db
        .prepare(
          `INSERT INTO incidents (project_id, fingerprint, exception_type, transaction_name, first_seen, last_seen)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(projectId, fp, ev.exception_type, ev.transaction, nowIso, nowIso);
      incidentId = Number(r.lastInsertRowid);
      change = "new";
      hits = 1;
    } else {
      incidentId = existing.id;
      const quiet = now.getTime() - Date.parse(existing.last_seen) > QUIET_BEFORE_REOPEN_MS;
      // A backlog fingerprint stays backlog: it was marked old during learn mode.
      if (existing.status === "backlog") change = "repeat";
      else if (existing.status === "closed" || quiet) change = "reopened";
      else change = "repeat";
      hits = change === "reopened" ? 1 : existing.hits + 1;
      db.prepare(
        `UPDATE incidents SET last_seen = ?, hits = ?,
           status = CASE WHEN ? = 'reopened' THEN 'open' ELSE status END,
           reopened_count = reopened_count + CASE WHEN ? = 'reopened' THEN 1 ELSE 0 END
         WHERE id = ?`,
      ).run(nowIso, hits, change, change, incidentId);
    }

    db.prepare(
      `INSERT INTO events (event_id, project_id, incident_id, received_at, occurred_at, level, release, environment,
         exception_type, message_masked, transaction_name, frames, tags, sdk, authenticated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      ev.event_id, projectId, incidentId, nowIso, ev.timestamp, ev.level, ev.release, ev.environment,
      ev.exception_type, ev.message, ev.transaction, JSON.stringify(ev.frames), JSON.stringify(ev.tags), ev.sdk, authenticated ? 1 : 0,
    );

    db.prepare(
      "INSERT INTO jobs (kind, incident_id, payload, created_at, updated_at) VALUES ('incident', ?, ?, ?, ?)",
    ).run(incidentId, JSON.stringify({ change, event_id: ev.event_id, session: ev.tags.jr_session ?? null }), nowIso, nowIso);

    return { stored: true, incidentId, change, hits };
  })();
}
