// Plain-text timeline of a trace, for terminals and the judge's replay command.

import type { TraceEvent } from "../../contracts/agent/types.js";

export function renderTrace(events: TraceEvent[]): string {
  const out: string[] = [];
  const replay = events.some((e) => e.replay);
  if (replay) out.push("▶ REPLAY of a recorded run: no live model, data layer or keys involved.\n");
  for (const e of events as any[]) {
    const s = String(e.seq).padStart(2);
    switch (e.type) {
      case "run_started": out.push(`${s} CHANGE  ${e.change.title}\n${e.change.diff.trim().split("\n").map((l: string) => `           ${l}`).join("\n")}`); break;
      case "model_call": out.push(`${s} · model ${e.purpose} ${e.outcome} ${e.latency_ms}ms ${e.routed_model ?? ""}`); break;
      case "usl_query": out.push(`${s} QUERY   ${e.result.sql.replace(/\s+/g, " ").slice(0, 110)} → ${e.result.rows.length} rows ${e.result.error ?? ""}`); break;
      case "dependency_path": out.push(`${s} PATH    ${e.path.edges.map((x: any) => `${x.from.split("/").pop()} -${x.relation}-> ${x.to.split("/").pop()}`).join("  ·  ").slice(0, 300)}`); break;
      case "memory": out.push(`${s} MEMORY  [${e.engine}] ${e.action}: ${e.detail.slice(0, 120)}`); break;
      case "hypothesis": out.push(`${s} HYPO    ${e.hypothesis_id} [${e.status}] ${e.claim.slice(0, 120)}`); break;
      case "revision": out.push(`${s} REVISE  ${e.what_changed.slice(0, 120)}`); break;
      case "experiment_requested": out.push(`${s} RUN     ${e.request.variant}${Object.keys(e.request.params ?? {}).length ? " " + JSON.stringify(e.request.params) : ""} · ${e.rationale.slice(0, 100)}`); break;
      case "experiment_result": out.push(`${s} RESULT  ${e.result.request.variant}: ${Object.entries(e.result.observations).map(([k, v]) => `${k}=${v}`).join(", ").slice(0, 150)} · failed: ${e.result.assertions.filter((a: any) => !a.passed).map((a: any) => a.name).join(", ") || "none"}`); break;
      case "verdict":
        out.push(`${s} VERDICT ${e.verdict.toUpperCase()} (decided by ${e.decided_by})\n           ${e.headline}`);
        for (const c of e.causal_chain) out.push(`           ${c.status === "observed" ? "●" : "○"} ${c.edge}  [${c.refs.join(", ")}]`);
        out.push(`           tested: ${e.tested.join(" | ")}`);
        if (e.limitations.length) out.push(`           limits: ${e.limitations.join(" | ").slice(0, 400)}`);
        break;
      case "error": out.push(`${s} ERROR   ${e.stage}: ${e.message}`); break;
      case "run_finished": out.push(`${s} DONE    ${Math.round(e.duration_ms / 1000)}s · ${e.model_calls} model calls · ${e.experiments} experiments`); break;
      default: out.push(`${s} ${e.type}`);
    }
  }
  return out.join("\n");
}
