# JaagteRaho

**The on-call engineer you can afford.**

**Your app breaks at 2 am. Small bugs fix themselves. Serious ones ring your phone. You approve, or let it heal under your rules.**

**Measured on 70 planted bugs, mistakes counted:** 70 of 70 reached the owner · 62 of 70 fixed and proved by a hidden test the AI never saw (89%) · about 1.7 s to decide, 11 s to a fix · **$1.19 of AI for all 70** (about ₹1.4 a bug). [How each number was measured](#measured).

- **Play with it (no sign-up):** [Live Playground](https://jaagteraho.139-84-156-94.sslip.io/playground): 7 live apps, 70 planted bugs. Pick one, press the app's own button, watch it break, approve the fix, press it again.
- **Website:** [jaagteraho.139-84-156-94.sslip.io](https://jaagteraho.139-84-156-94.sslip.io) · **Evidence:** [/evidence](https://jaagteraho.139-84-156-94.sslip.io/evidence) · **API:** [jr-api.139-84-156-94.sslip.io](https://jr-api.139-84-156-94.sslip.io/health)
- **Video (90 s):** <VIDEO_90S>
- **System design:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

Hosted on Vultr (Bangalore). Built for HackGlobal 2026 (Build with AI track; 14–15 Nov 2026, organised by Polaris School of Technology, powered by Vultr) by Anant Vardhan Pandey.

<!-- Demo GIF: replace with docs/images/demo.gif once recorded (Playground run: pick a bug, real 500, cause, fix, approve, real answer, Undo). -->
![Demo GIF placeholder: a visitor breaks Submit code on the demo exam portal, JaagteRaho wakes the owner, explains the cause and the approved fix makes it work again](docs/images/break-it-run.png)

## Problem

- **Apps are now built by people with nobody on call.** Over 5 million new business applications are filed in the US every year ([US Census Bureau, Business Formation Statistics](https://www.census.gov/econ/bfs/index.html)); freelancers, startups and college tech teams ship live products with AI help, and nobody watches them at night.
- **Downtime costs real money.** 1 in 4 small businesses say one hour of downtime costs them $10,000 to $20,000, and 37% have lost customers to it ([Infrascale survey of 500+ SMB executives, 2020](https://www.helpnetsecurity.com/2020/05/14/unexpected-downtime/)).
- **Error trackers only collect.** They don't decide which error is worth waking a tired person for, find the cause or write the fix. For one person running a live product, that is the whole job, and it happens at night.
- **I live it.** I run [Faurus](https://faurus.app), a coding and exam platform colleges use: about 11,000 accounts and one engineer, me. Its errors went to a log nobody read; if an exam broke at 2 am, a student told me the next morning.

## Solution

JaagteRaho (Hindi for "stay awake", the night watchman's call) is an AI on-call agent that does the night shift.

- **Small bugs fix themselves.** The fix goes in when every guard passes, you get a quiet note afterwards, and Undo is one tap. `/heal minor off` makes you approve these too.
- **Serious bugs ring your phone.** Login, exam or payment failures: a real phone call (Twilio); press 1 and the cause is waiting on Telegram.
- **No answer in 3 minutes?** It heals under your rules, then watches the errors and rolls back if they don't drop.
- **Readable rules decide, not the AI.** Claude answers fixed questions; rules in code pick wake, message or the 08:00 summary. No AI answer can lower a critical-flow alert.
- **Strict about what it touches.** A fix goes in without you only if the code rules pass, every AI reviewer agrees and your repo's own required checks pass. Never in payments, login, sessions, exams or config; never a fix that removes a check or changes more than 6 lines. At most 5 small and 2 big heals a night.

## How it works

1. **Connect.** Apps already on Sentry's open-source SDK change one setting (the DSN). New apps run one command that shows every change before writing it. No code? Point a log drain at it.
2. **Intake.** Only an allowlist of fields is kept; emails, tokens, keys and IPs are masked. The same crash 50 times is one incident.
3. **Decide (about 1.7 s).** Claude Haiku answers fixed questions five times; [`decide.ts`](watcher/src/pipeline/decide.ts) picks the action. `/exam 2h` marks a live exam.
4. **Diagnose.** Claude Sonnet reads the failing code, the files it calls and the last deploy: cause in plain words, file, line, likely commit.
5. **Gate the fix (about 11 s).** Six code checks, then a second Claude review. Every piece of AI-written code runs only in a sealed runner: no network, no secrets, read-only.
6. **Act.** Small bug: heal now, quiet note. Serious bug: call and Telegram card; you approve, or after 3 minutes it heals under your rules. Every heal is watched for 30 minutes, rolled back if errors don't drop, and undoable in one tap.

## Traction

| | |
|---|---|
| **Live** | On a Vultr Cloud Compute instance in Bangalore; the Playground runs 7 live apps with 70 planted bugs |
| **Real product** | Watches Faurus (code.faurus.app, about 11,000 accounts) in suggest-only mode: it never changes Faurus on its own |
| **Phone wake-ups** | Real Twilio calls tested end to end (press 1 to acknowledge) |
| **Reached the owner** | 70 of 70 planted bugs |
| **Fixed and proved** | 62 of 70 (89%), judged by hidden tests the AI never saw |
| **Mistakes, counted** | 5 wrong fixes among 64 shown: 4 were labelled "use with care" (never applied without you), and 1 of the 20 that could have healed alone was wrong (that is what Undo is for) |
| **Speed and cost** | About 1.7 s to decide, 11 s to a fix; $1.19 of AI for all 70 bugs |
| **Security** | Two independent reviews; every finding fixed |

## Go-to-market

- **Who first:** freelancers, startups and college tech teams, starting in India, where small teams run live apps with nobody on call.
- **Zero-friction connect:** any app on Sentry's open-source SDK connects by changing one setting; others run `jaagteraho init` from this repo (npm publish pending).
- **Where we find them:** developer communities and colleges, starting with the colleges already on Faurus.
- **Free to start:** every Telegram account gets $5 of AI credit; deciding and alerting are always free.

## Quickstart (60 seconds)

`npx jaagteraho` is not on npm yet, so run it from this repository (Node 18.17+):

```bash
git clone https://github.com/AVPthegreat/jaagteraho
npm install --prefix jaagteraho/cli

cd your-app                                   # Django, Flask, FastAPI, Express or Next.js
node ../jaagteraho/cli/bin/jaagteraho.mjs init
```

1. `init` registers your app with the hosted API, finds your framework, **shows every change before writing it**, adds the free open-source Sentry SDK and two lines, and sends a test error.
2. Open the Telegram link it prints (or scan the QR code): a ✅ arrives. Deploy as usual.
3. Optional: `/heal` to see or change your rule, `/exam 2h` when an exam or launch is running.

Already on the Sentry SDK? Just set `SENTRY_DSN` to the address from `/new myapp` in Telegram. No code at all? Point your host's log drain at the logs address on the Connect page.

## Architecture

```mermaid
flowchart LR
  A["Your app<br/>(Sentry SDK or log drain)"] --> B["Intake<br/>allowlist + masking"]
  B --> C["Claude Haiku<br/>fixed questions, 5 votes"]
  C --> D{"Readable rules<br/>decide"}
  D -- "noise" --> E["Logbook +<br/>08:00 summary"]
  D -- "small bug" --> F["Claude Sonnet diagnoses<br/>+ fix gate"]
  D -- "serious bug" --> G["Phone call (Twilio)<br/>+ Telegram + voice"]
  G --> F
  F --> H{"Every guard passes?"}
  H -- "small bug" --> I["Healed at once<br/>quiet note + Undo"]
  H -- "serious: you approve,<br/>or no answer in 3 min" --> J["Heal under your rules"]
  H -- "no" --> K["Waits for you"]
  I --> L["Watch errors:<br/>proved, or rolled back"]
  J --> L
  subgraph V["Vultr, Bangalore"]
    B
    C
    D
    F
    H
  end
```

Sealed runner, containers and the full high- and low-level design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Self-healing

You approve, or let it heal under your rules (default: small bugs heal at once with a quiet note; a serious one heals if the wake-up is not answered in 3 minutes; `/heal ask` makes you approve everything; [`heal.ts`](watcher/src/pipeline/heal.ts), tests in [`heal.test.ts`](watcher/test/heal.test.ts)).

- **Only recommended fixes** heal on their own: all six code checks passed and, on a real app, every review vote agreed. A fix that adds an import, a network call, a process, a file write, dynamic code, decoding or a built-up URL never does. Never in login, sessions, tokens, admin and roles, payments, exams, grading, migrations, settings and config, CI or infrastructure (`HEAL_PROTECTED` and `riskyAdditions` in [`gate.ts`](watcher/src/pipeline/gate.ts)). On the demo portal the fix must also be proved by its own regression test.
- **Only errors your server signs.** The DSN's public key ships in browsers, so it proves nothing. Self-healing acts only on incidents whose every error carried the app's server-only secret (`/heal` gives a `https://KEY:SECRET@…` DSN for Python, or an `x-jr-ingest-secret` header for Node). Other errors are still alerted and diagnosed.
- **Caps:** at most 5 small and 2 big heals per app in 12 hours by default (`/heal max`). A fix that goes in without you never removes a check and changes at most 6 lines.
- **How it goes in.** Demo portal: no code is written; the visitor's session switches to the portal's prebuilt fixed build and the failing request is sent again as proof. Your app: a pull request with GitHub auto-merge, turned on only when the branch requires status checks; otherwise the PR waits for you and the wake-up calls go on. This needs a write token set on the server by hand for now, bound to one repository (`JR_GITHUB_HEAL_TOKEN_<app id>` and `JR_GITHUB_HEAL_REPO_<app id>`); without it, a heal arrives as the ready-to-apply diff.
- **Proved or undone.** It waits for the deploy (a newer release reporting in, or 10 minutes after the merge without release tags), then watches the error for 30 minutes, counting only signed errors from the new release. If at least 3 come back after 10 minutes or more and they are not down by half, a revert pull request goes in, you are woken again (once) and self-healing pauses for 12 hours.
- **Told plainly.** "Healed while you were away": what broke, the cause, what changed, how it is being proved, and a one-tap Undo. Every step is in the incident's logbook.

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

Every number is produced by a script in this repository. Measured 13 and 14 Nov 2026.

**All 70 planted bugs (JR-Bench plus the 50 Playground bugs, [`bench/RESULTS.md`](bench/RESULTS.md) and [`bench/RESULTS-extra.md`](bench/RESULTS-extra.md)):** 70 of 70 reached the owner; the fix passed our hidden test in 62 of 70 (89%); 5 of the 64 fixes shown were wrong (4 of them labelled "use with care"); $1.19 of AI in total. The two runs separately:

**JR-Bench: 20 planted bugs and 4 noise errors in 7 sample apps** ([`bench`](bench)): six Python apps of 21 to 101 files and one Node.js app. Each bug is planted as if a commit introduced it and triggered for real; a hidden test JaagteRaho never sees judges the fix.

| | Result |
|---|---|
| Planted bugs that reached the owner | 20 of 20 |
| Noise (dropped connection, favicon, bot scanner, planned restart) kept quiet | 4 of 4, at about $0.0005 each |
| Exam-time bugs on a critical route that woke the owner | 3 of 3 |
| Proposed fix works (hidden test passes) | 20 of 20 |
| Fixes shown to the owner | 19 of 20: 14 recommended, 5 "use with care"; the one withheld is in a payments module (a hard rule) |
| Fixes shown to the owner that were wrong | 0 |
| Claude's own regression test agreed with the hidden test | 14 of 14 that ran |
| Median time: decision / fix ready | 1.6 s / 11.7 s |
| Cost per error (decision + diagnosis + fix review) | about $0.013 |

What the benchmark changed: the first fix gate showed a fix only when every review answer was clean, and held back 10 of 16 fixes that were in fact correct. The three-level gate shows 15 of the same 16, still with none wrong.

**42 real bugs from 18 open-source Python projects** ([`watcher/eval`](watcher/eval)): tracebacks people posted on GitHub (requests, Flask, pip, pytest, Celery, black and others), scored against the lines the real, merged fix changed. JaagteRaho reads the code as it was before the fix and never sees the real fix. For 22 of them the fix is in code the traceback never shows; JaagteRaho then searches the repository itself (definitions, where a value is set, the error's text).

| | Result |
|---|---|
| Bug in a file from the traceback: right file | 20 of 20 (100%) |
| Bug in a file from the traceback: right lines (±3) | 17 of 20 (85%) |
| Bug in code the traceback never shows: right file | 25 of 44 diagnoses (22 bugs, two runs each) |
| Cost per diagnosis | about $0.045 (these are large library files) |

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
| Write access to your code | Off unless you give it. The GitHub app is read-only. Self-healing a real app needs a write token bound to that one repository and errors signed with the app's server-only secret; a heal is then a pull request that merges by itself only behind the branch's required checks, and only recommended fixes outside protected areas with no risky code qualify, at most 5 small and 2 big a night, rolled back if the errors don't drop. On the demo portal, the owner's Approve opens a pull request a person merges. |
| Running code | Outside apps' code is never run. On the demo portal only, the model's regression test runs in a throwaway copy after a strict check (no files, network, processes or environment). |
| Runaway cost | Identical errors are grouped before any model call; per-app and daily caps; $5 free credit per account; Haiku-only after $40 and no model calls after $45. |

## It watches itself

JaagteRaho runs its own code through the same pipeline. Its crashes and failed jobs become incidents in a project called `jaagteraho`, decided, diagnosed against its own source and sent to the owner on Telegram.

On 13 Nov we sent malformed input to every public endpoint. JaagteRaho caught four crashes in itself (a `null` request body, a name sent as a number, a traceback sent as a number, a repository link sent as a list), explained each one in plain words with file and line, and proposed four fixes that passed its own fix gate. We applied three of them exactly as written (the fourth overlapped another) and added regression tests for all four. The real-bug set then showed the paste page could not read Jupyter or pytest tracebacks; that was fixed too.

## How it differs

Sentry, PostHog and others diagnose errors for paying teams; Reticle and similar tools verify an AI agent's change in development before it ships. JaagteRaho is the part after deploy, for one person: it watches real users' errors at night, decides with readable rules whether to wake you (exam-aware), explains in plain words on Telegram, and hands over a fix with its checks and, where it can, a test that proves it.

## What it runs on

- **Vultr (hackathon sponsor):** everything runs on one Vultr Cloud Compute instance in Bangalore (2 vCPU, 8 GB): intake, worker, Telegram bot, database, the demo portal and the website, behind Caddy with Docker Compose.
- **Claude through Anthropic's API:** decisions and fix review (Claude Haiku 5.5) and diagnosis (Claude Sonnet 5.5).
- **Gnani:** speaks the wake-up call in Hindi or English (Timbre text-to-speech), sent as a Telegram voice note.
- **Twilio (optional):** places the real phone call on a wake, when it is set up (`JR_TWILIO_*` in `watcher/.env`).
- **Telegram** for alerts.

## Repository

| Folder | What it is |
|---|---|
| [`watcher/`](watcher) | The backend: intake (SDK and log drains), decision rules, diagnosis, fix gate and proof, Telegram bot, GitHub app, public API (TypeScript, Hono, SQLite) |
| [`cli/`](cli) | `npx jaagteraho init` and `test`: connects an app in one command |
| [`sandbox/`](sandbox) | The demo exam portal with three faults planted on purpose (Django, sentry-sdk 2.71.0) |
| [`bench/`](bench) | JR-Bench: 7 generated sample apps (6 Python, 1 Node.js), planted bugs with hidden tests, results |
| [`site/`](site) | The public website: break-it page, paste-your-error, connect, evidence (Next.js) |
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

JaagteRaho is not the first tool to diagnose errors or propose fixes. It is tested end to end on Django and Flask with sentry-sdk 2.71.0 and on Express with @sentry/node 11.12, and its setup command on sample Django, Flask, FastAPI, Express and Next.js apps; Next.js and FastAPI have not been run end to end with a live error yet. Model vote shares are not calibrated probabilities. The benchmark apps are generated and small; the real-bug set is 42 cases. The accuracy figures above are what these runs measured, nothing more. Self-healing runs for real on the demo portal; on a connected app it has been tested against a stand-in GitHub in the unit tests, not yet on a live repository.

## How this was built

Work began on 12 November 2026, before the hack window, with the organisers' written permission. The code was written with Claude Code, directed and tested by Anant. Faurus itself is not part of this submission; it is the live app JaagteRaho watches.
