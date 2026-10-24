// Print a readable step-by-step view of the latest (or given) run's trace.
import { readdirSync, readFileSync } from "node:fs";
const dir = process.argv[2] ?? `runs/${readdirSync("runs").filter((d) => d.startsWith("run-")).sort().at(-1)}`;
for (const line of readFileSync(`${dir}/trace.jsonl`, "utf8").trim().split("\n")) {
  const e = JSON.parse(line);
  const s = String(e.seq).padStart(2);
  switch (e.type) {
    case "model_call": console.log(`${s} · model ${e.purpose} ${e.outcome} ${e.latency_ms}ms ${e.routed_model ?? ""}`); break;
    case "usl_query": console.log(`${s} QUERY  ${e.result.sql.slice(0, 110)} → ${e.result.rows.length} rows ${e.result.error ?? ""}`); break;
    case "dependency_path": console.log(`${s} PATH   ${e.path.edges.map((x: any) => `${x.from}-${x.relation}->${x.to}`).join("  ")}`); break;
    case "hypothesis": console.log(`${s} HYP    ${e.hypothesis_id} [${e.status}] ${e.claim.slice(0, 120)} | for=${e.evidence_for.join(",")}`); break;
    case "revision": console.log(`${s} REVISE ${e.what_changed.slice(0, 120)}`); break;
    case "experiment_requested": console.log(`${s} RUN    ${e.request.variant} ${JSON.stringify(e.request.params ?? {})} observe=${e.request.observe.join(",")} | ${e.rationale.slice(0, 90)}`); break;
    case "experiment_result": console.log(`${s} RESULT ${e.result.request.variant} ${JSON.stringify(e.result.observations)} failed=${e.result.assertions.filter((a: any) => !a.passed).map((a: any) => a.name).join(",") || "none"}`); break;
    case "verdict": console.log(`${s} VERDICT ${e.verdict} · ${e.headline}\n   tested: ${e.tested.join(" | ")}\n   limits: ${e.limitations.join(" | ")}`); break;
    case "error": console.log(`${s} ERROR  ${e.stage}: ${e.message}`); break;
    default: console.log(`${s} ${e.type}`);
  }
}
