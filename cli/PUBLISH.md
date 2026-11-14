# Publishing the `jaagteraho` CLI to npm

The founder publishes with his own npm account. Nothing here runs automatically.
The name `jaagteraho` was free on npm on 14 Nov 2026 (`npm view jaagteraho` answered 404).

## Before every release
1. If the API moved (for example to Vultr), change `HOSTED_SERVER` in `lib/server.mjs`. It is the only place.
2. Bump the version: `npm version patch --no-git-tag-version` (or `minor`). npm refuses a version that was published before.
3. From the `cli` folder:
   ```bash
   npm ci
   npm test                 # all tests must pass (prepublishOnly runs them again)
   npm pack --dry-run       # must list only bin/, lib/, README.md, LICENSE, package.json
   ```
4. Smoke test the packed file in an empty folder:
   ```bash
   npm pack                                   # writes jaagteraho-<version>.tgz
   mkdir /tmp/jr-try && cd /tmp/jr-try && npm init -y >/dev/null
   npx --yes /path/to/cli/jaagteraho-<version>.tgz help   # prints the usage lines
   ```

## Publish (Mac Terminal, in the repo's `cli` folder)
```bash
npm login                  # once per machine; opens the browser for the founder's npm account (2FA)
npm whoami                 # check it is the right account
npm publish --access public
```
Then check: `npm view jaagteraho version` shows the new version, and in any app folder
`npx jaagteraho@latest help` prints the usage.

## Undo
- Within 72 hours of publishing a version: `npm unpublish jaagteraho@<version>`.
- After that: `npm deprecate jaagteraho@<version> "use <newer version>"` and publish a fixed version.
