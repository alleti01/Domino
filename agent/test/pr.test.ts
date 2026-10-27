import { describe, expect, it } from "vitest";
import type { RunSummary } from "../../contracts/agent/types.js";
import { MARKER, findOwnComment, matchPr, parseSystems, renderPrComment, splitDiff, statusFor } from "../src/pr.js";
import { newWork } from "../src/watch.js";

// The modelled change, as the data layer describes it.
const MODELLED = {
  entity_id: "w-x/change/0317",
  files: ["services/orders/handler.py"],
  diff: [
    "--- a/services/orders/handler.py",
    "+++ b/services/orders/handler.py",
    "@@ -12,6 +12,7 @@ def handle_order(request):",
    "     order = validate(request)",
    "     price(order)",
    "+    inventory.reserve(order.items)  # hold stock before confirming",
    "     return confirm(order)",
  ].join("\n"),
};

// The same change as `gh pr diff` prints it for a PR in the demo repo's orders-a/ folder.
const prDiff = (line = "    inventory.reserve(order.items)  # hold stock before confirming", extra = "") =>
  [
    "diff --git a/orders-a/services/orders/handler.py b/orders-a/services/orders/handler.py",
    "index 1111111..2222222 100644",
    "--- a/orders-a/services/orders/handler.py",
    "+++ b/orders-a/services/orders/handler.py",
    "@@ -13,4 +13,5 @@ def handle_order(request):",
    "     order = validate(request)",
    "     price(order)",
    `+${line}`,
    "     return confirm(order)",
    extra,
  ].join("\n");

const README = ["diff --git a/README.md b/README.md", "--- a/README.md", "+++ b/README.md", "@@ -1 +1,2 @@", " # shop", "+More words."].join("\n");
const SYSTEMS = { "orders-a/": "w-x", "orders-b/": "w-y" };
const describeAs = async () => MODELLED;

describe("reading pull request diffs", () => {
  it("splits a diff into files with their changed lines, ignoring context and blank lines", () => {
    const files = splitDiff(`${prDiff()}\n${README}`);
    expect(files.map((f) => f.path)).toEqual(["orders-a/services/orders/handler.py", "README.md"]);
    expect(files[0]).toMatchObject({ added: ["inventory.reserve(order.items)  # hold stock before confirming"], removed: [] });
    expect(splitDiff("--- /dev/null\n+++ b/db/0042.sql\n@@ -0,0 +1 @@\n+GRANT SELECT ON r0.* TO svc;")[0]!.path).toBe("db/0042.sql");
    expect(splitDiff("--- a/old.sql\n+++ /dev/null\n@@ -1 +0,0 @@\n-DROP TABLE x;")[0]).toMatchObject({ path: "old.sql", removed: ["DROP TABLE x;"] });
  });

  it("reads domino.json and normalises folder names", () => {
    expect(parseSystems({ systems: { "orders-a": "w-x", "orders-b/": "w-y" } })).toEqual(SYSTEMS);
    expect(() => parseSystems({ folders: {} })).toThrow("domino.json needs");
  });
});

describe("matching a pull request to a modelled change", () => {
  it("matches the folder whose change equals the modelled one, even with different indentation or hunk numbers", async () => {
    const m = await matchPr(prDiff("  inventory.reserve(order.items)  # hold stock before confirming"), SYSTEMS, describeAs);
    expect(m.matched).toEqual([{ folder: "orders-a/", world: "w-x", changeId: "w-x/change/0317", files: ["orders-a/services/orders/handler.py"] }]);
    expect(m.notCovered).toEqual([]);
  });

  it("never lends a verdict to different code: a changed line is not covered", async () => {
    const m = await matchPr(prDiff("    inventory.reserve(order.items, timeout=1)"), SYSTEMS, describeAs);
    expect(m.matched).toEqual([]);
    expect(m.notCovered[0]!.reason).toContain("differs from the change Domino has modelled for orders-a/");
  });

  it("checks the modelled part and lists files outside any mapped folder as not covered", async () => {
    const m = await matchPr(`${prDiff()}\n${README}`, SYSTEMS, describeAs);
    expect(m.matched).toHaveLength(1);
    expect(m.notCovered).toEqual([{ path: "README.md", reason: "no system in domino.json deploys this folder" }]);
  });

  it("covers nothing in a repository without domino.json", async () => {
    const m = await matchPr(prDiff(), null, describeAs);
    expect(m.matched).toEqual([]);
    expect(m.notCovered[0]!.reason).toContain("no domino.json");
  });

  it("reports a system it cannot read as not covered instead of failing the whole PR", async () => {
    const m = await matchPr(prDiff(), SYSTEMS, async () => {
      throw new Error("describe w-x failed");
    });
    expect(m.notCovered[0]!.reason).toContain("could not be read");
  });
});

describe("reporting back to the pull request", () => {
  const summary = (verdict: RunSummary["verdict"], outage = false) => ({ verdict, outage, run_id: "run-1" }) as RunSummary;
  const matched = { matched: [{ folder: "orders-a/", world: "w-x", changeId: "c", files: [] }], notCovered: [{ path: "README.md", reason: "no system in domino.json deploys this folder" }] };

  it("writes one comment carrying a marker, so later pushes edit it instead of adding more", () => {
    const running = renderPrComment({ headSha: "abcdef1234" }, matched, "running");
    expect(running.startsWith(MARKER)).toBe(true);
    expect(running).toContain("Checking `orders-a/`");
    const done = renderPrComment({ headSha: "abcdef1234" }, matched, [{ folder: "orders-a/", report: "### 🔴 Domino: failure reproduced\nbody" }]);
    expect(done).toContain("### 🔴 Domino: failure reproduced");
    expect(done).toContain("**Not covered**");
    expect(findOwnComment([{ id: 1, body: "LGTM" }, { id: 7, body: done }])).toBe(7);
    expect(findOwnComment([{ id: 1, body: "LGTM" }])).toBeNull();
  });

  it("sets the commit status from the verdicts", () => {
    expect(statusFor(matched, [{ folder: "orders-a/", summary: summary("reproduced_failure") }]).state).toBe("failure");
    expect(statusFor(matched, [{ folder: "orders-a/", summary: summary("no_failure_observed") }]).state).toBe("success");
    expect(statusFor(matched, [{ folder: "orders-a/", summary: summary("no_failure_observed", true) }]).state).toBe("error");
    expect(statusFor(matched, [{ folder: "orders-a/", error: "boom" }]).state).toBe("error");
    expect(statusFor({ matched: [], notCovered: [] }, []).description).toContain("Not covered");
  });
});

describe("watching a repository", () => {
  const pr = (number: number, sha: string, extra: Partial<{ isDraft: boolean; isCrossRepository: boolean }> = {}) => ({ number, headRefOid: sha, title: `PR ${number}`, isDraft: false, isCrossRepository: false, ...extra });

  it("queues each new commit once, oldest PR first, skipping drafts and forks by default", () => {
    const state = { checked: { "1@aaa": { at: "", verdicts: ["no_failure_observed"], run_ids: [] } } };
    const { todo, skipped } = newWork([pr(3, "ccc"), pr(1, "aaa"), pr(1, "bbb"), pr(4, "ddd", { isDraft: true }), pr(5, "eee", { isCrossRepository: true })], state, { drafts: false, forks: false });
    expect(todo.map((p) => `${p.number}@${p.headRefOid}`)).toEqual(["1@bbb", "3@ccc"]);
    expect(skipped.map((s) => s.why)).toEqual(["draft", "from a fork"]);
    expect(newWork([pr(4, "ddd", { isDraft: true })], { checked: {} }, { drafts: true, forks: false }).todo).toHaveLength(1);
  });
});
