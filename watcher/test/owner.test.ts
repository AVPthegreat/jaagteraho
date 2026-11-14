import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ownerLink, verifyOwnerLink } from "../src/web/owner.js";

process.env.JR_LINK_SECRET = "test-secret-test-secret";
process.env.JR_PUBLIC_INTAKE_URL = "https://api.example.test";

const parts = (link: string) => {
  const u = new URL(link);
  return { id: Number(u.pathname.split("/").pop()), e: Number(u.searchParams.get("e")), s: u.searchParams.get("s")! };
};

describe("owner links", () => {
  it("accepts a fresh link for the right incident", () => {
    const p = parts(ownerLink(7)!);
    assert.equal(verifyOwnerLink(p.id, p.e, p.s), true);
  });
  it("rejects another incident, a changed signature and an expired link", () => {
    const p = parts(ownerLink(7)!);
    assert.equal(verifyOwnerLink(8, p.e, p.s), false);
    assert.equal(verifyOwnerLink(7, p.e, p.s.slice(0, -1) + (p.s.endsWith("A") ? "B" : "A")), false);
    assert.equal(verifyOwnerLink(7, p.e, p.s, p.e + 1), false);
  });
  it("rejects an expiry pushed far into the future", () => {
    const p = parts(ownerLink(7)!);
    assert.equal(verifyOwnerLink(7, p.e + 86_400_000, p.s), false);
  });
});
