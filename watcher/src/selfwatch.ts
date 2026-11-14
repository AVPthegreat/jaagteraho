// JaagteRaho watches itself: its own crashes and failed jobs go through the same pipeline
// as any app's errors, into a project called "jaagteraho", diagnosed against its own source.

import { randomBytes, randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { DB } from "./db/db.js";
import type { CleanEvent, CleanFrame } from "./intake/allowlist.js";
import { clip, mask } from "./intake/mask.js";
import { storeEvent } from "./intake/store.js";

export const SELF_NAME = "jaagteraho";
let selfId: number | null = null;
let reporting = false;

/** Reads a V8 stack ("at fn (file:line:col)") into frames, oldest first like Sentry. */
export function parseV8Stack(stack: string): CleanFrame[] {
  const frames: CleanFrame[] = [];
  for (const line of stack.split("\n")) {
    const m = line.match(/^\s*at (?:(.+?) \()?((?:file:\/\/)?[^()]+?):(\d+):(\d+)\)?$/);
    if (!m) continue;
    let path = m[2];
    if (path.startsWith("file://")) {
      try {
        path = fileURLToPath(path);
      } catch {
        continue;
      }
    }
    const inApp = !path.startsWith("node:") && !path.includes("node_modules") && !path.includes("internal/");
    frames.push({
      filename: path.split("/").slice(-2).join("/"),
      abs_path: path,
      module: null,
      function: m[1] ?? "<anonymous>",
      lineno: Number(m[3]),
      in_app: inApp,
      context_line: null,
      pre_context: [],
      post_context: [],
    });
  }
  return frames.reverse().slice(-30);
}

export function ensureSelfProject(db: DB, root: string): number {
  const row = db.prepare("SELECT id FROM projects WHERE name = ?").get(SELF_NAME) as { id: number } | undefined;
  if (row) {
    selfId = row.id;
  } else {
    selfId = randomInt(100_000, 999_999);
    const settings = { critical: [{ name: "error intake", match: "/api/" }, { name: "public demo", match: "/public/" }] };
    db.prepare(
      "INSERT INTO projects (id, name, public_key, kind, repo, repo_access, settings, created_at) VALUES (?, ?, ?, 'faurus', ?, 'read', ?, ?)",
    ).run(selfId, SELF_NAME, randomBytes(16).toString("hex"), `local:${root}`, JSON.stringify(settings), new Date().toISOString());
  }
  // Alerts about JaagteRaho go to whoever owns the other projects on this server.
  const hasOwner = db.prepare("SELECT 1 FROM owners WHERE project_id = ?").get(selfId);
  if (!hasOwner) {
    const any = db.prepare("SELECT chat_id, user_id FROM owners LIMIT 1").get() as { chat_id: number; user_id: number } | undefined;
    if (any) db.prepare("INSERT INTO owners (project_id, chat_id, user_id, linked_at) VALUES (?, ?, ?, ?)").run(selfId, any.chat_id, any.user_id, new Date().toISOString());
  }
  return selfId;
}

/** Reports one of JaagteRaho's own errors. Never throws, never recurses. */
export function reportSelf(db: DB, err: unknown, where: string) {
  if (selfId === null || reporting) return;
  reporting = true;
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    const ev: CleanEvent = {
      event_id: randomBytes(16).toString("hex"),
      timestamp: new Date().toISOString(),
      level: "error",
      platform: "node",
      release: process.env.JR_RELEASE ?? "dev",
      environment: process.env.NODE_ENV ?? "development",
      transaction: clip(where, 200),
      exception_type: clip(e.name || "Error", 120),
      message: clip(mask(e.message), 500),
      chain: [],
      frames: parseV8Stack(e.stack ?? ""),
      tags: {},
      sdk: "jaagteraho-self",
    };
    storeEvent(db, selfId, ev);
  } catch (inner) {
    console.error("self-report failed:", inner);
  } finally {
    reporting = false;
  }
}

export const isSelfProject = (projectId: number) => projectId === selfId;
