# JaagteRaho

**An AI night watchman for a live app.** When your app breaks at 2 am, JaagteRaho decides whether it is worth waking you, tells you in plain words why it broke, and has a checked fix waiting for your approval.

Built for HackGlobal 2026 (Track 01, Agentic and GenAI apps) by Anant Vardhan Pandey, who runs [Faurus](https://faurus.app), a coding and exam platform used by colleges, alone.

- **Live demo:** _link added at deployment_ — break a demo exam portal and watch the whole loop
- **Paste your error:** _link added at deployment_ — diagnose a Python or JavaScript error from your own public repository
- **Connect your app:** _link added at deployment_ — one command, or `/new` in Telegram
- **Evidence:** _link added at deployment_ — every number below, measured
- **System design:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## The problem

Students and solo founders now run live products, but nobody watches them after launch. Faurus's server errors went to a log nobody read; if it failed during a live exam, I heard about it from a student. Error trackers collect errors, but one person still has to decide which ones matter, find the cause and fix it, usually at night.

## How a founder uses it

1. **Connect (two minutes).** Send `/new myapp` to the Telegram bot, or use the website's Connect page. Then, in the project folder:
   ```bash
   npx jaagteraho init --dsn <the address it gives you>
   ```
   The command finds Django, Flask, FastAPI, Express or Next.js, shows every change before writing it, adds the free open-source Sentry SDK and two lines, and sends a test error. A ✅ arrives on Telegram. Deploy as usual.
   No code at all? Point your host's log drain at the logs address instead; JaagteRaho picks out Python and Node.js errors and drops every other line.
2. **Sleep.** JaagteRaho wakes you (Telegram message plus a voice note in Hindi or English, repeated until you tap Acknowledge) only for what matters: a critical route failing during an exam, an outage, an error hitting many people. Everything else waits for the 08:00 summary.
3. **Fix.** The alert says what broke for users, why, which file and line, which recent commit probably caused it, and shows a small fix that passed six code checks and a review. On the demo portal the fix is also proved by a test that fails before and passes after.

Every Telegram account gets $5 of free AI credit (about 500 diagnoses); deciding and alerting are always free. `/github` gives read-only access to a private repository. JaagteRaho never writes to your code: fixes arrive as diffs, and on the demo portal Approve opens a pull request that a person merges.

## What happens to each error

```mermaid
flowchart LR
  A["Your app<br/>(Sentry SDK, or log drain)"] --> B["Intake<br/>allowlist + masking"]
  B --> C["Group repeats<br/>into incidents"]
  C --> D["Claude Haiku answers<br/>fixed questions, 5 votes"]
  D --> E{"Rules in code<br/>decide"}
  E -- "ignore / log" --> F["Logbook +<br/>08:00 summary"]
  E -- "notify / wake" --> G["Telegram alert<br/>+ voice wake-up"]
  G --> H["Claude Sonnet: cause in plain words,<br/>last commit, fix + test"]
  H --> I["Fix gate: 6 code checks<br/>+ Claude review"]
  I --> J["Recommended / use with care /<br/>withheld"]
```

- **Decide.** Claude answers fixed questions about each new error five times (is it noise, how severe, is a user blocked). Rules you can read in [`decide.ts`](watcher/src/pipeline/decide.ts) choose the action. A failed submission during a live exam always wakes you; a cosmetic bug waits; an error that hit 5 or more people in an hour is never silent. No model answer can lower a critical-flow alert, and a failed model call means "notify", never "ignore".
- **Explain.** Claude reads the files in the stack trace plus the files those functions import and use, and the commit that went live just before the error began.
- **Check the fix.** Six code checks (exact match, only files it was shown, at most 3 files and 40 lines, no protected areas such as login, payments or grading, no new packages or URLs, still valid code), then a Claude review. A fix every check agrees with is *recommended*; one the reviewer has concerns about is shown as *use with care* with the concerns spelled out and can never be approved with one tap; one that fails a code check or does not remove the cause is withheld.

## Measured

Every number is produced by a script in this repository. Measured 13 Nov 2026.

**30 real bugs from 17 open-source Python projects** ([`watcher/eval`](watcher/eval)): tracebacks people posted on GitHub (requests, Flask, pip, pytest, Celery, black and others), scored against the lines the real, merged fix changed. JaagteRaho reads the code as it was before the fix and never sees the real fix.

| | Result |
|---|---|
| Bug in a file from the traceback: right file | 20 of 20 (100%) |
| Bug in a file from the traceback: right lines (±3) | 16 of 20 (80%) |
| Cause outside the traceback: right file | 2 of 9 (22%); 3 of 9 when also shown the files the failing code imports and calls |
| Cost per diagnosis | about $0.03 (these are large library files) |

Our weak spot is a cause in a file the traceback never mentions, deep inside a large library.

**JR-Bench: 20 planted bugs and 4 noise errors in 7 sample apps** ([`bench`](bench)): six Python apps of 21 to 101 files and one Node.js app. Each bug is planted as if a commit introduced it and triggered for real; a hidden test JaagteRaho never sees judges the fix.

| | Result |
|---|---|
| Real bugs that reached the owner | 20 of 20 |
| Noise (dropped connection, favicon, bot scanner, planned restart) kept quiet | 4 of 4, at about $0.0005 each |
| Exam-time bugs on a critical route that woke the owner | 3 of 3 |
| Proposed fix works (hidden test passes) | 20 of 20 |
| Fixes shown to the owner | 19 of 20: 14 recommended, 5 "use with care"; the one withheld is in a payments module (a hard rule) |
| Fixes shown to the owner that were wrong | 0 |
| Claude's own regression test agreed with the hidden test | 14 of 14 that ran |
| Median time: decision / fix ready | 1.6 s / 11.7 s |
| Cost per error (decision + diagnosis + fix review) | about $0.013 |

What the benchmark changed: the first fix gate showed a fix only when every review answer was clean, and held back 10 of 16 fixes that were in fact correct. The three-level gate shows 15 of the same 16, still with none wrong.

**A real Node.js app:** an Express app connected with `npx jaagteraho init` (real `@sentry/node`); its `TypeError` was decided ("notify: blocks users"), diagnosed at `server.js:10` in plain words for $0.011, and a correct fix reached the gate.

**Live demo and safety** (local testing): error to alert / cause / fix 1.6 s / 6.0 s / 9.5 s median on the demo portal; the watched app is slowed by about 1 ms, only on requests that already fail, whether JaagteRaho is up, down or hanging ([rehearsal](sandbox/REHEARSAL.md)).

## Screenshots

| A visitor breaks "Submit code", approves the fix, and it works | On a phone: the exam fix is shown "use with care" |
|---|---|
| ![Break-it page after a run: error, WOKE OWNER stamp, voice note, cause, fix proved by a test, approved, flow works again](docs/images/break-it-run.png) | ![Phone view: the exam fix shown with the reviewer's concern and no one-tap approve](docs/images/phone-fix-care.png) |

| Connect: one command, by hand, or no code | Evidence: every number measured |
|---|---|
| ![Connect page after connecting: Telegram button, setup command, DSN, logs address](docs/images/connect.png) | ![Evidence page with live counts, the real-bug results and JR-Bench](docs/images/evidence.png) |

| The owner's logbook entry (signed link from Telegram) | Share card |
|---|---|
| ![Logbook page: facts, Claude's five votes, timeline, cause, fix, stack](docs/images/owner-logbook.png) | ![Share card](docs/images/share-card.png) |

## Safety by design

| Risk | What JaagteRaho does |
|---|---|
| Secrets and personal data in errors | Only an allowlist of fields is kept: no request bodies, query strings, headers, cookies, user details, IP addresses or local variables. Emails, phone numbers, tokens and keys in what remains are masked. People are counted only through a one-way hash. Log drains: every line that is not part of a stack trace is dropped unread. |
| Hidden instructions inside error text | The model has no tools; error text and commit messages are fenced as data; code picks the files and checks every edit; visitors can only press buttons. |
| Write access to your code | None for real apps: fixes arrive as diffs, and the GitHub app is read-only. On the demo portal, the owner's Approve opens a pull request; merging is always done by a person. |
| Running code | Outside apps' code is never run. On the demo portal only, the model's regression test runs in a throwaway copy after a strict check (no files, network, processes or environment). |
| Runaway cost | Identical errors are grouped before any model call; per-app and daily caps; $5 free credit per account; Haiku-only after $40 and no model calls after $45. |

## It watches itself

JaagteRaho runs its own code through the same pipeline. Its crashes and failed jobs become incidents in a project called `jaagteraho`, decided, diagnosed against its own source and sent to the owner on Telegram.

On 13 Nov we sent malformed input to every public endpoint. JaagteRaho caught four crashes in itself (a `null` request body, a name sent as a number, a traceback sent as a number, a repository link sent as a list), explained each one in plain words with file and line, and proposed four fixes that passed its own fix gate. We applied three of them exactly as written (the fourth overlapped another) and added regression tests for all four. The real-bug set then showed the paste page could not read Jupyter or pytest tracebacks; that was fixed too.

## How it differs

Sentry, PostHog and others diagnose errors for paying teams; Reticle and similar tools verify an AI agent's change in development before it ships. JaagteRaho is the part after deploy, for one person: it watches real users' errors at night, decides with readable rules whether to wake you (exam-aware), explains in plain words on Telegram, and hands over a fix with its checks and, where it can, a test that proves it.

## What it runs on

- **Vultr (hackathon sponsor):** the backend (intake, worker, Telegram bot, database and the demo portal) runs on a Vultr Compute instance.
- **Claude through Anthropic's API:** decisions and fix review (Claude Haiku 5.5) and diagnosis (Claude Sonnet 5.5).
- **Gnani:** speaks the wake-up call in Hindi or English (Timbre text-to-speech), sent as a Telegram voice note.
- **Telegram** for alerts, **Vercel** for the website.

## Repository

| Folder | What it is |
|---|---|
| [`watcher/`](watcher) | The backend: intake (SDK and log drains), decision rules, diagnosis, fix gate and proof, Telegram bot, GitHub app, public API (TypeScript, Hono, SQLite) |
| [`cli/`](cli) | `npx jaagteraho init` and `test`: connects an app in one command |
| [`sandbox/`](sandbox) | The demo exam portal with three faults planted on purpose (Django, sentry-sdk 2.71.0) |
| [`bench/`](bench) | JR-Bench: 7 generated sample apps (6 Python, 1 Node.js), planted bugs with hidden tests, results |
| [`site/`](site) | The public website: break-it page, paste-your-error, connect, evidence (Next.js, Vercel) |
| [`deploy/`](deploy) | Docker Compose and Caddy for the Vultr server, the deployment guide and a 20-check smoke test |
| [`docs/`](docs) | Architecture (high- and low-level design) |

## Run it locally

Requires Node 20.12+ and Python 3.12+.

```bash
# 1. Watcher
cd watcher
cp .env.example .env          # add your Anthropic key and Telegram bot token
npm install
npm test                      # unit, pipeline and end-to-end tests
npm run project:add -- sandbox sandbox local:$(cd ../sandbox && pwd)
npm run dev                   # http://127.0.0.1:8787

# 2. Demo portal (two builds)
cd ../sandbox
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
SENTRY_DSN=<printed DSN> .venv/bin/python manage.py runserver 127.0.0.1:8001
# the fixed build: apply fixed.patch to a copy and run it on port 8002

# 3. Website
cd ../site
cp .env.example .env.local
npm install && npm run dev    # http://localhost:3000

# 4. Measurements (spend real API credit; each stops itself at a small budget)
cd ../watcher
npm run bench -- --validate   # free: checks every JR-Bench case is sound
npm run bench                 # about $0.32
npm run eval:real             # about $1
npm run bench:publish         # copies the numbers to the website
```

Send `/start <link code>` to your Telegram bot to receive alerts. Deployment: [deploy/README.md](deploy/README.md).

## What we do not claim

JaagteRaho is not the first tool to diagnose errors or propose fixes. It is tested end to end on Django and Flask with sentry-sdk 2.71.0 and on Express with @sentry/node 11.12, and its setup command on sample Django, Flask, FastAPI, Express and Next.js apps; Next.js and FastAPI have not been run end to end with a live error yet. Model vote shares are not calibrated probabilities. The benchmark apps are generated and small; the real-bug set is 30 cases. The accuracy figures above are what these runs measured, nothing more.

## How this was built

Work began on 12 November 2026, before the hack window, with the organisers' written permission. The code was written with Claude Code, directed and tested by Anant. Faurus itself is not part of this submission; it is the live app JaagteRaho watches.
