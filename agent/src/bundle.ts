// Evidence bundle: the product's deliverable. Built from a run's trace alone, so live runs and
// judge replays produce the same artifact. bundle.json is structured; report.md is a PR comment.

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EvidenceBundle, ExperimentResult, TraceEvent } from "../../contracts/agent/types.js";
import { refsIn } from "./chain.js";
import { rowFact } from "./facts.js";

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
        facts.set(r.row_id, { source: r.source, facts: rowFact(r.values) });
      }
    }
    if (e.type === "dependency_path") {
      // Rows seen only through a path have no content of their own here; record the source, not a borrowed fact.
      for (const edge of e.path.edges) {
        for (const id of edge.row_ids?.length ? edge.row_ids : [edge.row_id]) {
          if (!facts.has(id)) facts.set(id, { source: edge.source, facts: "" });
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
        requested_by: /^(Harness confirmation|Paired baseline|Fix verification)/.test(pending?.rationale ?? "") ? "harness" : "agent",
        fix_overrides: (r.request.params as any)?.overrides && Object.keys((r.request.params as any).overrides).length ? (r.request.params as any).overrides : null,
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

  // The cited cause chain, each cite resolved to the row facts or experiment results it points at.
  const expFacts = new Map<string, string>(experiments.map((x) => [
    x.experiment_id,
    `${x.variant}${x.fix_overrides ? " + fix" : ""}: ${Object.entries(x.observations).slice(0, 6).map(([k, v]) => `${k}=${v}`).join(", ")}${x.failed_assertions.length ? `; failed ${x.failed_assertions.map((a) => a.name).join(", ")}` : "; all checks passed"}`,
  ]));
  const known = (id: string) => facts.has(id) || expFacts.has(id);
  const cause_chain: EvidenceBundle["cause_chain"] = (verdict.cause_chain ?? []).map((h: { claim: string; cites: string[] }) => ({
    claim: h.claim,
    cites: h.cites.map((cite) => ({
      cite,
      refs: refsIn(cite, known).map((ref) => (expFacts.has(ref) ? { ref, kind: "experiment" as const, facts: expFacts.get(ref)! } : { ref, kind: "row" as const, facts: factOf(ref) })),
    })),
  }));
  const chainFailed = (verdict.limitations ?? []).some((l: string) => l.includes("did not pass Domino's citation check"));

  const citedIds = new Set<string>([...verdict.causal_chain.flatMap((c: any) => c.refs), ...[...hyps.values()].flatMap((h) => h.evidence_for)]);

  return {
    bundle_version: "1",
    run_id: start.run_id,
    replay: Boolean(start.replay),
    mode: start.mode,
    change: { change_id: start.change.change_id, world_id: start.change.world_id, title: start.change.title, files: start.change.files, diff: start.change.diff, source: start.change.source ?? null },
    verdict: {
      verdict: verdict.verdict,
      headline: verdict.headline,
      cause: null,
      decided_by: verdict.decided_by,
      tested: verdict.tested,
      limitations: verdict.limitations,
      mitigation: verdict.mitigation ? { text: verdict.mitigation, verified: verdict.fix_verification?.status === "verified" } : null,
      fix_verification: verdict.fix_verification ?? null,
    },
    causal_chain: verdict.causal_chain.map((c: any) => ({ edge: c.edge, status: c.status, detail: c.detail ?? null, evidence: c.refs.map((id: string) => ({ row_id: id, facts: factOf(id) })) })),
    cause_chain,
    cause_chain_check: chainFailed ? "failed" : cause_chain.length ? "passed" : "absent",
    experiments,
    hypotheses: [...hyps.values()].map((h) => ({ hypothesis_id: h.hypothesis_id, claim: h.claim, mechanism: h.mechanism, status: h.status, evidence_for: h.evidence_for })),
    cited_evidence: [...citedIds].filter((id) => facts.get(id)?.facts).map((id) => ({ row_id: id, ...facts.get(id)! })),
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
    review: (() => {
      const reviews = ev.filter((e) => e.type === "review");
      const last = reviews.at(-1);
      return {
        reviewer_model: reviews.find((r) => r.reviewer_model)?.reviewer_model ?? null,
        rounds: reviews.length,
        final: !last ? "not_run" : last.outcome === "approved" ? "approved" : last.outcome === "unavailable" ? "unavailable" : "flagged",
        issues: reviews.flatMap((r) => r.issues.map((i: any) => ({ round: r.round, statement: i.statement, problem: i.problem }))),
      } as EvidenceBundle["review"];
    })(),
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
  const src = b.change.source;
  if (src) out.push(`<sub>Pull request [#${src.number}](${src.url}) at \`${src.head_sha.slice(0, 7)}\`, matched to the modelled change \`${short(b.change.change_id)}\` for \`${src.folder}\`.</sub>`);
  out.push(`**${b.change.title}**: ${b.verdict.headline}`);
  if (b.cause_chain.length) {
    out.push(`\n**Why, step by step**${b.cause_chain_check === "passed" ? " (every step cites evidence from this run)" : ""}`);
    b.cause_chain.forEach((h, i) => out.push(`${i + 1}. ${h.claim}${h.cites.length ? ` <sub>${h.cites.map((c) => `\`${c.cite}\``).join(" · ")}</sub>` : ""}`));
  } else if (cause) {
    out.push(`\n${cause}`);
  }

  if (b.causal_chain.length) {
    out.push(`\n**How the change reaches the failure** (joined across sources in the semantic layer)`);
    out.push(`| # | Link | | Evidence |`, `|---|---|---|---|`);
    b.causal_chain.forEach((c, i) =>
      out.push(`| ${i + 1} | ${cell(c.edge.split("/").pop())}${c.detail ? `<br><sub>${cell(c.detail)}</sub>` : ""} | ${c.status === "observed" ? "observed" : "inferred"} | ${c.evidence.map((e) => `\`${e.row_id}\`${e.facts ? ` ${cell(e.facts)}` : ""}`).join("<br>")} |`),
    );
  }

  if (b.experiments.length) {
    const keys = [...new Set(b.experiments.flatMap((x) => Object.keys(x.observations)))].slice(0, 6);
    out.push(`\n**Experiments** (same workload; only the change differs)`);
    out.push(`| Variant | ${keys.map(cell).join(" | ")} | Result |`, `|---|${keys.map(() => "---|").join("")}---|`);
    for (const x of b.experiments) {
      const label = `${x.variant}${x.variant === "control" ? " (change reverted)" : ""}${x.fix_overrides ? " + fix" : ""}${x.requested_by === "harness" ? " ·harness" : ""}`;
      out.push(`| ${label} | ${keys.map((k) => cell(x.observations[k] ?? "")).join(" | ")} | ${x.passed ? "✅ pass" : `❌ ${x.failed_assertions.map((a) => cell(a.name)).join(", ")}`} |`);
    }
  }

  if (b.review.final !== "not_run") {
    const who = b.review.reviewer_model ?? "a second model";
    if (b.review.final === "approved") {
      const revised = b.review.rounds > 1 ? ` after ${b.review.rounds - 1} revision${b.review.rounds > 2 ? "s" : ""} (${b.review.issues.length} issue${b.review.issues.length === 1 ? "" : "s"} fixed)` : "";
      out.push(`\n**Independent review:** ✓ explanation checked against the evidence by ${who}${revised}.`);
    } else if (b.review.final === "flagged") {
      out.push(`\n**Independent review:** ⚠ ${who} still disputes part of the explanation (see limits).`);
    } else {
      out.push(`\n**Independent review:** unavailable for this run.`);
    }
  }
  const fv = b.verdict.fix_verification;
  if (b.verdict.mitigation) {
    const overrides = fv && Object.keys(fv.overrides).length ? ` <sub>(applied as ${Object.entries(fv.overrides).map(([k, v]) => `\`${k}=${v}\``).join(", ")})</sub>` : "";
    if (fv?.status === "verified") {
      const search = fv.search;
      out.push(`\n**✅ Verified fix${search?.found ? " (removes the cause)" : ""}:** ${b.verdict.mitigation.text}${overrides}\n${fv.reasons.join(" ")} Domino re-ran the world with the fix applied${fv.rounds > 1 ? ` (found on attempt ${fv.rounds})` : ""}.`);
      if (search?.found && search.replaced) out.push(`Also holds, but only adds headroom: ${Object.entries(search.replaced).map(([k, v]) => `\`${k}=${v}\``).join(", ")}.`);
      const t = search?.found ? undefined : fv.trim;
      if (search && !search.found) out.push(`${search.note}`);
      if (t) {
        // Only what was measured: did every metric the change moved return to its baseline value with this override alone?
        const kind = { removes_cause: "removes the cause: what the failure moved returns to baseline", adds_headroom: "adds headroom: the checks pass while the failure's effects stay", undetermined: "" } as const;
        const kept = Object.entries(fv.overrides).map(([k, v]) => `\`${k}=${v}\`${kind[t.kinds[k] ?? "undetermined"] ? ` (${kind[t.kinds[k]!]})` : ""}`);
        const dropped = (ks: string[]) => ks.map((k) => `\`${k}=${t.proposed[k]}\``).join(", ");
        if (t.not_needed.length || t.alternatives.length) {
          out.push(
            `Domino tried each setting: only ${kept.join(", ")} ${kept.length === 1 ? "is" : "are"} needed.` +
              (t.not_needed.length ? ` Not needed: ${dropped(t.not_needed)} (the candidate passes without ${t.not_needed.length === 1 ? "it" : "them"}).` : "") +
              (t.alternatives.length ? ` Also fixes it on its own: ${dropped(t.alternatives)}.` : ""),
          );
        } else if (kept.some((k) => k.includes("("))) {
          out.push(`Kind of fix: ${kept.join(", ")}.`);
        }
      }
    }
    else if (fv?.status === "failed") out.push(`\n**⚠ Suggested fix did not hold:** ${b.verdict.mitigation.text}${overrides}\n${fv.reasons.join(" ")}`);
    else out.push(`\n**Suggested mitigation** (from Nemotron, *not verified by Domino*${fv?.status === "untested" ? `: ${fv.reasons.join(" ")}` : ""}): ${b.verdict.mitigation.text}`);
  }

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
