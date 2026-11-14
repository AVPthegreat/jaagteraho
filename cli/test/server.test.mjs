// Where the setup command registers new apps: the hosted HTTPS API unless the user says otherwise.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { HOSTED_SERVER, serverUrl } from "../lib/server.mjs";

describe("server address", () => {
  it("defaults to the hosted HTTPS API, never a local address", () => {
    assert.match(HOSTED_SERVER, /^https:\/\//);
    assert.doesNotMatch(HOSTED_SERVER, /127\.0\.0\.1|localhost/);
    assert.equal(serverUrl(undefined, {}), HOSTED_SERVER);
  });
  it("--server beats JAAGTERAHO_URL, which beats the default; a trailing slash is dropped", () => {
    assert.equal(serverUrl(undefined, { JAAGTERAHO_URL: "https://self.example/" }), "https://self.example");
    assert.equal(serverUrl("http://127.0.0.1:8787/", { JAAGTERAHO_URL: "https://self.example" }), "http://127.0.0.1:8787");
    assert.equal(serverUrl(true, {}), HOSTED_SERVER); // `--server` with no value
  });
  it("the bin uses the shared constant (no second hard-coded address)", () => {
    const bin = readFileSync(new URL("../bin/jaagteraho.mjs", import.meta.url), "utf8");
    assert.doesNotMatch(bin, /127\.0\.0\.1|sslip\.io/);
    assert.match(bin, /serverUrl\(/);
  });
  it("the published package ships everything the bin imports", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.equal(pkg.bin.jaagteraho, "bin/jaagteraho.mjs");
    for (const f of ["bin", "lib"]) assert.ok(pkg.files.includes(f), f);
    const r = spawnSync("npm", ["pack", "--dry-run", "--json"], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const files = JSON.parse(r.stdout)[0].files.map((f) => f.path);
    for (const f of ["bin/jaagteraho.mjs", "lib/server.mjs", "lib/send.mjs", "lib/plan.mjs", "lib/detect.mjs", "README.md", "LICENSE", "package.json"]) assert.ok(files.includes(f), f);
    assert.ok(!files.some((f) => f.startsWith("test/") || f.startsWith("node_modules/")), files.join(","));
  });
  it("prints usage without touching the network", () => {
    const r = spawnSync(process.execPath, [new URL("../bin/jaagteraho.mjs", import.meta.url).pathname, "help"], { encoding: "utf8", timeout: 10_000 });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /npx jaagteraho init/);
  });
});
