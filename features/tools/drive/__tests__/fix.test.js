// The half that can do damage. These test what a change decides to do, before
// anything reaches Drive.

import { test, expect } from "bun:test";
import { planOperations, remindMailto, roleWord, domainOf } from "../fix";

const mine = { id: "f1", name: "Q3 plan", ownedByMe: true, canShare: true, permId: "p1", permKind: "anyone" };
const theirs = { id: "f2", name: "Their doc", ownedByMe: false, canShare: true, permId: "p9", owner: "someone@skedulo.com", label: "Anyone with the link can view" };

// ── the gate, again, at the point of action ───────────────────────
test("a file we do not own produces no plan at all", () => {
  expect(() => planOperations(theirs, { who: "restricted" })).toThrow(/owned by someone else/i);
});

test("canShare without ownership is still refused", () => {
  const f = { ...mine, ownedByMe: false };
  expect(() => planOperations(f, { who: "restricted" })).toThrow();
});

// ── restricting ───────────────────────────────────────────────────
test("restricting deletes the wide grant", () => {
  const { ops, summary } = planOperations(mine, { who: "restricted" });
  expect(ops).toEqual([{ kind: "delete", permId: "p1" }]);
  expect(summary).toBe("Restricted");
});

test("restricting a file with nothing wide does nothing, and says so", () => {
  const { ops, summary } = planOperations({ ...mine, permId: null }, { who: "restricted" });
  expect(ops).toEqual([]);
  expect(summary).toBe("Already restricted");
});

// ── changing the level of the same audience ───────────────────────
test("same audience, different role, patches rather than recreating", () => {
  const { ops } = planOperations(mine, { who: "anyone", role: "reader" });
  expect(ops).toEqual([{ kind: "patch", permId: "p1", role: "reader" }]);
});

test("switching audience removes the old grant before adding the new one", () => {
  const { ops } = planOperations(mine, { who: "domain", role: "reader" }, "khoa.vu@skedulo.com");
  expect(ops[0]).toEqual({ kind: "delete", permId: "p1" });
  expect(ops[1].kind).toBe("create");
  expect(ops[1].body).toEqual({ type: "domain", role: "reader", domain: "skedulo.com", allowFileDiscovery: false });
});

test("a new grant is never discoverable by search", () => {
  const anyone = planOperations({ ...mine, permKind: "domain" }, { who: "anyone", role: "reader" });
  expect(anyone.ops.at(-1).body.allowFileDiscovery).toBe(false);
  const domain = planOperations({ ...mine, permKind: "anyone" }, { who: "domain", role: "reader" }, "a@b.com");
  expect(domain.ops.at(-1).body.allowFileDiscovery).toBe(false);
});

// ── naming people ─────────────────────────────────────────────────
test("adding people creates one grant each, and can close the wide one", () => {
  const { ops } = planOperations(mine, {
    who: "people", role: "writer", emails: ["a@x.com", "b@x.com"], broad: "remove",
  });
  expect(ops.filter((o) => o.kind === "create")).toHaveLength(2);
  expect(ops.at(-1)).toEqual({ kind: "delete", permId: "p1" });
});

test("people grants tolerate a single bad address", () => {
  const { ops } = planOperations(mine, { who: "people", role: "reader", emails: ["a@x.com"] });
  expect(ops[0].tolerateFailure).toBe(true);
});

test("the wide grant is kept unless removal was asked for", () => {
  const { ops } = planOperations(mine, { who: "people", role: "reader", emails: ["a@x.com"] });
  expect(ops.some((o) => o.kind === "delete")).toBe(false);
});

test("an expiry is carried onto the grant", () => {
  const { ops } = planOperations(mine, { who: "people", role: "reader", emails: ["a@x.com"], expiry: "2026-12-31T00:00:00Z" });
  expect(ops[0].body.expirationTime).toBe("2026-12-31T00:00:00Z");
});

test("a message is only attached when notifying", () => {
  const quiet = planOperations(mine, { who: "people", role: "reader", emails: ["a@x.com"], notify: false, message: "hi" });
  expect(quiet.ops[0].message).toBe("");
  const loud = planOperations(mine, { who: "people", role: "reader", emails: ["a@x.com"], notify: true, message: "hi" });
  expect(loud.ops[0].message).toBe("hi");
});

// ── wording ───────────────────────────────────────────────────────
test("roles read as words people recognise", () => {
  expect(roleWord("writer")).toBe("editor");
  expect(roleWord("commenter")).toBe("commenter");
  expect(roleWord("reader")).toBe("viewer");
});

test("a domain is taken from the signed-in address, with a fallback", () => {
  expect(domainOf("khoa.vu@skedulo.com")).toBe("skedulo.com");
  expect(domainOf("")).toBe("your organisation");
});

// ── remind owner ──────────────────────────────────────────────────
test("remind owner produces a mailto naming the file and its risk", () => {
  const url = remindMailto(theirs, "khoa.vu@skedulo.com");
  expect(url.startsWith("mailto:someone@skedulo.com?")).toBe(true);
  expect(decodeURIComponent(url)).toContain("Their doc");
  expect(decodeURIComponent(url)).toContain("Anyone with the link can view");
  expect(decodeURIComponent(url)).toContain("I have not touched it");
});

test("no owner address means no reminder rather than a broken link", () => {
  expect(remindMailto({ ...theirs, owner: null })).toBe(null);
});
