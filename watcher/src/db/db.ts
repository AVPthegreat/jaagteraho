// One SQLite file holds everything the watcher stores.

import Database from "better-sqlite3";

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  public_key    TEXT NOT NULL UNIQUE,
  kind          TEXT NOT NULL CHECK (kind IN ('faurus', 'sandbox', 'paste')),
  repo          TEXT,
  repo_access   TEXT NOT NULL DEFAULT 'read' CHECK (repo_access IN ('read', 'sandbox-write')),
  owner_chat_id INTEGER,
  rate_per_min  INTEGER NOT NULL DEFAULT 60,
  settings      TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS incidents (
  id                  INTEGER PRIMARY KEY,
  project_id          INTEGER NOT NULL REFERENCES projects(id),
  fingerprint         TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'backlog')),
  exception_type      TEXT NOT NULL,
  transaction_name    TEXT,
  first_seen          TEXT NOT NULL,
  last_seen           TEXT NOT NULL,
  hits                INTEGER NOT NULL DEFAULT 1,
  reopened_count      INTEGER NOT NULL DEFAULT 0,
  telegram_message_id INTEGER,
  UNIQUE (project_id, fingerprint)
);

CREATE TABLE IF NOT EXISTS events (
  id             INTEGER PRIMARY KEY,
  event_id       TEXT NOT NULL,
  project_id     INTEGER NOT NULL REFERENCES projects(id),
  incident_id    INTEGER NOT NULL REFERENCES incidents(id),
  received_at    TEXT NOT NULL,
  occurred_at    TEXT NOT NULL,
  level          TEXT NOT NULL,
  release        TEXT,
  environment    TEXT,
  exception_type TEXT NOT NULL,
  message_masked TEXT NOT NULL,
  transaction_name TEXT,
  frames         TEXT NOT NULL,
  tags           TEXT NOT NULL,
  sdk            TEXT,
  UNIQUE (project_id, event_id)
);
CREATE INDEX IF NOT EXISTS events_incident ON events(incident_id, received_at);

CREATE TABLE IF NOT EXISTS jobs (
  id          INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL,
  incident_id INTEGER REFERENCES incidents(id),
  payload     TEXT NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_queue ON jobs(status, id);

CREATE TABLE IF NOT EXISTS owners (
  project_id INTEGER PRIMARY KEY REFERENCES projects(id),
  chat_id    INTEGER NOT NULL,
  user_id    INTEGER NOT NULL,
  away       INTEGER NOT NULL DEFAULT 0,
  paused     INTEGER NOT NULL DEFAULT 0,
  linked_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS link_codes (
  code       TEXT PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS decisions (
  id          INTEGER PRIMARY KEY,
  incident_id INTEGER NOT NULL REFERENCES incidents(id),
  facts       TEXT NOT NULL,
  votes       TEXT NOT NULL,
  rule_number INTEGER NOT NULL,
  rule_text   TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('ignore', 'log', 'notify', 'wake')),
  engine      TEXT NOT NULL CHECK (engine IN ('claude', 'rules-only')),
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS diagnoses (
  id            INTEGER PRIMARY KEY,
  incident_id   INTEGER NOT NULL REFERENCES incidents(id),
  model         TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd      REAL NOT NULL DEFAULT 0,
  result        TEXT NOT NULL,
  source_moved  INTEGER NOT NULL DEFAULT 0,
  owner_verdict TEXT NOT NULL DEFAULT 'none' CHECK (owner_verdict IN ('right', 'wrong', 'none')),
  replayed_from INTEGER,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fixes (
  id           INTEGER PRIMARY KEY,
  diagnosis_id INTEGER NOT NULL REFERENCES diagnoses(id),
  diff         TEXT NOT NULL,
  gate_result  TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('shown', 'rejected', 'approved', 'merged')),
  pr_url       TEXT,
  commit_sha   TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  incident_id  INTEGER PRIMARY KEY REFERENCES incidents(id),
  chat_id      INTEGER NOT NULL,
  message_id   INTEGER NOT NULL,
  action       TEXT NOT NULL,
  acked        INTEGER NOT NULL DEFAULT 0,
  pings        INTEGER NOT NULL DEFAULT 0,
  last_ping_at TEXT,
  last_edit_at TEXT
);

CREATE TABLE IF NOT EXISTS spend (
  id            INTEGER PRIMARY KEY,
  at            TEXT NOT NULL,
  model         TEXT NOT NULL,
  purpose       TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd      REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS visitors (
  session_id     TEXT PRIMARY KEY,
  first_seen     TEXT NOT NULL,
  country        TEXT,
  name_or_handle TEXT,
  runs_live_app  INTEGER,
  signed_at      TEXT
);

CREATE TABLE IF NOT EXISTS visits (
  id          INTEGER PRIMARY KEY,
  session_id  TEXT NOT NULL,
  flow        TEXT NOT NULL,
  exam_on     INTEGER NOT NULL,
  build       TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  incident_id INTEGER,
  action      TEXT,
  t_alert     REAL,
  t_cause     REAL,
  t_fix       REAL,
  fixed_ok    INTEGER
);
CREATE INDEX IF NOT EXISTS visits_session ON visits(session_id, id);

CREATE TABLE IF NOT EXISTS session_fixes (
  session_id TEXT NOT NULL,
  flow       TEXT NOT NULL,
  fix_id     INTEGER NOT NULL,
  at         TEXT NOT NULL,
  PRIMARY KEY (session_id, flow)
);

CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/** Additive changes for databases created by earlier versions. */
function migrate(db: DB) {
  const has = (table: string, col: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some((c) => c.name === col);
  if (!has("spend", "project_id")) db.exec("ALTER TABLE spend ADD COLUMN project_id INTEGER");
  if (!has("projects", "github_installation")) db.exec("ALTER TABLE projects ADD COLUMN github_installation INTEGER");
}

export function openDb(path: string): DB {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

export type Project = {
  id: number;
  name: string;
  public_key: string;
  kind: "faurus" | "sandbox" | "paste";
  rate_per_min: number;
};

export type CriticalFlow = { name: string; match: string };
export type ProjectSettings = {
  critical?: CriticalFlow[]; // route prefixes that matter most, e.g. "/api/submit"
  exam_until?: string | null; // ISO time; set by /exam
  learn_until?: string | null; // ISO time; set by /learn
  repo_prefix?: string; // deploy path prefix to strip from abs_path, e.g. "/app/"
  outside?: boolean; // connected by an outside developer through the website
};

export const getSettings = (db: DB, projectId: number): ProjectSettings => {
  const row = db.prepare("SELECT settings FROM projects WHERE id = ?").get(projectId) as { settings: string } | undefined;
  return row ? (JSON.parse(row.settings) as ProjectSettings) : {};
};

export const setSettings = (db: DB, projectId: number, patch: Partial<ProjectSettings>) => {
  const next = { ...getSettings(db, projectId), ...patch };
  db.prepare("UPDATE projects SET settings = ? WHERE id = ?").run(JSON.stringify(next), projectId);
  return next;
};

export const kvGet = (db: DB, key: string) =>
  (db.prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
export const kvSet = (db: DB, key: string, value: string) =>
  db.prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
