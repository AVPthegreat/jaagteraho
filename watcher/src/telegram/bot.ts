// The owner's bot: linking, commands and alert buttons. Only a linked owner, in a private
// chat, can command or approve anything.

import { bus } from "../bus.js";
import { installUrl } from "../github/app.js";
import { openFixPullRequest } from "../github/pr.js";
import { getSettings, kvGet, kvSet, setSettings, type DB } from "../db/db.js";
import type { Worker } from "../pipeline/worker.js";
import { describePolicy, parseHealArgs, policyOf, savePolicy, writeTokenFor } from "../pipeline/heal.js";
import { esc, type Telegram, type TgCallback, type TgMessage, type TgUpdate } from "./api.js";
import { renderWhy } from "./card.js";
import { buildDigest, istNow } from "./digest.js";
import { appsOwnedBy, APPS_PER_OWNER, cleanName, createOutsideApp, creditOf, FREE_CREDIT_USD, isPublicRepo, NEW_APPS_PER_DAY, outsideAppsToday } from "../projects.js";
import { parseRepo } from "../web/paste.js";

type OwnerRow = { project_id: number; chat_id: number; user_id: number; away: number; paused: number; name: string; kind: string };

const HELP = [
  "<b>JaagteRaho</b> watches your app and wakes you only when it matters.",
  "",
  "/new myapp github.com/you/myapp: connect a new app (the repository is optional)",
  "/credits: your free AI credit",
  "/github: give read-only access to a private repository",
  "/status: open incidents and today's spend",
  "/away and /back: away mode; /back sends what happened",
  "/exam 2h: treat the next 2 hours as an exam window",
  "/learn 2h: store and group only, mark everything as old backlog",
  "Every morning at 8 (India time) you get a short summary of the night, if anything happened.",
  "/pause and /resume: stop or restart model calls, fixes and wakes",
  "/critical /api/checkout checkout: mark a route as critical (failures there always reach you); /critical alone lists them",
  "/heal: your self-healing rule. /heal ask (you approve every fix, the default), /heal auto 10m (heal on its own if you don't acknowledge a wake-up in 10 min), /heal now (heal right away), /heal off, /heal max 2",
].join("\n");

export function parseDuration(s: string | undefined): number | null {
  const m = s?.match(/^(\d{1,3})\s*(m|min|h|hr|hours?)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  const ms = /^m/i.test(m[2] ?? "h") ? n * 60_000 : n * 3_600_000;
  return ms > 0 && ms <= 24 * 3_600_000 ? ms : null;
}

export class Bot {
  private stopped = false;

  constructor(private db: DB, private tg: Telegram, private worker: Worker) {}

  /** Sends each owner a "while you slept" summary once a day at 08:00 IST, if anything happened since 22:00. */
  async morningDigest(now = new Date()): Promise<number> {
    const { date, hour } = istNow(now);
    // Only in the morning window, so a restart in the evening does not send a stale summary.
    if (hour < 8 || hour >= 12 || kvGet(this.db, "digest_date") === date) return 0;
    kvSet(this.db, "digest_date", date);
    const since = new Date(now.getTime() - 10 * 3_600_000).toISOString();
    const chats = this.db.prepare("SELECT chat_id, GROUP_CONCAT(project_id) AS ids FROM owners GROUP BY chat_id").all() as Array<{ chat_id: number; ids: string }>;
    let sent = 0;
    for (const c of chats) {
      const text = buildDigest(this.db, c.ids.split(",").map(Number), since);
      if (!text) continue;
      try {
        await this.tg.send(c.chat_id, text);
        sent++;
      } catch (e) {
        console.error("digest:", String(e));
      }
    }
    return sent;
  }

  async run() {
    while (!this.stopped) {
      await this.morningDigest().catch((e) => console.error("digest:", String(e)));
      const offset = Number(kvGet(this.db, "tg_offset") ?? 0);
      let updates: TgUpdate[] = [];
      try {
        updates = await this.tg.call<TgUpdate[]>("getUpdates", { offset, timeout: 25, allowed_updates: ["message", "callback_query"] }, 35_000);
      } catch (e) {
        console.error("getUpdates:", String(e));
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      for (const u of updates) {
        kvSet(this.db, "tg_offset", String(u.update_id + 1));
        try {
          if (u.message) await this.onMessage(u.message);
          if (u.callback_query) await this.onCallback(u.callback_query);
        } catch (e) {
          console.error("bot update failed:", e);
        }
      }
    }
  }

  stop() {
    this.stopped = true;
  }

  /** Opens a pull request on the sandbox repository with the approved fix, when a token is set. */
  private async openPullRequest(fixId: number): Promise<{ url?: string; error?: string } | null> {
    const row = this.db
      .prepare(
        `SELECT d.result, d.incident_id, p.repo, i.exception_type, i.transaction_name FROM fixes f JOIN diagnoses d ON d.id = f.diagnosis_id
         JOIN incidents i ON i.id = d.incident_id JOIN projects p ON p.id = i.project_id WHERE f.id = ?`,
      )
      .get(fixId) as { result: string; incident_id: number; repo: string | null; exception_type: string; transaction_name: string | null } | undefined;
    const token = process.env.JR_GITHUB_SANDBOX_TOKEN;
    if (!row || !token || !row.repo || row.repo.startsWith("local:")) return null;
    const r = JSON.parse(row.result) as { cause_plain: string; cause_technical: string; test_hint: string; edits: Array<{ file: string; find: string; replace: string }> };
    const out = await openFixPullRequest({
      repo: row.repo,
      token,
      edits: r.edits,
      branch: `jr/fix-${fixId}-${Date.now().toString(36)}`,
      title: `Fix ${row.exception_type} on ${row.transaction_name ?? "the app"} (JaagteRaho)`,
      body: [
        `**Cause, in plain words:** ${r.cause_plain}`,
        "",
        `**Technical:** ${r.cause_technical}`,
        "",
        `**How to check:** ${r.test_hint}`,
        "",
        "Proposed by JaagteRaho (AI-written), passed its fix gate, approved by the owner on Telegram. JaagteRaho does not merge; the owner does.",
      ].join("\n"),
    });
    if (!out.ok) return { error: out.error };
    this.db.prepare("UPDATE fixes SET pr_url = ?, commit_sha = ? WHERE id = ?").run(out.url, out.base_sha, fixId);
    return { url: out.url };
  }

  /** /new name [repo]: creates an app owned by this chat, with no website needed. */
  private async newApp(m: TgMessage) {
    const reply = (text: string) => this.tg.send(m.chat.id, text);
    const rest = (m.text ?? "").trim().split(/\s+/).slice(1);
    const name = cleanName(rest[0]);
    if (name.length < 2) return reply("Send /new followed by your app's name, and optionally its public GitHub repository:\n/new quizkart github.com/you/quizkart");
    const repo = rest[1] ? parseRepo(rest[1]) : null;
    if (rest[1] && !repo) return reply("That doesn't look like a GitHub repository. Try github.com/you/app, or leave it out.");
    if (appsOwnedBy(this.db, m.from!.id) >= APPS_PER_OWNER) return reply(`You already have ${APPS_PER_OWNER} apps connected, the free limit.`);
    if (outsideAppsToday(this.db) >= NEW_APPS_PER_DAY) return reply("Today's free spots are taken. Try again tomorrow.");
    if (repo && !(await isPublicRepo(repo))) return reply(`I couldn't read ${esc(repo)}. If it's private, connect without it for now (/new ${esc(name)}) and install our GitHub app later.`);
    const app = createOutsideApp(this.db, name, repo);
    this.db.prepare("INSERT INTO owners (project_id, chat_id, user_id, linked_at) VALUES (?, ?, ?, ?)").run(app.id, m.chat.id, m.from!.id, new Date().toISOString());
    this.db.prepare("UPDATE link_codes SET expires_at = ? WHERE code = ?").run(new Date(0).toISOString(), app.link_code);
    return reply(
      [
        `<b>${esc(app.name)}</b> is ready. You have $${FREE_CREDIT_USD.toFixed(0)} of free AI credit.`,
        "",
        "<b>Easiest:</b> in your project folder run",
        `<code>npx jaagteraho init --dsn ${esc(app.dsn)}</code>`,
        "It adds the error package and two lines, then sends a test error. You'll get a ✅ here.",
        "",
        "<b>Or by hand:</b> add the free Sentry SDK to your app and set",
        `<code>SENTRY_DSN=${esc(app.dsn)}</code>`,
        "",
        "<b>No code at all:</b> if your host can forward logs (a log drain), point it at",
        `<code>${esc(app.logs_url)}</code>`,
        "I'll pick out Python and Node.js errors and ignore the rest.",
        "",
        repo ? `I'll read ${esc(repo)} to explain causes.` : "No repository given: I'll explain causes from the error itself. Add one later with our GitHub app.",
      ].join("\n"),
    );
  }

  private ownersOf(userId: number): OwnerRow[] {
    return this.db
      .prepare("SELECT o.*, p.name, p.kind FROM owners o JOIN projects p ON p.id = o.project_id WHERE o.user_id = ?")
      .all(userId) as OwnerRow[];
  }

  private ownsIncident(userId: number, incidentId: number): boolean {
    return !!this.db
      .prepare("SELECT 1 FROM incidents i JOIN owners o ON o.project_id = i.project_id WHERE i.id = ? AND o.user_id = ?")
      .get(incidentId, userId);
  }

  private async onMessage(m: TgMessage) {
    if (m.chat.type !== "private" || !m.from || !m.text) return;
    const [cmdRaw, arg] = m.text.trim().split(/\s+/, 2);
    const cmd = cmdRaw.toLowerCase().replace(/@\w+$/, "");
    const reply = (text: string) => this.tg.send(m.chat.id, text);

    if (cmd === "/new") return this.newApp(m);

    if (cmd === "/start") {
      if (!arg) return reply(`${HELP}\n\nTo connect your first app, send /new followed by its name.`);
      const code = this.db.prepare("SELECT project_id, expires_at FROM link_codes WHERE code = ?").get(arg) as { project_id: number; expires_at: string } | undefined;
      if (!code || Date.parse(code.expires_at) < Date.now()) return reply("That link code is unknown or has expired.");
      this.db
        .prepare(
          `INSERT INTO owners (project_id, chat_id, user_id, linked_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(project_id) DO UPDATE SET chat_id = excluded.chat_id, user_id = excluded.user_id, linked_at = excluded.linked_at`,
        )
        .run(code.project_id, m.chat.id, m.from.id, new Date().toISOString());
      this.db.prepare("DELETE FROM link_codes WHERE code = ?").run(arg);
      const p = this.db.prepare("SELECT name FROM projects WHERE id = ?").get(code.project_id) as { name: string };
      // If the setup command already sent its test (or real errors came in), say so now: that message had nobody to go to.
      const seen = (this.db.prepare("SELECT COUNT(*) AS n FROM events WHERE project_id = ?").get(code.project_id) as { n: number }).n;
      if (seen > 0) kvSet(this.db, `connected:${code.project_id}`, new Date().toISOString());
      const status = seen > 0 ? `✅ <b>${esc(p.name)} is connected</b>: ${seen} ${seen === 1 ? "error has" : "errors have"} arrived so far.` : `Linked. I'm now watching <b>${esc(p.name)}</b>. Run <code>npx jaagteraho test</code> in your project to check the connection.`;
      return reply(`${status}\n\n${HELP}`);
    }

    const owned = this.ownersOf(m.from.id);
    if (owned.length === 0) return reply("This bot only answers the owner of a linked app. Send /start with your link code.");
    const ids = owned.map((o) => o.project_id);
    const setOwners = (sql: string, ...params: unknown[]) => {
      for (const id of ids) this.db.prepare(sql).run(...params, id);
    };

    switch (cmd) {
      case "/help":
        return reply(HELP);
      case "/github": {
        const apps = owned.filter((o) => o.kind !== "sandbox");
        const target = apps.find((o) => arg && o.name.toLowerCase().startsWith(arg.toLowerCase())) ?? (apps.length === 1 ? apps[0] : null);
        if (!target) return reply(apps.length ? `Which app? ${apps.map((o) => `/github ${esc(o.name)}`).join(" or ")}` : "Connect an app first with /new.");
        const url = installUrl(target.project_id, m.from.id);
        if (!url) return reply("The GitHub app isn't set up on this server yet. Public repositories still work: /new name github.com/you/app.");
        return this.tg.send(m.chat.id, `Give JaagteRaho <b>read-only</b> access to <b>${esc(target.name)}</b>'s repository, private ones included. You choose which repositories; it can never write. The link works for 30 minutes.`, {
          inline_keyboard: [[{ text: "Install on GitHub", url }]],
        });
      }
      case "/repo": {
        const want = arg?.trim().toLowerCase();
        if (!want) return reply("Send /repo owner/name, choosing from the list I sent after you installed the GitHub app.");
        for (const o of owned) {
          const saved = JSON.parse(kvGet(this.db, `gh_repos:${o.project_id}`) ?? "{}") as { at?: number; repos?: string[] };
          const fresh = typeof saved.at === "number" && Date.now() - saved.at < 30 * 60_000;
          const hit = fresh ? (saved.repos ?? []).find((r) => r.toLowerCase() === want) : undefined;
          if (hit) {
            this.db.prepare("UPDATE projects SET repo = ? WHERE id = ?").run(hit, o.project_id);
            return reply(`I'll read <b>${esc(hit)}</b> (read-only) to explain causes in <b>${esc(o.name)}</b>.`);
          }
        }
        return reply("That repository isn't one the GitHub app can read right now, or the list is more than 30 minutes old. Send /github again.");
      }
      case "/credits": {
        const c = creditOf(this.db, m.from.id);
        return reply(
          `<b>Free AI credit</b>: $${c.granted.toFixed(2)}\nUsed: $${c.used.toFixed(3)}\nLeft: $${c.left.toFixed(3)}\n\nA diagnosis with a fix costs about $0.01. Deciding and alerting cost a fraction of a cent and continue even when the credit is used up. Our own demo apps do not use your credit.`,
        );
      }
      case "/away":
        setOwners("UPDATE owners SET away = 1 WHERE project_id = ?");
        kvSet(this.db, `away_since:${m.from.id}`, new Date().toISOString());
        return reply("Away mode on. I'll wake you only for critical flows and outages.");
      case "/back": {
        setOwners("UPDATE owners SET away = 0 WHERE project_id = ?");
        const since = kvGet(this.db, `away_since:${m.from.id}`) ?? new Date(Date.now() - 8 * 3600_000).toISOString();
        return reply(buildDigest(this.db, ids, since, "Welcome back. While you were away") ?? "Welcome back. Nothing happened while you were away.");
      }
      case "/exam":
      case "/learn": {
        const ms = parseDuration(arg ?? "2h");
        if (!ms) return reply(`Use it like ${cmd} 2h or ${cmd} 90m (up to 24h).`);
        const until = new Date(Date.now() + ms).toISOString();
        for (const o of owned) if (o.kind !== "sandbox") setSettings(this.db, o.project_id, cmd === "/exam" ? { exam_until: until } : { learn_until: until });
        if (cmd === "/learn") {
          for (const o of owned) if (o.kind !== "sandbox") this.db.prepare("UPDATE incidents SET status = 'backlog' WHERE project_id = ? AND status = 'open'").run(o.project_id);
        }
        return reply(cmd === "/exam" ? `Exam window open until ${until.slice(11, 16)} UTC. Critical failures will wake you.` : `Learn mode until ${until.slice(11, 16)} UTC. Errors are stored and grouped, nothing else.`);
      }
      case "/critical": {
        const editable = owned.filter((o) => o.kind !== "sandbox");
        if (editable.length === 0) return reply("The demo portal's critical flows are fixed.");
        const rest = m.text.trim().split(/\s+/).slice(1);
        if (rest.length === 0) {
          const lines = editable.map((o) => {
            const flows = getSettings(this.db, o.project_id).critical ?? [];
            return `<b>${esc(o.name)}</b>: ${flows.length ? flows.map((f) => `${esc(f.name)} (${esc(f.match)})`).join(", ") : "none yet"}`;
          });
          return reply(`Critical flows\n${lines.join("\n")}\n\nAdd one: /critical /api/checkout checkout`);
        }
        const match = rest[0];
        if (!/^\/[\w\-./]{0,80}$/.test(match)) return reply("Give a route that starts with /, like /critical /api/checkout checkout");
        const name = rest.slice(1).join(" ").replace(/[<>]/g, "").slice(0, 40) || match;
        for (const o of editable) {
          const flows = (getSettings(this.db, o.project_id).critical ?? []).filter((f) => f.match !== match);
          setSettings(this.db, o.project_id, { critical: [...flows, { name, match }].slice(-20) });
        }
        return reply(`Marked <b>${esc(name)}</b> (${esc(match)}) as critical. Failures there now always reach you.`);
      }
      case "/heal": {
        const editable = owned.filter((o) => o.kind !== "sandbox");
        if (editable.length === 0) return reply("On the demo portal, each visitor picks their own heal rule on the website.");
        const parsed = parseHealArgs(m.text.trim().split(/\s+/).slice(1));
        if (typeof parsed === "object" && "error" in parsed) return reply(parsed.error);
        if (parsed !== "show") for (const o of editable) savePolicy(this.db, o.project_id, parsed.patch);
        const lines = editable.map((o) => {
          const p = this.db.prepare("SELECT id, kind, repo FROM projects WHERE id = ?").get(o.project_id) as { id: number; kind: string; repo: string | null };
          const write = writeTokenFor(p) ? "write access set: heals open a pull request with auto-merge" : "no write access: heals arrive as a ready-to-apply diff and paging goes on";
          return `<b>${esc(o.name)}</b>: ${esc(describePolicy(policyOf(this.db, o.project_id)))}\n${write}`;
        });
        return reply(
          [
            parsed === "show" ? "<b>Self-healing</b>" : "<b>Saved.</b>",
            ...lines,
            "",
            "Rules that always hold: only fixes that passed all six code checks and the review heal on their own; never in login, payments, grading, migrations, settings or CI; if the errors don't drop after a heal, it is undone, you are woken again and self-healing pauses for 12 hours. Every heal comes with one-tap Undo.",
            "",
            "/heal ask · /heal auto 10m · /heal now · /heal now /api/submit · /heal off · /heal max 2",
          ].join("\n"),
        );
      }
      case "/pause":
        setOwners("UPDATE owners SET paused = 1 WHERE project_id = ?");
        return reply("Paused: no model calls, no fixes, no wakes. /resume to restart.");
      case "/resume":
        setOwners("UPDATE owners SET paused = 0 WHERE project_id = ?");
        return reply("Resumed.");
      case "/status": {
        const open = this.db
          .prepare(`SELECT COUNT(*) AS n FROM incidents WHERE status = 'open' AND project_id IN (${ids.map(() => "?").join(",")})`)
          .get(...ids) as { n: number };
        // Only this owner's apps: the spend ledger covers everyone, which other owners must not see.
        const inIds = ids.map(() => "?").join(",");
        const spend = this.db.prepare(`SELECT COALESCE(SUM(cost_usd), 0) AS t FROM spend WHERE project_id IN (${inIds}) AND at > ?`).get(...ids, new Date(Date.now() - 86_400_000).toISOString()) as { t: number };
        const total = this.db.prepare(`SELECT COALESCE(SUM(cost_usd), 0) AS t FROM spend WHERE project_id IN (${inIds})`).get(...ids) as { t: number };
        return reply(
          `Watching: ${owned.map((o) => esc(o.name)).join(", ")}\nOpen incidents: ${open.n}\nAI spend: $${spend.t.toFixed(3)} today, $${total.t.toFixed(2)} in total\nAway: ${owned[0].away ? "yes" : "no"} · Paused: ${owned[0].paused ? "yes" : "no"}`,
        );
      }
      default:
        return reply(HELP);
    }
  }

  private async onCallback(q: TgCallback) {
    const [kind, idRaw] = (q.data ?? "").split(":");
    const id = Number(idRaw);
    if (!Number.isInteger(id)) return this.tg.answer(q.id);

    if (kind === "a" || kind === "w") {
      if (!this.ownsIncident(q.from.id, id)) return this.tg.answer(q.id, "Not yours.");
      if (kind === "a") {
        this.db.prepare("UPDATE alerts SET acked = 1 WHERE incident_id = ?").run(id);
        await this.worker.refreshCard(id, false);
        return this.tg.answer(q.id, "Acknowledged");
      }
      await this.tg.answer(q.id);
      if (q.message) await this.tg.send(q.message.chat.id, renderWhy(this.db, id));
      return;
    }

    if (kind === "f" || kind === "p") {
      const fix = this.db
        .prepare("SELECT f.id, f.diff, f.status, f.gate_result, d.incident_id, p.kind FROM fixes f JOIN diagnoses d ON d.id = f.diagnosis_id JOIN incidents i ON i.id = d.incident_id JOIN projects p ON p.id = i.project_id WHERE f.id = ?")
        .get(id) as { id: number; diff: string; status: string; gate_result: string; incident_id: number; kind: string } | undefined;
      if (!fix || !this.ownsIncident(q.from.id, fix.incident_id)) return this.tg.answer(q.id, "Not found.");
      const gate = JSON.parse(fix.gate_result) as { level?: string; reasons?: string[] };
      const caution = gate.level === "caution";
      if (kind === "f") {
        await this.tg.answer(q.id);
        const head = caution
          ? `<b>Proposed fix: use with care</b> (${esc((gate.reasons ?? []).join("; "))}). AI-written; read it before applying.`
          : "<b>Proposed fix</b> (AI-written; review before applying)";
        if (q.message) await this.tg.send(q.message.chat.id, `${head}\n<pre>${esc(fix.diff.slice(0, 3500))}</pre>`);
        return;
      }
      // A fix with open concerns is shown, never approvable with one tap.
      if (caution) return this.tg.answer(q.id, "This fix has open concerns, so it cannot be approved here. Apply it by hand if you agree.");
      if (fix.kind !== "sandbox") {
        // A real app: Approve opens a pull request with auto-merge, only where write access was given.
        const healer = this.worker.healer;
        const p = this.db.prepare("SELECT p.id, p.kind, p.repo FROM projects p JOIN incidents i ON i.project_id = p.id WHERE i.id = ?").get(fix.incident_id) as { id: number; kind: string; repo: string | null };
        if (!healer || !writeTokenFor(p) || policyOf(this.db, p.id).mode === "off") return this.tg.answer(q.id, "On this app fixes are diffs only. Apply it yourself.");
        const { blocker } = healer.check(fix.id, "owner", null);
        if (blocker) return this.tg.answer(q.id, `Cannot apply: ${blocker}.`);
        await this.tg.answer(q.id, "Approved. Opening a pull request…");
        await healer.healReal(fix.id, "owner");
        await this.worker.refreshCard(fix.incident_id, false);
        return;
      }
      if (fix.status !== "shown") return this.tg.answer(q.id, `Already ${fix.status}.`);
      // Claim the fix first so a double tap cannot open two pull requests.
      const claimed = this.db.prepare("UPDATE fixes SET status = 'approved' WHERE id = ? AND status = 'shown'").run(fix.id).changes === 1;
      if (!claimed) return this.tg.answer(q.id, "Already approved.");
      await this.tg.answer(q.id, "Approved. Opening a pull request…");
      const pr = await this.openPullRequest(fix.id);
      bus.publish(null, { type: "fixed", at: new Date().toISOString(), incident_id: fix.incident_id, data: { fix_id: fix.id, by: "owner", pr_url: pr?.url ?? null } });
      await this.worker.refreshCard(fix.incident_id, false);
      if (q.message) {
        await this.tg.send(
          q.message.chat.id,
          pr?.url
            ? `Pull request opened: ${esc(pr.url)}\nMerge it on GitHub when you are happy. JaagteRaho never merges.`
            : `Approved and recorded. ${pr?.error ? `No pull request: ${esc(pr.error)}` : "No pull request: the sandbox repository is not connected."}`,
        );
      }
      return;
    }

    if (kind === "u") {
      const h = this.worker.healer?.get(id);
      if (!h || h.session_id || !this.ownsIncident(q.from.id, h.incident_id)) return this.tg.answer(q.id, "Not found.");
      await this.tg.answer(q.id, "Undoing…");
      const msg = await this.worker.healer!.undo(id, "owner");
      if (q.message) await this.tg.send(q.message.chat.id, `<b>Undo</b>: ${esc(msg)}`);
      await this.worker.refreshCard(h.incident_id, false);
      return;
    }

    if (kind === "r" || kind === "x") {
      const d = this.db.prepare("SELECT incident_id FROM diagnoses WHERE id = ?").get(id) as { incident_id: number } | undefined;
      if (!d || !this.ownsIncident(q.from.id, d.incident_id)) return this.tg.answer(q.id, "Not found.");
      this.db.prepare("UPDATE diagnoses SET owner_verdict = ? WHERE id = ?").run(kind === "r" ? "right" : "wrong", id);
      return this.tg.answer(q.id, kind === "r" ? "Marked right. Thanks." : "Marked wrong. Thanks.");
    }
    return this.tg.answer(q.id);
  }
}
