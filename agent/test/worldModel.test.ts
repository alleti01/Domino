// Feature test for the Meterless World Model integration (the Build requirement's "test showing it works").
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { InvestigationWorld } from "../src/engines/worldModel.js";
import { StubEvidence } from "../src/fakes/stubWorld.js";

const pathFor = async (entity: string) => new StubEvidence().dependencyPath("stub-chg-1", entity);

describe("World Model as investigation state", () => {
  it("records the semantic-layer graph with provenance and answers inspect_world_model", async () => {
    const world = new InvestigationWorld("run-a", { namespace: "t1" });
    await world.recordPath(await pathFor("svc_builder"));
    const view = world.inspect("builder") as any;
    expect(view.known).toBe(true);
    expect(view.links.length).toBeGreaterThan(0);
    for (const link of view.links) {
      expect(link.row_id).toBeTruthy(); // every link cites a semantic-layer row
      expect(link.source).toBeTruthy();
    }
    expect(world.wm.audit().length).toBeGreaterThan(0); // engine audit log is populated
  });

  it("traces the causal chain from the changed entity to the failing consumer through real rows", async () => {
    const world = new InvestigationWorld("run-b", { namespace: "t2" });
    await world.recordPath(await pathFor("svc_builder"));
    const chain = world.causalChain("svc_builder", "loader");
    expect(chain.map((l) => l.relation)).toEqual(["identity_of", "produces", "consumed_by"]);
    expect(chain.every((l) => l.row_id && l.status === "observed")).toBe(true);
    expect(world.causalChain("svc_builder", "nowhere")).toEqual([]);
  });

  it("keeps hypothesis history: a new status supersedes the old one, which stays in the log", async () => {
    const world = new InvestigationWorld("run-c", { namespace: "t3" });
    const h = { hypothesis_id: "h1", claim: "c", mechanism: "m", evidence_for: [], evidence_against: [], falsified_by: "f", confidence: 0.5, status: "open" as const };
    await world.recordHypothesis(h);
    await new Promise((r) => setTimeout(r, 5)); // distinct observation time
    await world.recordHypothesis({ ...h, status: "supported" as any });
    const facts = world.wm.view("facts").about(world.wm.view("graph").query({ type: "hypothesis" })[0]!.id).filter((f) => f.predicate === "status");
    expect(facts.map((f) => f.value)).toEqual(["open", "supported"]);
    expect(facts[0]!.supersededBy).toBe(facts[1]!.id);
  });

  it("carries verified topology into a later run when persistence is on", async () => {
    const dir = await mkdtemp(join(tmpdir(), "domino-wm-"));
    const first = new InvestigationWorld("run-1", { namespace: "w", persistDir: dir });
    expect(first.knownComponents()).toBe(0);
    await first.recordPath(await pathFor("svc_builder"));
    const second = new InvestigationWorld("run-2", { namespace: "w", persistDir: dir });
    expect(second.knownComponents()).toBeGreaterThan(0);
    expect((second.inspect("loader") as any).links[0].recorded_by_run).toBe("run-1");
  });
});
