// The read-only GitHub App: signed install state, app JWT, and the check that an installation
// really belongs to the person connecting it.

import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, it } from "node:test";
import { appJwt, attachInstallation, confirmInstallation, installUrl, readState } from "../src/github/app.js";
import { openDb } from "../src/db/db.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
Object.assign(process.env, {
  JR_GITHUB_APP_ID: "12345",
  JR_GITHUB_APP_PRIVATE_KEY: privateKey.export({ type: "pkcs1", format: "pem" }).toString(),
  JR_GITHUB_APP_SLUG: "jaagteraho-test",
  JR_GITHUB_APP_CLIENT_ID: "cid",
  JR_GITHUB_APP_CLIENT_SECRET: "csecret",
  JR_LINK_SECRET: "test-secret",
});

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });

describe("GitHub app", () => {
  it("signs a valid RS256 app token that expires within 10 minutes", () => {
    const now = Date.parse("2026-11-13T12:00:00Z");
    const [h, p, s] = appJwt(now).split(".");
    assert.ok(createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, s, "base64url"));
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    assert.equal(claims.iss, "12345");
    assert.ok(claims.exp - claims.iat <= 600);
  });

  it("install links carry a signed state that cannot be altered or reused late", () => {
    const now = Date.now();
    const url = new URL(installUrl(77, 9, now)!);
    assert.equal(url.pathname, "/apps/jaagteraho-test/installations/new");
    const state = url.searchParams.get("state")!;
    assert.deepEqual(readState(state, now), { projectId: 77, userId: 9 });
    assert.equal(readState(state.replace(/^77\./, "78."), now), null, "another app id");
    assert.equal(readState(state, now + 31 * 60_000), null, "expired");
  });

  it("refuses an installation that belongs to someone else", async () => {
    const fake = async (url: string) => {
      if (url.includes("oauth/access_token")) return json({ access_token: "user-token" });
      if (url.endsWith("/user/installations?per_page=100")) return json({ installations: [{ id: 1 }] });
      return json({ repositories: [{ full_name: "riya/quizkart" }] });
    };
    assert.deepEqual(await confirmInstallation("code", 999, fake as typeof fetch), { error: "That installation does not belong to your GitHub account." });
    assert.deepEqual(await confirmInstallation("code", 1, fake as typeof fetch), { repos: ["riya/quizkart"] });
    const noUser = async () => json({ error: "bad_verification_code" });
    assert.ok("error" in (await confirmInstallation("code", 1, noUser as typeof fetch)));
  });

  it("picks the repository when it is clear, and asks when it is not", () => {
    const db = openDb(":memory:");
    db.prepare("INSERT INTO projects (id, name, public_key, kind, repo, repo_access, settings, created_at) VALUES (1, 'a', 'k1', 'faurus', NULL, 'read', '{}', ?), (2, 'b', 'k2', 'faurus', 'Riya/Shop', 'read', '{}', ?)").run(new Date().toISOString(), new Date().toISOString());
    assert.deepEqual(attachInstallation(db, 1, 5, ["riya/quizkart"]), { repo: "riya/quizkart", choices: [] });
    assert.deepEqual(attachInstallation(db, 1, 5, ["riya/x", "riya/y"]).choices, ["riya/x", "riya/y"]);
    assert.equal(attachInstallation(db, 2, 6, ["riya/x", "riya/shop"]).repo, "riya/shop");
    assert.equal((db.prepare("SELECT github_installation FROM projects WHERE id = 2").get() as { github_installation: number }).github_installation, 6);
  });
});
