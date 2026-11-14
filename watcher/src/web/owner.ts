// The owner's private logbook page for one incident, opened from Telegram by a signed link
// that expires. Read-only: every action stays in Telegram, behind the owner's identity.

import { createHmac, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type { DB } from "../db/db.js";
import type { CleanFrame } from "../intake/allowlist.js";
import { severityWord, type Decision } from "../pipeline/decide.js";

const TTL_MS = 30 * 60 * 1000;

function sign(secret: string, incidentId: number, exp: number) {
  return createHmac("sha256", secret).update(`incident:${incidentId}:${exp}`).digest("base64url");
}

export function ownerLink(incidentId: number, now = Date.now()): string | null {
  const secret = process.env.JR_LINK_SECRET;
  const base = process.env.JR_PUBLIC_INTAKE_URL;
  if (!secret || !base) return null;
  const exp = now + TTL_MS;
  return `${base.replace(/\/$/, "")}/owner/incident/${incidentId}?e=${exp}&s=${sign(secret, incidentId, exp)}`;
}

export function verifyOwnerLink(incidentId: number, exp: number, sig: string, now = Date.now()): boolean {
  const secret = process.env.JR_LINK_SECRET;
  if (!secret || !Number.isFinite(exp) || exp < now || exp > now + TTL_MS + 60_000) return false;
  const want = Buffer.from(sign(secret, incidentId, exp));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

const esc = (s: unknown) =>
  String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const STAMP: Record<string, [string, string]> = {
  wake: ["WOKE OWNER", "#ff6b5b"],
  notify: ["NOTIFIED", "#f2b441"],
  log: ["LOGGED", "#a7b6d2"],
  ignore: ["IGNORED", "#a7b6d2"],
};

const time = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", day: "numeric", month: "short" });
const secsBetween = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 1000));

function diffHtml(diff: string) {
  return diff
    .split("\n")
    .map((l) => {
      const cls = l.startsWith("---") || l.startsWith("+++") || l.startsWith("@@") ? "h" : l.startsWith("-") ? "d" : l.startsWith("+") ? "a" : "";
      return `<span class="${cls}">${esc(l)}</span>`;
    })
    .join("\n");
}

export function renderOwnerPage(db: DB, incidentId: number): string | null {
  const inc = db
    .prepare(
      `SELECT i.*, p.name AS project, p.kind FROM incidents i JOIN projects p ON p.id = i.project_id WHERE i.id = ?`,
    )
    .get(incidentId) as
    | { id: number; project: string; kind: string; exception_type: string; transaction_name: string | null; first_seen: string; last_seen: string; hits: number; status: string; reopened_count: number }
    | undefined;
  if (!inc) return null;
  const d = db.prepare("SELECT * FROM decisions WHERE incident_id = ? ORDER BY id DESC LIMIT 1").get(incidentId) as
    | { facts: string; votes: string; rule_number: number; rule_text: string; action: string; engine: string; created_at: string }
    | undefined;
  const diag = db.prepare("SELECT * FROM diagnoses WHERE incident_id = ? ORDER BY id DESC LIMIT 1").get(incidentId) as
    | { id: number; model: string; cost_usd: number; result: string; created_at: string; owner_verdict: string; replayed_from: number | null }
    | undefined;
  const fix = diag
    ? (db.prepare("SELECT * FROM fixes WHERE diagnosis_id = ? ORDER BY id DESC LIMIT 1").get(diag.id) as { diff: string; gate_result: string; status: string; created_at: string } | undefined)
    : undefined;
  // The run shown is the one the latest decision was made for: time it from that event.
  const ev = db
    .prepare("SELECT * FROM events WHERE incident_id = ? AND received_at <= ? ORDER BY id DESC LIMIT 1")
    .get(incidentId, d?.created_at ?? new Date().toISOString()) as
    | { message_masked: string; frames: string; release: string | null; environment: string | null; received_at: string }
    | undefined;
  const runStart = ev?.received_at ?? inc.first_seen;

  const facts = d ? (JSON.parse(d.facts) as Decision["facts"]) : null;
  const votes = d ? (JSON.parse(d.votes) as Decision["votes"]) : {};
  const r = diag ? (JSON.parse(diag.result) as { cause_plain: string; cause_technical: string; file: string; line: number; confidence_words: string; test_hint: string; regression_test?: { code: string } }) : null;
  const g = fix
    ? (JSON.parse(fix.gate_result) as { passed: boolean; level?: string; reasons: string[]; changed_lines: number; test_run?: { verdict: string; note: string } | null })
    : null;
  const caution = g?.level === "caution";
  const proof = g?.test_run && g.test_run.verdict !== "skipped" ? `<p class="dim" style="margin:0;font-size:14px">Proof: ${esc(g.test_run.note)}</p>` : "";
  const testCode = r?.regression_test?.code ? `<details><summary class="dim" style="font-size:14px;cursor:pointer">The regression test Claude wrote</summary><pre>${esc(r.regression_test.code)}</pre></details>` : "";
  const frames = ev ? (JSON.parse(ev.frames) as CleanFrame[]).filter((f) => f.in_app).slice(-5) : [];
  const [stampText, stampColor] = STAMP[d?.action ?? "log"] ?? STAMP.log;
  const vote = (k: keyof Decision["votes"], fmt: (v: string) => string = (v) => v) =>
    votes[k] ? `${esc(fmt(votes[k]!.value))} <span class="dim">${votes[k]!.count}/${votes[k]!.of}</span>` : '<span class="dim">not asked</span>';
  const what = facts?.critical ? `${facts.critical} failing` : `${inc.exception_type} on ${inc.transaction_name ?? "unknown route"}`;
  // Self-healing audit trail: every step of every heal for this incident (heal.ts).
  const hasHeals = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'heals'").get();
  const heals = hasHeals
    ? (db.prepare("SELECT id, trigger, status, pr_url, log FROM heals WHERE incident_id = ? AND session_id IS NULL ORDER BY id").all(incidentId) as Array<{ id: number; trigger: string; status: string; pr_url: string | null; log: string }>)
    : [];
  const healHtml = heals.length
    ? `<section class="card"><h2>Self-healing log</h2>${heals
        .map(
          (h) =>
            `<p style="margin:0"><b>Heal ${h.id}</b> · ${esc(h.trigger === "owner" ? "approved by you" : h.trigger === "auto-after" ? "on its own, after an unanswered wake-up" : "on its own, by your rule")} · now ${esc(h.status.replace("_", " "))}${h.pr_url ? ` · <a href="${esc(h.pr_url)}" style="color:var(--lantern)">pull request</a>` : ""}</p><ul>${(JSON.parse(h.log) as Array<{ at: string; what: string }>).map((l) => `<li><span class="mono dim">${esc(time(l.at))}</span> ${esc(l.what)}</li>`).join("")}</ul>`,
        )
        .join("")}</section>`
    : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Logbook entry ${inc.id} · JaagteRaho</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders:wght@600;800&family=Atkinson+Hyperlegible:wght@400;700&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
:root{--ink:#0e1626;--page:#142036;--rule:#26385a;--text:#e6ebf5;--muted:#a7b6d2;--lantern:#f2b441;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--ink);color:var(--text);font:15px/1.5 "Atkinson Hyperlegible",system-ui,sans-serif}
main{max-width:880px;margin:0 auto;padding:32px max(16px,env(safe-area-inset-right)) 48px max(16px,env(safe-area-inset-left));display:grid;gap:20px}
.eyebrow,.mono,h2{font-family:"JetBrains Mono",ui-monospace,monospace}.eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--lantern);margin:0}
header{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:16px;border-bottom:1px solid var(--rule);padding-bottom:16px}
h1{margin:4px 0 0;font:800 clamp(32px,6vw,48px)/1 "Big Shoulders",sans-serif;letter-spacing:.01em}
.stamp{display:inline-block;transform:rotate(-6deg);border:4px double ${stampColor};color:${stampColor};border-radius:5px;padding:4px 14px;font:800 32px/1.1 "Big Shoulders",sans-serif;letter-spacing:.06em;white-space:nowrap}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}@media(max-width:640px){.grid{grid-template-columns:1fr}}
.card{background:var(--page);border:1px solid var(--rule);border-radius:8px;padding:18px 20px;display:flex;flex-direction:column;gap:10px;min-width:0}
h2{margin:0;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:600}
dl{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;margin:0;font-size:14px}dd{margin:0;font-family:"JetBrains Mono",monospace;text-align:right}
.dim{color:var(--muted)}.hot{color:var(--lantern)}
.times{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.times b{display:block;font:600 20px "JetBrains Mono",monospace;color:var(--lantern)}.times span{font-size:13px;color:var(--muted)}
@media(max-width:640px){.times{grid-template-columns:repeat(2,minmax(0,1fr))}}
pre{margin:0;overflow-x:auto;background:var(--ink);border:1px solid var(--rule);border-radius:6px;padding:12px 14px;font:13px/1.6 "JetBrains Mono",monospace}
pre .d{color:#ff8f84}pre .a{color:#7fe0b4}pre .h{color:var(--muted)}
ul{margin:0;padding-left:18px}footer{font-size:13px;color:var(--muted);border-top:1px solid var(--rule);padding-top:14px}
</style></head><body><main>
<header><div><p class="eyebrow">Night log · ${esc(inc.project)} · entry ${inc.id}</p><h1>${esc(what)}</h1></div><span class="stamp">${stampText}</span></header>

<div class="grid">
<section class="card"><h2>Facts code knew</h2><dl>
<dt>Critical flow</dt><dd class="${facts?.critical ? "hot" : ""}">${esc(facts?.critical ?? "no")}</dd>
<dt>Exam window open</dt><dd class="${facts?.exam_open ? "hot" : ""}">${facts?.exam_open ? "yes" : "no"}</dd>
<dt>Owner away</dt><dd>${facts?.owner_away ? "yes" : "no"}</dd>
<dt>Failures</dt><dd>${inc.hits}${inc.reopened_count ? `, came back ${inc.reopened_count}×` : ""}</dd>
<dt>Release</dt><dd>${esc(ev?.release ?? "unknown")}</dd>
</dl></section>
<section class="card"><h2>Claude's answers · 5 votes each</h2><dl>
<dt>Is it noise?</dt><dd>${vote("is_noise")}</dd>
<dt>Severity</dt><dd>${vote("severity", (v) => `${v} ${severityWord(v)}`)}</dd>
<dt>User blocked?</dt><dd>${vote("user_blocked")}</dd>
<dt>Category</dt><dd>${vote("category", (v) => v.replaceAll("_", " "))}</dd>
<dt>Suggested</dt><dd>${vote("suggested_action")}</dd>
</dl><p class="dim" style="margin:0;font-size:12px">Rule ${d?.rule_number ?? "?"}: ${esc(d?.rule_text ?? "")}. Vote shares are not probabilities.${d && d.rule_number >= 2 && d.rule_number <= 4 ? " No model answer can lower this rule." : ""}</p></section>
</div>

<section class="card"><h2>Timeline</h2><div class="times">
<div><b>${esc(time(runStart))}</b><span>this error${inc.hits > 1 ? ` (first seen ${esc(time(inc.first_seen))})` : ""}</span></div>
<div><b>${d ? `+${secsBetween(runStart, d.created_at)} s` : "—"}</b><span>decision</span></div>
<div><b>${diag && !diag.replayed_from ? `+${secsBetween(runStart, diag.created_at)} s` : diag ? "replayed" : "—"}</b><span>cause found</span></div>
<div><b>${fix && !diag?.replayed_from ? `+${secsBetween(runStart, fix.created_at)} s` : "—"}</b><span>fix checked</span></div>
</div></section>

<div class="grid">
<section class="card"><h2>Cause</h2>${r ? `<p style="margin:0">${esc(r.cause_plain)}</p><p class="dim" style="margin:0;font-size:14px">${esc(r.cause_technical)}</p><span class="mono dim" style="font-size:13px">${esc(r.file)} · line ${r.line} · ${esc(r.confidence_words)} · ${esc(diag!.model)}${diag!.cost_usd ? ` · $${diag!.cost_usd.toFixed(4)}` : ""}</span>` : '<p class="dim" style="margin:0">No diagnosis yet.</p>'}</section>
<section class="card"><h2>What the AI was not allowed to do</h2><ul>
<li>Apply a fix unless you approved it or your heal rule allows it, and then only through a pull request your repository's checks must pass</li><li>Touch login, payments, grading, exams or settings</li>
<li>See request bodies, cookies, user details or local variables</li><li>Run any tool or command</li></ul></section>
</div>

${fix ? `<section class="card"><h2>${g?.passed ? (caution ? "Proposed fix · use with care · AI-written" : "Proposed fix · all checks passed · AI-written") : "Fix withheld"}</h2>${g?.passed ? `${caution ? `<p style="margin:0">The reviewer flagged: ${esc(g.reasons.join("; "))}. Read it carefully before applying.</p>` : ""}<pre>${diffHtml(fix.diff)}</pre>${proof}${r?.test_hint ? `<p class="dim" style="margin:0;font-size:14px">Check: ${esc(r.test_hint)}</p>` : ""}${testCode}` : `<p style="margin:0">${esc(g?.reasons.join("; "))}. Review this one by hand.</p>`}</section>` : ""}

${healHtml}

<section class="card"><h2>Where it failed · app code, newest last</h2><pre>${frames.map((f) => `${esc(f.filename ?? f.abs_path)}:${f.lineno} in ${esc(f.function)}\n    ${esc(f.context_line?.trim() ?? "")}`).join("\n") || "no app frames"}</pre>
<p class="mono dim" style="margin:0;font-size:13px">${esc(inc.exception_type)}: ${esc(ev?.message_masked ?? "")}</p></section>

<footer>Read-only page. Act from Telegram: Acknowledge, Approve, Undo, Right or Wrong. This link expires 30 minutes after it was sent.</footer>
</main></body></html>`;
}

export function ownerRoutes(db: DB) {
  const app = new Hono();
  app.get("/owner/incident/:id", (c) => {
    const id = Number(c.req.param("id"));
    const ok = Number.isInteger(id) && verifyOwnerLink(id, Number(c.req.query("e")), c.req.query("s") ?? "");
    if (!ok) return c.html("<!doctype html><title>Link expired</title><body style=\"background:#0e1626;color:#e6ebf5;font-family:system-ui;padding:40px\"><h1>This link has expired</h1><p>Open the incident again from Telegram.</p>", 403);
    const html = renderOwnerPage(db, id);
    if (!html) return c.text("not found", 404);
    c.header("cache-control", "no-store");
    c.header("referrer-policy", "no-referrer");
    c.header("x-robots-tag", "noindex");
    return c.html(html);
  });
  return app;
}
