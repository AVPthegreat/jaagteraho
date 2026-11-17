# JaagteRaho: architecture (HLD and LLD)

Draft 1, 13 Nov 2026, for Anant's approval. Nothing is built until this is approved.
Sources: the parliament's amended plan (`.planning/parliament-final.json`), the event pages and the Vultr deliverables list.

---

## 1. What we are building, in one paragraph

JaagteRaho is a watchman for a live app. The app's existing Sentry SDK sends its errors to us instead of to Sentry. We group repeated errors into one incident, ask Claude a few fixed questions about it, and let plain rules in code decide what happens: ignore, log, notify the owner, or wake the owner. For anything worth the owner's attention, Claude explains the cause in plain words and proposes a small fix. Everything reaches the owner on Telegram, and a "wake" also comes as a spoken voice note. A public website lets anyone break a demo exam portal and watch the whole loop happen live.

## 2. Requirements this design must meet

**Hackathon deliverables (from the Vultr event page):**

| Deliverable | Where it is met |
|---|---|
| Public GitHub repository with setup instructions and documentation | This repository, `README.md`, `docs/` |
| Backend deployed on a Vultr Compute instance | The watcher and the sandbox run on one Vultr instance (section 7) |
| Recorded demo video showing the project running on Vultr | Recording on Sat 14 Nov after gate G3 |
| Public demo URL with a real, product-style experience | The public site: break-it page, paste-an-error page, evidence page |
| Use case and system design with diagrams and screenshots | This document, cleaned into the README before submission |

**Judging:** Merit, Reach (real users, three or more countries), Bonus (cross-university, which we skip).

**Hard rules from the parliament (non-negotiable):**

1. The watchman never merges, deploys, restarts or rolls back anything. On our own sandbox repository, the owner's Approve tap opens a pull request on a new branch; a person merges it on GitHub. (Changed on 13 Nov from "Approve merges": merging into the sandbox's main branch would remove the planted faults and break the demo for the next visitor.) **Changed on 14 Nov (the founder): self-healing.** The owner may set a heal rule (`/heal`). Under it, a recommended fix outside protected areas goes in without a tap: on the demo portal by switching the visitor's session to the fixed build; on a real app only through a pull request that merges by itself only behind the branch's required status checks, using a write token bound to that one repository, and only for incidents whose every error carried the app's server-only ingest secret (the DSN public key ships in browsers and proves nothing). Fixes that add imports, network, process, file-write, dynamic or decoding code, or touch the wider HEAL_PROTECTED list, never apply themselves. A heal that does not bring the signed errors down after the deploy (at least 3 repeats, not down by half) is reverted automatically, once. See `watcher/src/pipeline/heal.ts`.
2. No write credential for any Faurus repository or server exists anywhere in this system.
3. Models give signals; code decides. No model answer can lower an alert.
4. Text that users can influence is data, never instructions. The model has no tools.
5. Secrets and personal data are stripped before anything is stored, sent to a model, sent to Telegram or shown publicly.
6. Spending is capped in code.

## 3. High-level design

### 3.1 The pieces

```
                         ┌──────────────────────── Vultr Compute instance ────────────────────────┐
                         │                                                                        │
 Faurus backend ──────┐  │   ┌───────────┐    ┌──────────┐    ┌─────────────┐    ┌─────────────┐  │
 (Django + Sentry SDK)│  │   │  Intake   │───▶│  SQLite  │◀──▶│   Worker    │───▶│ Telegram    │──┼──▶ Owner's phone
                      ├──┼──▶│  (HTTP)   │    │ database │    │ (pipeline)  │    │ bot (long   │  │    (alerts, voice,
 Sandbox twin ────────┘  │   └───────────┘    └──────────┘    └─────────────┘    │  polling)   │◀─┼──── buttons, commands)
 (Django + Sentry SDK)   │         ▲                ▲               │    │        └─────────────┘  │
  "broken" and "fixed"   │         │                │               │    │                         │
  builds, on this box    │   ┌─────┴──────┐  ┌──────┴──────┐        │    └──▶ Claude (Anthropic)   │
                         │   │ Public API │  │ Owner pages │        │         Haiku: decisions     │
                         │   │ (read-only │  │ (signed     │        │         Sonnet: diagnosis    │
                         │   │ aggregates,│  │  links)     │        │                              │
                         │   │ live feed) │  └─────────────┘        ├──▶ Gnani (voice)             │
                         │   └─────▲──────┘                         └──▶ GitHub (read code,       │
                         │         │                                       sandbox PRs only)       │
                         └─────────┼──────────────────────────────────────────────────────────────┘
                                   │
                         ┌─────────┴─────────┐
                         │ Public website    │◀──── Judges and visitors
                         │ (Next.js, Vercel) │      break-it page, paste-an-error,
                         └───────────────────┘      evidence page
```

| Piece | What it does | Runs on |
|---|---|---|
| **Intake** | Accepts error events in the Sentry format, strips them to an allowlist, stores them | Vultr |
| **Worker** | Groups errors into incidents, runs the decision, diagnosis and fix steps, sends alerts | Vultr |
| **Telegram bot** | The owner's home: alerts, voice notes, buttons, commands | Vultr |
| **Owner pages** | Private incident detail and decision log, opened from a signed link sent in Telegram | Vultr |
| **Public API** | Read-only data for the public website: live feed for a visitor's session, aggregates | Vultr |
| **Sandbox twin** | A small Django "exam portal" with three planted faults, in a broken and a fixed build | Vultr |
| **Public website** | Landing page, break-it page, paste-an-error page, evidence page | Vercel |
| **SQLite database** | Everything the watcher stores, one file, backed up nightly | Vultr |

### 3.2 The main loop, step by step

1. **Error happens.** Faurus or the sandbox raises an exception. Its Sentry SDK sends an "envelope" to our intake, because its `SENTRY_DSN` setting points at us.
2. **Intake** checks the project key, strips the event to the allowlist, masks secrets and personal data, and stores it. It answers in a few milliseconds, so the app never waits on us.
3. **Grouping.** The worker computes a fingerprint (error type, top frame of the app's own code, route). Same fingerprint, same incident. Repeats only raise the count.
4. **Decision.** For a new incident, Claude Haiku answers five fixed questions, five times each. Rules in code read the answers plus facts code already knows (critical flow? exam window open? owner away? how many hits?) and choose one action.
5. **Alert.** For notify or wake, Telegram gets an alert at once, before any diagnosis. A wake also sends a voice note and repeats until acknowledged.
6. **Diagnosis.** Code picks the source files from the stack trace and fetches them from GitHub. Claude Sonnet, with no tools, returns the cause in plain words and an exact proposed edit. The Telegram alert edits itself to add the cause.
7. **Fix gate.** Code checks the proposed edit: it must match the file exactly once, touch at most 3 files and 40 lines, avoid sensitive paths, and still be valid Python. Haiku then answers three questions about the fix. Only a fix that passes everything is shown.
8. **Owner decides.** Sandbox: Approve opens a pull request with the fix. Faurus: the fix is a diff to read; the owner applies it. The owner can also mark the diagnosis Right or Wrong; this is the only accuracy figure we will quote.

### 3.3 The visitor loop (break-it page)

1. A visitor opens the break-it page. They get an anonymous session id, and their country is read from Vercel's request header (we never store their IP address).
2. They can switch on "exam in progress", then press one of three buttons: **Submit code**, **Start exam**, **Pay fee**.
3. The page calls the sandbox twin, which fails on purpose. The twin's Sentry SDK reports it with the visitor's session id as a tag.
4. The page follows that session's live feed: a timer, the alert card, the stamped decision, then cause and fix as they arrive. It can play the wake-up voice note.
5. The visitor presses **Approve**. Their session is switched to the fixed build, they press the button again, and it works. (The real merge happens only on the owner's tap; this is said on the page.)
6. An optional two-tap card asks their first name or handle, country and "do you run a live app?". This is what turns a visit into a user a judge can count.

To protect the budget, each planted fault gets a live diagnosis at most a few times a day. After that the page replays the stored diagnosis, labelled with its time.

### 3.4 The paste-an-error loop (for outside developers)

Reach is still scored, so we build this too. A developer pastes a Python traceback and a public GitHub repository link. We read the files from the public repository (no permission needed), run the same diagnosis, and show the cause and a proposed diff with a share link. No install, no sign-up, nothing written to their repository. Capped per visitor and per day.

### 3.5 Where each sponsor works

| Sponsor | Real job |
|---|---|
| **Vultr** | Hosts the whole backend: intake, worker, bot, database and the sandbox. The system cannot run without it. Paid from the $200 participant credit. |
| **Gnani** | Speaks the wake-up call in Hindi or English (Timbre text-to-speech), on Telegram and on the break-it page. |
| **AWS** | No job. Said plainly in the submission. |

Claude (Anthropic) does decisions and diagnosis. It is not a sponsor; we say so.

## 4. Low-level design

### 4.1 Repository layout

```
hackglobal/                     (this repository)
├── README.md                   setup, demo links, system design summary
├── docs/
│   ├── ARCHITECTURE.md         this file
│   └── DECISIONS.md            the rule table, in plain words, for judges
├── watcher/                    the backend (TypeScript, Node 22)
│   ├── src/
│   │   ├── intake/             envelope parsing, allowlist, masking
│   │   ├── pipeline/           grouping, decision, diagnosis, fix gate
│   │   ├── ai/                 Claude calls, schemas, spend ledger
│   │   ├── telegram/           bot, alerts, commands, voice
│   │   ├── github/             read files, sandbox pull requests
│   │   ├── web/                public API, owner pages, live feed
│   │   └── db/                 schema and queries
│   ├── config/projects.yml     critical flows, exam windows, caps
│   └── test/                   fixtures: real envelopes, hostile messages
├── sandbox/                    the Django twin "mini exam portal"
├── site/                       the public website (Next.js on Vercel)
└── deploy/                     Docker Compose, Caddy, backup script
```

Kept out of the repository: `.planning/`, `PAST-PROJECTS.md`, `.env` files.

### 4.2 Technology choices

| Part | Choice | Why |
|---|---|---|
| Watcher | Node 22, TypeScript, Hono (small web framework), better-sqlite3 | One language with the website; SQLite is enough for one box |
| Sandbox | Django 5 with sentry-sdk 2.71.0 | Same stack and SDK version as Faurus, so it doubles as staging |
| Website | Next.js on Vercel | Fast to build; Vercel gives the visitor's country header |
| Models | `claude-haiku-5-5` for decisions, `claude-sonnet-5-5` for diagnosis | The budget analysis: decisions cost under a tenth of a cent, a diagnosis about 14 cents |
| Voice | Gnani Timbre text-to-speech, converted to OGG/Opus with ffmpeg | Telegram plays OGG/Opus as a voice note |
| Hosting | One Vultr instance, Docker Compose, Caddy for HTTPS | One box, automatic certificates, automatic restarts |

### 4.3 Intake

**Address.** The app's setting looks like `SENTRY_DSN=https://<project_key>@<watcher-domain>/<project_id>`. The SDK then posts to `POST /api/<project_id>/envelope/`, with the key in the `X-Sentry-Auth` header.

**Envelope.** Newline-separated JSON: one header line, then pairs of item-header and item-body lines. The body may be gzip-compressed. We keep only items of type `event`; we drop `transaction`, `session`, `attachment` and all others, and answer 200 so the SDK stays quiet. Checked on 13 Nov with a real sentry-sdk 2.71.0 client: path `/api/<project_id>/envelope/`, `Content-Encoding: gzip`, key in `X-Sentry-Auth` as `sentry_key=…`, item headers carry a byte `length` (parse by length when present). Frames include local variables (`vars`) by default even with `send_default_pii=False`, so dropping `vars` at intake is required, not optional.

**Allowlist.** From each event we keep only:

| Kept | Notes |
|---|---|
| `event_id`, `timestamp`, `level`, `platform`, `release`, `environment` | |
| Exception type and message | Message masked, cut to 500 characters |
| Stack frames: `filename`, `abs_path`, `function`, `lineno`, `in_app`, `context_line` and up to 5 lines before and after | Local variables are dropped |
| `transaction` (the route name) | |
| Allowlisted tags: `jr_session`, `jr_flow`, `jr_exam` | Our own sandbox tags only |

Everything else is dropped: request URL, query, body, headers, cookies, user, IP, breadcrumbs, contexts, extra.

**Masking** runs on every kept string: email addresses, phone numbers, IP addresses, JWTs, long hex or base64 strings (tokens), `key=value` pairs whose key looks secret, and URLs (query strings removed).

**Limits.** Events over 200 KB are refused. Each project key has a rate limit (default 60 events a minute, then sampled). Unknown keys get a 403.

### 4.4 Grouping

```
fingerprint = sha1(project_id, exception_type, top_in_app_frame.module, top_in_app_frame.function, transaction)
```

The message is not in the fingerprint, because it often contains changing values. A new fingerprint opens an incident; a repeat increases its count and updates `last_seen`. An incident quiet for 6 hours is closed; a new hit reopens it as a "regression".

### 4.5 Decision layer

**Facts code knows (no model):** critical flow (route matches the project's critical patterns), exam window open, owner away, hits in the last 10 minutes, new or reopened, learn mode on, a startup failure (no route, boot-time error; `startupFailure` in decide.ts), a release first seen in the last 30 minutes, blocked hostile traffic (see "Blocked scans" below).

**Questions to Claude Haiku**, answered five times each with a JSON schema. For each question the majority answer counts; the vote share is shown as "4 of 5, uncalibrated".

| Id | Type | Question | Answers |
|---|---|---|---|
| `is_noise` | yes/no | Is this something other than a defect in the product's own code or setup (a crawler, a browser extension, a dropped connection)? | yes, no |
| `severity` | scale | Judged only from the evidence, how badly does this stop real users? | 0 cosmetic, 1 minor, 2 feature degraded, 3 core flow blocked, 4 outage or data loss |
| `category` | choice | What kind of fault is it? | code defect, unhandled input, external service, database, configuration or deploy, capacity or timeout, unknown |
| `user_blocked` | yes/no | Does the failing request stop the user finishing what they tried? | yes, no |
| `suggested_action` | choice | Which action fits best? (cross-check only; code decides) | ignore, log, notify, wake, propose fix |

**Rules, applied in order (the first match wins):**

| # | When | Action |
|---|---|---|
| 1 | Learn mode is on, or the fingerprint was marked as old backlog | log |
| 12 | Blocked hostile traffic: the incident is a scan burst (see below) | log (one quiet summary per burst) |
| 11 | No request route, a boot-time failure (`ImproperlyConfigured`, `ImportError`/`ModuleNotFoundError`, a refused connection raised from settings/wsgi/asgi/manage/app factory/`__init__`, or module-level code in such a file) **and** 2 or more hits in 10 minutes or a release first seen in the last 30 minutes: the app fails to start | **wake** |
| 2 | Critical flow failing while an exam window is open | **wake** |
| 3 | Critical flow failing, with 3 or more hits in 10 minutes | wake if away, otherwise notify |
| 4 | Critical flow failing | notify |
| 5 | `is_noise` is yes (4 or 5 votes) and severity is 1 or below | ignore |
| 6 | Severity 4 | **wake** |
| 7 | Severity 3, or `user_blocked` yes | notify |
| 8 | Severity 2 | notify if not away; otherwise held for the morning digest |
| 9 | Everything else | log |
| 10 | Applied after 1 to 9: if the result is log or ignore but 5 or more different people hit it in the last hour | notify |

People are counted from a one-way hash of the SDK's user id (`jr_user`, HMAC with a server secret) or, on the demo, the visitor session; the id itself is never stored.

Rules 2 to 4 and 11 cannot be lowered by any model answer. Rule 11 is checked right after rule 1, then rule 12. Rule 10 never applies to rule 12 (a scanner's many addresses are not many people). If the model fails (8-second timeout, refusal, invalid answer, cap reached), it retries once and then the incident is treated as **notify**, never ignore. The alert says the decision was made by rules alone.

**Caps:** at most 3 wakes a night per project; after that, wakes become notifications with a note.

**Blocked scans (rule 12, `intake/scan.ts`).** On 16 Nov 2026 a scanner sent 2,734 requests in two minutes to Faurus's raw EC2 hostname, probing `/.env`, `/api/credentials`, `/api/keys`, Kubernetes secrets, GraphQL and Swagger. Django refused every one (`DisallowedHost`, 400), yet the per-path fingerprints made about 33 incidents and the model votes called 12 of them "blocks users": 12 Telegram messages at 2:40 am for an attack that was fully blocked. Now code recognises this before any model is asked:

- **What counts** (`classifyScan`): no signed-in user (the SDK sent no user id, email or username; an IP address alone does not count) **and** the app refused the request with a 4xx: a `DisallowedHost` whose Host is not one of the app's own (a bare IP, `localhost`, a cloud machine's default name such as `*.compute.amazonaws.com`, not a hostname at all, or anything outside the project setting `hosts` when it is set), or a `SuspiciousOperation`-family or plain refusal (`Http404`, `PermissionDenied`, `NotFound`, ...) on a path only scanners ask for (`.env`, `.git`, `credentials`, `keys`, `secrets`, `wp-admin`, `phpmyadmin`, `actuator`, `swagger`, `graphql`, ...).
- **What never counts:** any other exception (a crash is a 5xx: the app failed, so it goes the normal way, even on `/.env`), any signed-in user, a fatal event, and a `DisallowedHost` for one of the app's own hosts (that is a broken `ALLOWED_HOSTS`, and every visitor is blocked). With no `hosts` setting, a refused unknown domain is folded only when the path is a secret probe.
- **Grouping:** every such event within 10 minutes of the last one joins one incident (`scan:<project>:<start>`, shown as "Blocked scan on many paths"). Only its first event queues a decision; that decision is rule 12, rules-only, with no model call. Each event keeps its own path and exception type; sources are counted from the one-way user hash, never from an address (the allowlist already drops request data and IPs).
- **One quiet message at most:** once a burst has been silent for 10 minutes and has 50 or more events (`JR_SCAN_SUMMARY_MIN`), the owner gets one message delivered without sound: totals, the exception types, the most-probed paths, and, for refused Host headers, the tip to drop unknown hosts at nginx. Smaller bursts appear only in the 08:00 summary, which has a "blocked scans" line. We send after the burst ends, not at the threshold, so the numbers are final and the night stays quiet; it is silent because nobody needs to act.
- **Why rules may overrule the model here:** "no model answer can lower a critical alert" protects against a model hiding a real failure. Here the facts are certain and in the safe direction: the app itself refused the request and no signed-in person was involved, so nobody was blocked.

**Slow scans (`intake/slowscan.ts`).** On 16-17 Nov 2026 one Google Cloud address (34.97.115.29) sent about 11,000 requests to Faurus over ~20 hours, 500-2,000 an hour, through Cloudflare on the real domain and random `*.faurus.app` hosts, probing `/.env`, `/key.pem`, `/docker-compose.yml`, `/.git`, `/@fs/...`, `/api/fs/read` and GraphQL consoles. Every answer was the index page (200, the single-page-app fallback) or a 404, never an error, so nothing above saw it. Errors cannot show such a scan; the web server's access log can:

- **Input:** access-log lines (nginx/Apache "combined") sent to the log drain (`POST /logs/:id/:key`, section 4.15); `watcher/scripts/ship-access-log.py` follows a log file and posts new lines every 10 seconds.
- **What counts:** per client address, a sliding one-hour window of requests to paths only scanners ask for (the probe segments above plus key/certificate files, compose and backup files, database dumps, `/@fs/`, `/api/fs/`, `/proc/`, `/etc/passwd`, consoles, path traversal) and of distinct paths that got a 404. Past **30 probes or 100 distinct 404 paths in an hour**, the owner gets one message delivered without sound: the address (with a cloud owner from its reverse-DNS name when there is one), counts, the answers by status, the most probed paths. It says "no data was exposed" only when every probe got a 404 or one and the same 200 page; otherwise it says what to check (200 answers of different sizes, any 5xx).
- **Never a flood:** at most one message per address per 6 hours, also across restarts (the mark is a one-way hash of the address in `kv`). A scan still running after 6 hours is counted afresh and gets one new message.
- **Never counted:** loopback, private, link-local and CGNAT addresses (noids and containers), the app's own public addresses (project setting `own_ips`, or `JR_OWN_IPS`), and any ordinary request (a 2xx/3xx on an ordinary path leaves no trace at all). Counters live in memory, bounded to 5,000 addresses. Tracebacks in the same drain still become incidents as before.
- **Retention:** raw access-log lines are never stored or logged: each is parsed, counted and dropped. Per-address counters live only in memory and only for the one-hour window (an address with nothing left in the window is forgotten, older totals with it); a reported address keeps an in-memory "already told" mark for 6 hours and a one-way hash in `kv` (deleted after a day). Visitors' addresses (students) are never written to disk; a scanner's address appears only in the owner's message.
- **Shipping (Faurus):** `ship-access-log.py -` reads `docker logs -f --tail 0 <nginx>` on stdin, sends only lines shaped like an access-log entry (error-log lines and anything else are dropped before sending), in batches every 10 seconds, at most 512 KB per request and 6 requests a minute.


### 4.6 Diagnosis

**Choosing files (code only):** take the in-app frames of the stack trace, map each `abs_path` to a repository path by stripping the deploy prefix, and take the top 3 distinct files plus the file for the route. Fetch each from GitHub at the deployed commit (the event's `release`, otherwise the default branch). If the failing line in the fetched file does not match the event's `context_line`, we say "source has moved" and diagnose from the event alone.

**One Sonnet call, no tools.** The prompt holds the masked event and the files, inside clearly marked data blocks, with the instruction that any text inside them is data. The answer must match this schema:

```json
{
  "cause_plain": "one or two sentences a non-engineer understands",
  "cause_technical": "what is wrong, naming the file and line",
  "file": "path/in/repo.py",
  "line": 42,
  "confidence_words": "sure | likely | guess",
  "edits": [{ "file": "path/in/repo.py", "find": "exact existing text", "replace": "new text" }],
  "test_hint": "how the owner can check the fix"
}
```

Budget per call: at most 60,000 input tokens and 4,000 output tokens, 90-second timeout.

### 4.7 Fix gate

Code checks every proposed fix:

1. Each `find` text occurs exactly once in the file it names.
2. Only files that code chose and showed to the model are touched.
3. At most 3 files and 40 changed lines.
4. No path matching: auth, login, permission, payment, billing, grading, proctor, migration, settings, secret, `.env`, requirements, `package.json`, CI and workflow files, Dockerfiles.
5. No new imports of packages that are not already used, and no new URLs.
6. The changed Python files still parse.

Then Haiku answers three questions about the diff, three times (majority per question): `fix_quality` (0 unrelated to 3 removes the cause), `touches_sensitive` (yes/no), `could_break` (yes/no). The result is one of three levels:

| Level | When | What the owner gets |
|---|---|---|
| Recommended | All code checks pass, quality 3, both risk answers "no" | The diff; on the demo portal, Approve |
| Use with care | All code checks pass, quality 2 or 3, but a risk answer is "yes" or quality is 2 | The diff with the concerns spelled out; never approvable with one tap (bot and website both refuse) |
| Withheld | A code check fails (protected areas stay a hard rule), quality 1 or below, or the review cannot answer | The diagnosis without a fix, with the reason |

Why three levels: on JR-Bench, the first version (show only when every answer was clean) held back 10 of 16 fixes that our hidden tests showed were correct, mostly on literal "could break" readings of regression fixes. Hiding a correct fix leaves the owner with nothing at 2 am; showing it with the concern named keeps the owner in charge.

**Where an approved fix goes:**

| Project | What Approve does |
|---|---|
| Sandbox | New branch `jr/fix-<id>`, the edits re-applied to the code as it is now (refused if it has moved), a commit and a pull request with the plain-words cause. No merge. Uses a token limited to the sandbox repository. |
| Faurus | Nothing is written. The diff is shown in Telegram and on the owner page. The owner applies it. Our access to Faurus is read-only. |
| Paste-an-error | A diff with a share link. Nothing is written anywhere. |

### 4.8 Telegram bot

Long polling (the bot fetches its own messages), so there is no public webhook to forge. Only the linked owner's user id, in a private chat, can command or approve.

| Command or button | Does |
|---|---|
| `/start <code>` | Links this chat to a project, using a one-time code shown at setup |
| `/away`, `/back` | Away mode on or off; `/back` sends a digest of what happened |
| `/exam 2h` | Opens an exam window for 2 hours (also read from the project config) |
| `/status` | Open incidents and today's spend |
| `/pause`, `/resume` | Stops or restarts all model calls, fixes and wakes at once |
| `/learn 2h` | Learn mode: store and group only, no alerts or model calls; everything seen is marked as old backlog |
| Buttons on an alert | Why (the decision log), Show fix, Approve (sandbox only), Acknowledge, Right / Wrong, Open page (signed link) |

**Alert card**, edited in place as the pipeline moves:

```
🔴 WAKE · faurus · code submission failing
6 hits in 2 min · exam window open
Rule 2: critical flow during an exam · votes 5/5 (uncalibrated)
Cause: <added when diagnosis arrives>
Fix: <added after the gate> [Show fix] [Right] [Wrong]
```

**Wake:** the alert, then a voice note, then a fresh ping every 2 minutes, up to 3 times, until the owner taps Acknowledge. A voice note cannot ring through a silenced phone; we say so.

### 4.9 Voice (Gnani)

Code writes the spoken text from the flow name and counts, never from error text, so no personal data reaches the voice provider. Example: "JaagteRaho alert. Code submission is failing on Faurus. Six failures in two minutes, during an exam." The Hindi version is a fixed template. The audio is converted to OGG/Opus with ffmpeg and sent with `sendVoice`. It is also cached as a file for the break-it page.

### 4.10 Database (SQLite)

| Table | Main columns |
|---|---|
| `projects` | id, name, public_key, kind (faurus, sandbox, paste), repo, repo_access (read or sandbox-write), owner_chat_id, settings JSON |
| `events` | id, project_id, fingerprint, received_at, release, environment, level, exception_type, message_masked, frames JSON, transaction, tags JSON |
| `incidents` | id, project_id, fingerprint, status (open, closed, backlog), first_seen, last_seen, hits, reopened_count, telegram_message_id |
| `decisions` | id, incident_id, facts JSON, votes JSON, rule_number, action, engine (claude or rules-only), created_at |
| `diagnoses` | id, incident_id, model, input_tokens, output_tokens, cost_usd, result JSON, source_moved, owner_verdict (right, wrong, none), created_at |
| `fixes` | id, diagnosis_id, diff, gate_result JSON, status (shown, rejected, approved, merged), pr_url, commit_sha |
| `spend` | id, at, model, purpose, input_tokens, output_tokens, cost_usd |
| `visitors` | session_id, first_seen, country, name_or_handle, runs_live_app, consent |
| `visits` | id, session_id, flow, exam_on, incident_id, timings JSON (alert, cause, fix seconds) |
| `owners` | chat_id, user_id, project_id, linked_at, away, paused |

Raw events are deleted after 30 days. `/forget` deletes a visitor's row on request.

### 4.11 Spend guard

Every Claude response's usage is written to `spend` with its cost. Before every call, code checks:

| Limit | Value |
|---|---|
| Sonnet diagnoses per day, all projects | 80 (Faurus's first day: 5) |
| Live diagnoses per sandbox fault per day | 15, then stored replays |
| Paste-an-error diagnoses | 3 per visitor, 6 per network address and 30 in total, per day |
| Break-it runs | 6 a minute per visitor, 30 an hour per network address, 240 an hour in total |
| Fix proposals per day | 3 per project |
| Total spend $40 | Haiku only from then on |
| Total spend $45 | No model calls; rules only |

Identical errors are grouped before any model call, so one bug hitting 500 users costs one diagnosis. Limits were raised on 13 Nov after measuring a diagnosis at about $0.01, not the $0.14 estimated.

### 4.12 Public API and website

**Public API (watcher, read-only):**

| Endpoint | Returns |
|---|---|
| `GET /public/feed/:session` | Server-sent events for one visitor's run: error, decision, voice, cause, fix, fixed |
| `POST /public/break` | Starts a run: flow, exam on/off, session id. The watcher calls the twin itself; the twin is not public |
| `POST /public/approve` | Switches only this visitor's session to the fixed build for that flow |
| `POST /public/sign` | Optional name or handle, country, "runs a live app" |
| `POST /public/paste`, `GET /public/paste/:id` | Paste-an-error diagnosis and its share link |
| `GET /public/evidence` | Aggregates only: runs, median seconds to alert, cause and fix, decisions, Right/Wrong tally, visitors by country, and what JaagteRaho found in itself |
| `GET /public/voice/:id` | The wake-up call, as OGG or MP3 |

Faurus's own failure counts are never public.

**Website pages:** landing (pitch, the 30-second clip, links), `/break` (the sandbox loop), `/paste` (paste-an-error), `/evidence` (measured numbers), `/privacy` (the data note).

**Owner page** (`/owner/incident/:id`) lives on the watcher, opened only through a link signed with HMAC-SHA256 and valid for 30 minutes, sent in Telegram. Read-only: facts, Claude's votes, timeline, cause, the fix or why it was withheld, the stack. Every action stays in Telegram.

### 4.14 Self-watching

JaagteRaho is registered as its own project (`jaagteraho`), with its source as a local repository. Unhandled rejections, uncaught exceptions, HTTP handler errors, failed jobs and failed wake-up calls are turned into events (V8 stacks parsed into frames) and stored through the same `storeEvent` path, so they are grouped, decided, diagnosed and sent to the owner like any app's errors. A failure while handling one of its own incidents is never re-reported, so it cannot loop. The fix gate checks TypeScript syntax with the TypeScript 5 parser.

### 4.13 Sandbox twin

A small Django 5 app styled as an exam portal, with sentry-sdk 2.71.0 and a copy of Faurus's scrubber.

| Flow | Planted fault (broken build) | Critical? |
|---|---|---|
| Submit code | A `KeyError` when the submission has no language field | Yes |
| Start exam | A timezone comparison error for an exam starting today | Yes |
| Pay fee | A `ZeroDivisionError` in a discount calculation | Yes (payment) |

Buttons only, no free-text input, so visitors cannot inject text. Two builds run side by side: `broken` (from the main branch) and `fixed` (from a branch holding fixes the owner approved earlier).

### 4.15 Onboarding: three ways in

1. **Setup command** (`cli/`, published as `jaagteraho`): `npx jaagteraho init [--dsn …]`. Detects Django, Flask, FastAPI, Express (CommonJS or ES modules) or Next.js; shows every change before writing; adds the open-source Sentry SDK and an init block marked with a comment (the DSN is written in code with `SENTRY_DSN` able to override it, because the DSN is not a secret and many apps do not load `.env`); sets Flask to report URLs so `/critical` routes match; picks npm, pnpm, yarn or bun from the lock file; runs twice without changing anything; then sends a test error. Without `--dsn` it registers the app through `/public/connect` and shows the Telegram link as a QR code.
2. **Telegram first:** `/new name [repo]` creates the app owned by that chat (no website), replies with the setup command, the DSN and the logs address.
3. **No code (log drains):** `POST /logs/:id/:key` accepts plain text, JSON (array or one object per line, `message` field, request path from `proxy.path`) and Heroku logplex. A per-stream assembler finds Python tracebacks (including chained ones) and Node.js stacks, also when split across deliveries; each becomes an event through the same allowlist-shaped record; the event id is a hash of the trace and the minute, so drain retries count once; every other line is dropped unread.

A test error (`jr_test` tag) closes its incident at once and sends "✅ connected" without any model call; the first real error from an app also announces the connection; `/start` after the fact says how many errors already arrived.

### 4.16 Accounts and free credit

The Telegram account is the user account. Each gets `JR_FREE_CREDIT_USD` (default $5) for diagnoses and fixes on outside apps; deciding and alerting continue for free when it runs out. Every model call runs inside an `AsyncLocalStorage` context carrying its app id, so the spend ledger records which app each call was for; credit used is the sum over the account's outside apps. Limits: 3 apps per account, 10 new outside apps a day, 5 diagnoses per app per day. Our own apps (Faurus, the demo, JaagteRaho itself) never use credit. No payments are taken.

### 4.17 Read-only GitHub App

For private repositories. Permissions: Contents read and Metadata read, nothing else. `/github` sends an install link with a signed, 30-minute `state` (app id + Telegram user). GitHub returns to `/github/setup` with the installation id and an OAuth code; the code is exchanged for a user token and the installation must appear in that user's own installations, so nobody can attach someone else's installation to their app. Installation tokens are minted per use (one hour, scoped to read) and cached until 10 minutes before expiry. If the installation covers several repositories, `/repo owner/name` picks one.

### 4.18 Better diagnosis input

- **Imported files:** besides up to 3 files from the stack trace, code adds up to 2 files that the failing functions import and actually use (Python `from … import`, `import …`; JavaScript `import … from` and `require`), skipping installed packages and files over 600 lines. They are marked as not in the stack trace. Measured on/off with `JR_RELATED_FILES=0`.
- **Lookups beyond the stack trace:** when the repository's code can be read (the GitHub tarball at the release, or the local folder), the diagnosis gets a code-picked map (where the failing code's callees are defined, where the error's text appears) and three read-only tools: `find_definition`, `search_code`, `read_lines`. At most 3 rounds and 8 lookups; prompt caching keeps a round near $0.005. Files it reads join the files the fix gate checks edits against. Off with `JR_DIAGNOSIS_LOOKUPS=0`. Measured in `watcher/eval/NOTES-lookups.md`.
- **Last change:** for GitHub repositories, the commit that went live just before the incident began (the release, if it is a commit hash; otherwise the newest commit on the default branch before the first error, within 3 days), its author, message and files, and which of them are in the stack trace. Shown on the alert ("Began 20 min after commit abc1234 … which changed quiz/views.py") and given to the diagnosis as a clue, fenced as data.
- **Tracebacks:** the paste parser also reads IPython/Jupyter tracebacks and pytest `INTERNALERROR>` output.

### 4.19 Fix proof

The diagnosis also writes a small regression test. On the demo portal only, a fix that passed the gate is proved: the test must fail on a throwaway copy of the current code and pass on a copy with the fix. The card and the break-it page show "proved by a test"; a test that ran but did not prove the fix turns a recommended fix into "use with care". Outside apps' code is never run.

Two layers protect the server, because the test is model-written:

1. **Syntax-tree check.** Imports are an allowlist (the code under test; `unittest` without `mock`; `datetime`, `decimal`, `fractions`, `math`, `re`, `collections`, `zoneinfo`, `json`; from Django only `django.test` and `django.utils.timezone`). No name or attribute may start with `_` (except `__name__`), so `__builtins__`, `__class__` and the like are closed. No standard-library module outside the allowlist may be named anywhere, whether imported, re-imported from another module or reached as an attribute. No decorators, `type`, `getattr`, `open`, `exec`, `eval`, `import_string` and similar.
2. **Operating-system limits**, set inside the test process before the test is imported: no new processes (`RLIMIT_NPROC` 0, so `subprocess` and `os.system` fail even if layer 1 were bypassed), files up to 1 MB, 1 GB of memory, 15 s of CPU, a 20 s wall-clock limit with SIGKILL, a clean environment with no secrets, and a throwaway copy of the code.

An independent review of the first version found three ways around layer 1 (`__builtins__[...]`, Django's `import_string`, `unittest.mock`'s re-exported `pkgutil`); all three are now refused and kept as regression tests, and layer 2 was added. What would make this stronger still: running the test in its own container with no network and a read-only file system. The risk today is small, because only the demo portal's planted faults (triggered by buttons, never by visitor text) reach this step.

### 4.20 Morning summary

At 08:00 India time (sent between 08:00 and 12:00 so a restart in the evening sends nothing stale), each owner gets one message about the last 10 hours: errors, what woke them, what was logged or ignored, the most frequent incidents, fixes proposed and withheld, and the diagnosis cost for their own apps only. `/back` sends the same summary for the time away.

### 4.21 Measurement

- `npm run eval:real`: 30 real bugs from 17 public Python projects, plus 12 more with the cause outside the traceback (`-- --cases real-bugs-new.json`) (traceback as posted on GitHub, scored against the lines the merged fix changed), run exactly as the paste page runs.
- `npm run bench`: JR-Bench, 7 generated sample apps (six Python apps of 21 to 101 files, one Node.js app of 30) with 20 planted bugs and 4 noise errors. Each bug is planted into clean code and triggered for real; JaagteRaho decides, diagnoses, gates and proves; a hidden test it never sees judges the fix. `--validate` checks every case for free first.

## 5. Connecting Faurus safely

In order, each step only after the last one passes:

1. **Read-only checks:** sentry-sdk version in the running image, which containers read the environment file, whether trace sampling can be set to zero, the exam calendar. Take a database backup.
2. **Twin first:** prove on the sandbox that events arrive allowlisted, and that a stopped or slow intake does not slow the app.
3. **Staging or local Faurus:** set `SENTRY_DSN`, trigger one test error, read what arrives, tighten the allowlist. Add one line to Faurus's privacy page naming JaagteRaho and Anthropic (United States).
4. **Production, backend and workers only, learn mode:** in a window with no exam or contest within 12 hours (first choice Sat 14 Nov 07:00 to 08:30 IST). Tracing off. Restart only those services through the normal deploy. The database container is not restarted.
5. **Rollback, rehearsed on the twin:** if response times, error rates or worker health get worse within 15 minutes, unset the setting and restart the same services. The intake can also refuse Faurus's key at once.
6. **Learn for two hours:** everything seen is marked as old backlog. Then live alerts to the owner only, at most 5 diagnoses on the first day.
7. **Fixes are diffs only,** read from a read-only token at the deployed commit.

Faurus's front ends are not connected this weekend; exam.faurus.app never is.

## 6. Security summary

| Threat | Control |
|---|---|
| Hidden instructions in error text steer the model | The model has no tools; text is fenced as data; code picks the files and checks every edit; sensitive paths are blocked; browser events never reach a model |
| A leaked GitHub token is used to push code | Faurus token is read-only; the sandbox token covers only the sandbox repository; no outsider tokens are stored |
| Personal data leaks | Allowlist and masking before storage, model calls, Telegram and public pages; raw events deleted after 30 days |
| Fake events burn the budget | Per-key rate limits, grouping before any model call, daily caps, spend ceiling |
| Someone else controls the bot | Owner's user id checked on every command; private chat only; long polling, no webhook |
| Owner pages exposed | Signed links valid for 15 minutes |
| The watcher harms Faurus | Intake answers instantly; the SDK sends in the background; rollback rehearsed; no credentials for Faurus servers |

## 7. Deployment

One Vultr instance (2 vCPU, 4 GB; region nearest India that is offered), Docker Compose:

| Service | Purpose |
|---|---|
| `caddy` | HTTPS for the watcher and the sandbox, automatic certificates |
| `watcher` | Intake, worker, bot, public API, owner pages (one process) |
| `sandbox-broken`, `sandbox-fixed` | The two twin builds |
| `backup` | Nightly copy of the SQLite file |

Domains (to be chosen): `api.<domain>` for the watcher, `twin.<domain>` for the sandbox, the website on Vercel at `<domain>`.

Secrets live only in the server's `.env` and in Vercel's settings: Anthropic key, Gnani key, Telegram bot token, two GitHub tokens, the link-signing secret.

## 8. Build order and gates

Times are IST. A gate is a check that must pass before the next stage starts.

| By | Gate | If missed |
|---|---|---|
| Fri 13 Nov 10:00 | Keys working (one real Claude call under a spend limit), Vultr instance up, the design mock approved | No feature code until done |
| Fri 13 Nov 13:00 | **G1:** a real error from sentry-sdk 2.71.0 in the twin arrives at our intake, allowlisted and grouped | At 16:00 switch the sandbox to our own simple reporter; Faurus is not connected this weekend |
| Fri 13 Nov 15:00 | Intake and twin live on Vultr over HTTPS | Deploy before sleeping |
| Fri 13 Nov 24:00 | **G2:** all three faults get the right file and line, a plain cause, a valid fix and different decisions, with Telegram alerts | Fix for one fault only; cut the evidence page |
| Sat 14 Nov 07:00 | Faurus backend connected in learn mode, if G1 passed and no exam is near | Second window Sat 22:30; otherwise not this weekend |
| Sat 14 Nov 12:00 | **G3, core freeze:** from a phone on mobile data, the public loop runs three times in a row. Record a backup video at once | Reliability only until it passes; no outreach |
| Sat 14 Nov 18:00 | Full freeze: voice, evidence page and paste-an-error done or cut | Unfinished items are cut |
| Sun 15 Nov 08:00 | Final recording, README, write-up; at least $10 of credit left; overnight unattended test passed | Submit with the best recording so far |
| Sun 15 Nov 10:00 | **Submitted** on Vultr Community | Latest 11:30 |

Cut order if time runs short: voice note, then the evidence page, then the Faurus connection.

## 9. What we will not claim

"First" or "only"; "works on every codebase"; Faurus's accounts as JaagteRaho's users; "free"; any accuracy figure except the owner's Right/Wrong tally; "safe", "secure" or "self-healing"; any partner logo. We say "accepts events from the open-source Sentry SDKs, not affiliated with Sentry".

## 10. Open questions for Anant

1. **Domain:** do you have one for JaagteRaho, or should we use a subdomain such as `jaagteraho.faurus.app`?
2. **Vultr:** is your account active with the $200 gift code applied?
3. **GitHub:** public repository name (`AVPthegreat/jaagteraho`?), and a second public repository for the sandbox twin.
4. **Faurus exam calendar:** answered: no exams over Diwali, so Faurus can be connected any day.
5. **Telegram:** answered: `@hackglobal_jaagte_raho_bot`.
6. **Voice key:** answered: Gnani (key in `.env`), named as the voice provider in the submission.
