# jaagteraho

Connect your app to [JaagteRaho](https://github.com/AVPthegreat/jaagteraho), an AI night watchman: it decides whether an error is worth waking you, explains it in plain words on Telegram, and proposes a checked fix.

```bash
npx jaagteraho init                 # register a new app, set it up, send a test error
npx jaagteraho init --dsn <DSN>     # set up an app you created with /new in Telegram
npx jaagteraho test                 # send a test error (reads SENTRY_DSN or .env)
```

`init`:

- finds the framework: Django, Flask, FastAPI, Express (CommonJS or ES modules) or Next.js
- shows every change before writing anything (`--yes` to skip the question)
- adds the free, open-source Sentry SDK and two lines, marked with a comment so they are easy to remove; `SENTRY_DSN` in the environment overrides the address, and an empty value switches it off
- installs the package with npm, pnpm, yarn or bun, or into the project's Python virtual environment (`venv`, `.venv` or `env`); `--no-install` skips this. For Python it also adds `sentry-sdk` to `requirements.txt`
- sends a test error (`--no-test` to skip). You get a ✅ on Telegram.

Running it twice changes nothing. Nothing is sent anywhere except the new app's name (to register it) and the one test error.

By default `init` registers the app with the hosted JaagteRaho API (`https://jr-api.15-252-108-184.sslip.io`). Self-hosting? Set `JAAGTERAHO_URL` or pass `--server https://your-watcher`.

Needs Node.js 18.17 or newer. Works on macOS, Linux and Windows.

MIT licence.
