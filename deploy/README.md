# Deploying JaagteRaho

The watcher, the two demo-portal builds and a backup job run on one Vultr Compute instance with Docker Compose. The website runs on Vercel.

## 1. Server (Vultr Compute)

1. Create an Ubuntu 24.04 instance (2 vCPU, 4 GB is plenty). Open ports 80 and 443.
2. Install Docker: `curl -fsSL https://get.docker.com | sh`.
3. Copy this repository to the server and fill in `watcher/.env` (see `watcher/.env.example`). Also set:
   - `JR_SITE_ORIGINS=https://<your-vercel-domain>`
   - `JR_PUBLIC_INTAKE_URL=https://<JR_API_DOMAIN>`
4. Register the demo portal from inside the server, so its DSN uses the internal address:
   ```bash
   cd deploy
   docker compose run --rm -e JR_PUBLIC_INTAKE_URL=http://watcher:8787 watcher \
     node --import tsx scripts/project-add.ts sandbox sandbox <owner/sandbox-repo>
   ```
   Put the printed `SENTRY_DSN` into `deploy/.env` as `SANDBOX_DSN`, and send `/start <LINK_CODE>` to the bot.
5. Set `JR_API_DOMAIN` in `deploy/.env` (a domain pointing at the server, or `<server-ip>.sslip.io`), then:
   ```bash
   docker compose up -d --build
   curl https://$JR_API_DOMAIN/health
   ```

The `runner` service is the only place app code and AI-written code runs (fix proofs, the Live playground's
crashes and hidden tests). It has no network, no `.env`, a read-only root and its own limits, and the watcher
reaches it only through the `runner_sock` volume. Without it, fix proofs are skipped and the playground stays off.
Check it after a deploy: `docker compose exec runner node -e "fetch('http://1.1.1.1').catch(e=>console.log('no network:', e.cause?.code))"`.

## 2. Website (Vercel)

Import the repository in Vercel with **Root Directory** set to `site`, and set `NEXT_PUBLIC_WATCHER_URL=https://<JR_API_DOMAIN>`.

## 3. Connecting a real app

Register it with `project:add` (kind `faurus` or `paste`), then set the printed `SENTRY_DSN` in that app. For Faurus, follow `docs/ARCHITECTURE.md` section 5: learn mode first, backend only, and a rehearsed rollback.

## 4. GitHub app (optional: private repositories)

Lets an owner give JaagteRaho read-only access to a private repository with one click (`/github` in Telegram).

1. GitHub → Settings → Developer settings → GitHub Apps → New GitHub App.
   - Name: e.g. `JaagteRaho`; Homepage: the website address.
   - Setup URL: `<JR_PUBLIC_INTAKE_URL>/github/setup`; tick **Request user authorization (OAuth) during installation** (JaagteRaho uses it to check that the person installing really owns the installation). Callback URL: the same `/github/setup` address.
   - Webhook: off.
   - Repository permissions: **Contents: Read-only**, **Metadata: Read-only**. Nothing else.
   - Where can it be installed: Any account.
2. Generate a private key (.pem) and a client secret.
3. In `watcher/.env`: `JR_GITHUB_APP_ID`, `JR_GITHUB_APP_SLUG` (the app's URL name), `JR_GITHUB_APP_CLIENT_ID`, `JR_GITHUB_APP_CLIENT_SECRET`, and `JR_GITHUB_APP_PRIVATE_KEY_FILE` (copy the .pem next to `.env`, `chmod 600`, and mount it, or paste it into `JR_GITHUB_APP_PRIVATE_KEY` with `\n` line breaks).
4. Restart the watcher. In Telegram, `/github` now shows an "Install on GitHub" button.

## 5. Setup command (npm)

`cli/` is the `npx jaagteraho init` command. Before publishing, set `DEFAULT_SERVER` in `cli/bin/jaagteraho.mjs` to the public watcher address, then `cd cli && npm test && npm publish`. Until it is published, run it from the repository: `node <repo>/cli/bin/jaagteraho.mjs init`.

## 6. Log drains (no-code connection)

Every app also gets a logs address, `<JR_PUBLIC_INTAKE_URL>/logs/<app id>/<key>` (shown by `/new` and the website). Point a host's log drain at it: plain text, JSON (one object per line or an array, with a `message` field) and Heroku logplex are understood. Only Python tracebacks and Node.js stack traces are kept; every other line is dropped. If the host asks the address to answer with a verification header, put the value in `JR_VERCEL_VERIFY`.

## Backups

The `backup` service copies the database every 6 hours into `deploy/backups/`. Delete old copies by hand when the disk fills.
