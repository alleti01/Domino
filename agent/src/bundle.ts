// Evidence bundle: the product's deliverable. Built from a run's trace alone, so live runs and
// judge replays produce the same artifact. bundle.json is structured; report.md is a PR comment.

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EvidenceBundle, ExperimentResult, TraceEvent } from "../../contracts/agent/types.js";

export function buildBundle(events: TraceEvent[]): EvidenceBundle {
  const ev = events as any[];
  const start = ev.find((e) => e.type === "run_started");
  const verdict = ev.find((e) => e.type === "verdict");
  const finished = ev.find((e) => e.type === "run_finished");
  if (!start || !verdict) throw new Error("trace has no run_started/verdict event");

  // Facts behind every row the run touched.
  const facts = new Map<string, { source: string; facts: string }>();
  for (const e of ev) {
    if (e.type === "usl_query") {
      for (const r of e.result.rows) {
        const v = r.values;
        const text = v.subject && v.key ? `${v.subject}.${v.key} = ${v.value}` : Object.entries(v).filter(([k]) => !["source_system", "source_row_id", "scenario_id"].includes(k)).map(([k, x]) => `${k}=${x}`).join(", ");
        facts.set(r.row_id, { source: r.source, facts: text });
      }
    }
    if (e.type === "dependency_path") {
      for (const edge of e.path.edges) {
        for (const id of edge.row_ids?.length ? edge.row_ids : [edge.row_id]) {
          if (!facts.has(id)) facts.set(id, { source: edge.source, facts: edge.detail ?? `${short(edge.from)} ${edge.relation} ${short(edge.to)}` });
        }
      }
    }
  }
  const factOf = (id: string) => facts.get(id)?.facts ?? "";

  // Each experiment_result is paired with the experiment_requested event just before it.
  const experiments: EvidenceBundle["experiments"] = [];
  let pending: any = null;
  for (const e of ev) {
    if (e.type === "experiment_requested") pending = e;
    if (e.type === "experiment_result") {
      const r = e.result as ExperimentResult;
      const failed = r.assertions.filter((a) => !a.passed);
      experiments.push({
        experiment_id: r.experiment_id,
        variant: r.request.variant,
        requested_by: pending?.rationale?.startsWith("Harness confirmation") || pending?.rationale?.startsWith("Paired baseline") ? "harness" : "agent",
        rationale: pending?.rationale ?? "",
        observations: r.observations,
        failed_assertions: failed.map((a) => ({ name: a.name, detail: a.detail })),
        passed: r.completed && failed.length === 0,
        artifacts: r.artifacts,
        reproduce: r.reproduce ?? null,
      });
      pending = null;
    }
  }

  const hyps = new Map<string, any>();
  for (const e of ev) if (e.type === "hypothesis") hyps.set(e.hypothesis_id, e);

  const calls = ev.filter((e) => e.type === "model_call");
  const byModel: Record<string, number> = {};
  for (const c of calls) if (c.outcome === "ok") byModel[c.routed_model ?? "unknown"] = (byModel[c.routed_model ?? "unknown"] ?? 0) + 1;
  const okCalls = calls.filter((c) => c.outcome === "ok");
  const memory = ev.filter((e) => e.type === "memory");

  const citedIds = new Set<string>([...verdict.causal_chain.flatMap((c: any) => c.refs), ...[...hyps.values()].flatMap((h) => h.evidence_for)]);

  return {
    bundle_version: "1",
    run_id: start.run_id,
    replay: Boolean(start.replay),
    mode: start.mode,
    change: { change_id: start.change.change_id, world_id: start.change.world_id, title: start.change.title, files: start.change.files, diff: start.change.diff },
    verdict: {
      verdict: verdict.verdict,
      headline: verdict.headline,
      cause: null,
      decided_by: verdict.decided_by,
      tested: verdict.tested,
      limitations: verdict.limitations,
      mitigation: verdict.mitigation ? { text: verdict.mitigation, verified: false } : null,
    },
    causal_chain: verdict.causal_chain.map((c: any) => ({ edge: c.edge, status: c.status, evidence: c.refs.map((id: string) => ({ row_id: id, facts: factOf(id) })) })),
    experiments,
    hypotheses: [...hyps.values()].map((h) => ({ hypothesis_id: h.hypothesis_id, claim: h.claim, mechanism: h.mechanism, status: h.status, evidence_for: h.evidence_for })),
    cited_evidence: [...citedIds].filter((id) => facts.has(id)).map((id) => ({ row_id: id, ...facts.get(id)! })),
    models: {
      calls: calls.length,
      failed: calls.length - okCalls.length,
      all_nemotron: okCalls.length > 0 && okCalls.every((c) => String(c.routed_model ?? "").toLowerCase().includes("nemotron")),
      by_model: byModel,
      request_ids: okCalls.map((c) => c.request_id).filter(Boolean),
      total_latency_ms: okCalls.reduce((n, c) => n + (c.latency_ms ?? 0), 0),
      provider: "Meterless Nightshift",
    },
    world_model: {
      writes: memory.filter((m) => m.action === "write").length,
      reads: memory.filter((m) => m.action === "read").length,
      updates: memory.filter((m) => m.action === "update").length,
    },
    queries: ev.filter((e) => e.type === "usl_query").length,
    duration_ms: finished?.duration_ms ?? 0,
  };
}

const short = (id: string) => id.split("/").pop() ?? id;
const cell = (v: unknown) => String(v).replace(/\|/g, "\\|");

const HEADLINES: Record<string, string> = {
  reproduced_failure: "🔴 Domino: failure reproduced under tested conditions",
  no_failure_observed: "🟢 Domino: no failure observed under the tested conditions",
  inconclusive: "⚪ Domino: inconclusive",
};

/** A pull-request comment. Every number in it comes from an experiment or a cited row. */
export function renderReport(b: EvidenceBundle, cause?: string | null): string {
  const out: string[] = [];
  out.push(`### ${HEADLINES[b.verdict.verdict]}`);
  if (b.replay) out.push(`> Replayed from a recorded run (no live model or data layer).`);
  out.push(`**${b.change.title}**: ${b.verdict.headline}`);
  if (cause) out.push(`\n${cause}`);

  if (b.causal_chain.length) {
    out.push(`\n**How the change reaches the failure** (joined across sources in the semantic layer)`);
    out.push(`| # | Link | | Evidence |`, `|---|---|---|---|`);
    b.causal_chain.forEach((c, i) =>
      out.push(`| ${i + 1} | ${cell(c.edge.split("/").pop())} | ${c.status === "observed" ? "observed" : "inferred"} | ${c.evidence.map((e) => `\`${e.row_id}\`${e.facts ? ` ${cell(e.facts)}` : ""}`).join("<br>")} |`),
    );
  }

  if (b.experiments.length) {
    const keys = [...new Set(b.experiments.flatMap((x) => Object.keys(x.observations)))].slice(0, 6);
    out.push(`\n**Experiments** (same workload; only the change differs)`);
    out.push(`| Variant | ${keys.map(cell).join(" | ")} | Result |`, `|---|${keys.map(() => "---|").join("")}---|`);
    for (const x of b.experiments) {
      const label = `${x.variant}${x.variant === "control" ? " (change reverted)" : ""}${x.requested_by === "harness" ? " ·harness" : ""}`;
      out.push(`| ${label} | ${keys.map((k) => cell(x.observations[k] ?? "")).join(" | ")} | ${x.passed ? "✅ pass" : `❌ ${x.failed_assertions.map((a) => cell(a.name)).join(", ")}`} |`);
    }
  }

  if (b.verdict.mitigation) out.push(`\n**Suggested mitigation** (from Nemotron, *not verified by Domino*): ${b.verdict.mitigation.text}`);

  out.push(`\n**What was tested:** ${b.verdict.tested.length} runs. ${b.verdict.verdict === "no_failure_observed" ? "This is not a claim of production safety." : ""}`);
  if (b.verdict.limitations.length) out.push(`**Limits:** ${b.verdict.limitations.map((l) => l.replace(/\n/g, " ")).join(" · ")}`);

  const models = Object.entries(b.models.by_model).map(([m, n]) => `${m} ×${n}`).join(", ");
  out.push(
    `\n<sub>Verdict decided by Domino's deterministic judge, not the model. ${b.models.calls} model calls via ${b.models.provider}: ${models || "none"}${b.models.all_nemotron ? " (all NVIDIA Nemotron)" : ""}. ` +
      `${b.queries} semantic-layer queries · Meterless World Model: ${b.world_model.writes} writes, ${b.world_model.reads} reads, ${b.world_model.updates} updates · ${Math.round(b.duration_ms / 1000)}s · run ${b.run_id}</sub>`,
  );
  const repro = [...new Set(b.experiments.map((x) => x.reproduce).filter(Boolean))];
  if (repro.length) out.push(`\n<details><summary>Reproduce</summary>\n\n\`\`\`bash\n${repro.join("\n")}\n\`\`\`\n</details>`);
  return `${out.join("\n")}\n`;
}

/** Write bundle.json + report.md next to a run's trace. */
export async function writeBundle(runDir: string, cause: string | null): Promise<EvidenceBundle> {
  const events = (await readFile(join(runDir, "trace.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l) as TraceEvent);
  const bundle = buildBundle(events);
  bundle.verdict.cause = cause;
  await writeFile(join(runDir, "bundle.json"), `${JSON.stringify(bundle, null, 2)}\n`);
  await writeFile(join(runDir, "report.md"), renderReport(bundle, cause));
  return bundle;
}
