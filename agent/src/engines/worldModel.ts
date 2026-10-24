// Meterless World Model as Domino's investigation state.
//
// Everything the investigation learns lands here with provenance: the cross-source
// dependency graph from the semantic layer (every edge carries its source + row_id),
// hypotheses (status changes are superseding facts, never overwrites), and experiments
// (observations as facts). Three features read it back:
//   1. inspect_world_model: the agent asks what is already known around an entity.
//   2. Causal chain: the verdict's chain is a traversal of this graph from the changed
//      entity to the failing consumer, so every link cites a real row.
//   3. Optional cross-run memory: with persistence on, a later investigation of the
//      same world starts from the topology an earlier one verified.

import { externalId, WorldModel } from "../../vendor/meterless-world-model/src/index.ts";
import type { Provenance, Relationship } from "../../vendor/meterless-world-model/src/index.ts";
import type { DependencyPath, ExperimentResult } from "../../../contracts/agent/types.js";
import type { Hypothesis } from "../state.js";

const COMPONENT = "component";
const componentId = (id: string) => externalId(COMPONENT, "usl", id);

export interface ChainLink {
  from: string;
  relation: string;
  to: string;
  source: string;
  row_id: string;
  status: "observed" | "inferred" | "unresolved";
  detail?: string;
  row_ids: string[];
}

export class InvestigationWorld {
  readonly wm: WorldModel;
  private writes = 0;

  constructor(
    readonly runId: string,
    opts: { namespace: string; persistDir?: string },
  ) {
    this.wm = new WorldModel({
      namespace: opts.namespace,
      storage: opts.persistDir ? "local" : "memory",
      directory: opts.persistDir,
      conflictPolicy: "most-recent-wins",
    });
  }

  private prov(kind: string, by: string, url?: string): Provenance {
    return { kind, by, at: new Date().toISOString(), runId: this.runId, ...(url ? { url } : {}) };
  }

  /** How many components a previous run already verified (cross-run memory). */
  knownComponents(): number {
    return this.wm.view("graph").query({ type: COMPONENT }).length;
  }

  /** Every semantic-layer edge becomes a provenance-carrying relationship. */
  async recordPath(path: DependencyPath): Promise<number> {
    for (const n of path.nodes) {
      await this.wm.upsertEntity({
        type: COMPONENT,
        externalKey: { system: "usl", id: n.id },
        name: n.label,
        attrs: { kind: n.kind, source: n.source, row_id: n.row_id },
        source: this.prov("pipeline", "zetaris-usl", `usl:${n.source}#${n.row_id}`),
      });
    }
    for (const e of path.edges) {
      await this.wm.relate({
        from: componentId(e.from),
        type: e.relation,
        to: componentId(e.to),
        attrs: { row_id: e.row_id, row_ids: e.row_ids ?? [e.row_id], source: e.source, status: e.status, ...(e.detail ? { detail: e.detail } : {}) },
        source: this.prov("pipeline", "zetaris-usl", `usl:${e.source}#${e.row_id}`),
      });
    }
    this.writes += path.nodes.length + path.edges.length;
    return path.nodes.length + path.edges.length;
  }

  async recordHypothesis(h: Hypothesis): Promise<void> {
    const id = `${this.runId}:${h.hypothesis_id}`;
    await this.wm.upsertEntity({
      type: "hypothesis",
      externalKey: { system: "domino", id },
      name: h.claim,
      attrs: { claim: h.claim, mechanism: h.mechanism, falsified_by: h.falsified_by },
      source: this.prov("agent", "nemotron"),
    });
    // Status is a fact: a later status supersedes the earlier one but both stay in the log.
    await this.wm.assertFact({ about: externalId("hypothesis", "domino", id), predicate: "status", value: h.status, confidence: h.confidence, source: this.prov("agent", "nemotron") });
    for (const ref of h.evidence_for) {
      await this.wm.assertFact({ about: externalId("hypothesis", "domino", id), predicate: `cites:${ref}`, value: "supports", source: this.prov("agent", "nemotron") });
    }
    this.writes += 2 + h.evidence_for.length;
  }

  async recordExperiment(r: ExperimentResult, hypothesisIds: string[]): Promise<void> {
    const xid = externalId("experiment", "domino", `${this.runId}:${r.experiment_id}`);
    await this.wm.upsertEntity({
      type: "experiment",
      externalKey: { system: "domino", id: `${this.runId}:${r.experiment_id}` },
      name: r.experiment_id,
      attrs: { variant: r.request.variant, workload: r.request.workload ?? "default", completed: r.completed },
      source: this.prov("experiment", "worlds-harness"),
    });
    for (const [key, value] of Object.entries(r.observations)) {
      await this.wm.assertFact({ about: xid, predicate: key, value, confidence: 1, source: this.prov("experiment", "worlds-harness") });
    }
    for (const a of r.assertions) {
      await this.wm.assertFact({ about: xid, predicate: `assert:${a.name}`, value: a.passed, confidence: 1, source: this.prov("experiment", "worlds-harness") });
    }
    for (const hid of hypothesisIds) {
      await this.wm.relate({ from: xid, type: "tests", to: externalId("hypothesis", "domino", `${this.runId}:${hid}`), source: this.prov("experiment", "worlds-harness") });
    }
    this.writes += 1 + Object.keys(r.observations).length + r.assertions.length + hypothesisIds.length;
  }

  /** What the shared state knows around one entity: the agent-facing read. */
  inspect(entity: string): Record<string, unknown> {
    const graph = this.wm.view("graph");
    const id = componentId(entity);
    const node = graph.entity(id);
    if (!node) return { entity, known: false, note: "Nothing recorded about this entity yet. Map it with get_dependency_path first." };
    // Everything reachable within a few hops, so a recalled map is as useful as a fresh one.
    const all = [...this.relationships()].filter((r) => r.attrs?.row_id);
    const reached = new Set([id]);
    let frontier = [id];
    const links: Relationship[] = [];
    for (let depth = 0; depth < 4 && frontier.length; depth++) {
      const next: string[] = [];
      for (const r of all) {
        const hit = frontier.includes(r.from) ? r.to : frontier.includes(r.to) ? r.from : undefined;
        if (!hit) continue;
        if (!links.includes(r)) links.push(r);
        if (!reached.has(hit)) {
          reached.add(hit);
          next.push(hit);
        }
      }
      frontier = next;
    }
    const name = (eid: string) => graph.entity(eid)?.name ?? eid;
    return {
      entity,
      known: true,
      kind: node.attrs.kind,
      first_seen_in: node.source.url,
      links: links.map((r) => ({
        link: `${name(r.from)} ${r.type} ${name(r.to)}`,
        source: r.attrs?.source,
        row_id: r.attrs?.row_id,
        recorded_by_run: r.source.runId,
      })),
    };
  }

  private *relationships(): Iterable<Relationship> {
    for (const e of this.wm.events()) if (e.kind === "relate") yield e.payload as Relationship;
  }

  /** Shortest provenance-carrying path between two components (undirected BFS). */
  causalChain(fromEntity: string, toEntity: string): ChainLink[] {
    const start = componentId(fromEntity);
    const goal = componentId(toEntity);
    const rels = [...this.relationships()].filter((r) => r.attrs?.row_id);
    const prev = new Map<string, Relationship>();
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur === goal) break;
      for (const r of rels) {
        const next = r.from === cur ? r.to : r.to === cur ? r.from : undefined;
        if (!next || seen.has(next)) continue;
        seen.add(next);
        prev.set(next, r);
        queue.push(next);
      }
    }
    if (!prev.has(goal)) return [];
    const graph = this.wm.view("graph");
    const links: ChainLink[] = [];
    for (let cur = goal; cur !== start; ) {
      const r = prev.get(cur)!;
      links.unshift({
        from: graph.entity(r.from)?.name ?? r.from,
        relation: r.type,
        to: graph.entity(r.to)?.name ?? r.to,
        source: String(r.attrs?.source ?? ""),
        row_id: String(r.attrs?.row_id ?? ""),
        row_ids: Array.isArray(r.attrs?.row_ids) ? (r.attrs.row_ids as string[]) : [String(r.attrs?.row_id ?? "")],
        status: r.attrs?.status === "inferred" || r.attrs?.status === "unresolved" ? (r.attrs.status as "inferred" | "unresolved") : "observed",
        ...(r.attrs?.detail ? { detail: String(r.attrs.detail) } : {}),
      });
      cur = r.from === cur ? r.to : r.from;
    }
    return links;
  }

  /** Longest directed chain recorded from an entity: the fallback when a failure names no component. */
  longestChainFrom(fromEntity: string): ChainLink[] {
    const rels = [...this.relationships()].filter((r) => r.attrs?.row_id);
    const start = componentId(fromEntity);
    let best: Relationship[] = [];
    const walk = (node: string, trail: Relationship[], visited: Set<string>) => {
      const outs = rels.filter((r) => r.from === node && !visited.has(r.to));
      if (!outs.length && trail.length > best.length) best = trail;
      for (const r of outs) walk(r.to, [...trail, r], new Set([...visited, r.to]));
    };
    walk(start, [], new Set([start]));
    const graph = this.wm.view("graph");
    return best.map((r) => ({
      from: graph.entity(r.from)?.name ?? r.from,
      relation: r.type,
      to: graph.entity(r.to)?.name ?? r.to,
      source: String(r.attrs?.source ?? ""),
      row_id: String(r.attrs?.row_id ?? ""),
      row_ids: Array.isArray(r.attrs?.row_ids) ? (r.attrs.row_ids as string[]) : [String(r.attrs?.row_id ?? "")],
      status: r.attrs?.status === "inferred" || r.attrs?.status === "unresolved" ? (r.attrs.status as "inferred" | "unresolved") : "observed",
      ...(r.attrs?.detail ? { detail: String(r.attrs.detail) } : {}),
    }));
  }

  stats(): { events: number; writes: number; components: number } {
    return { events: this.wm.events().length, writes: this.writes, components: this.knownComponents() };
  }
}
