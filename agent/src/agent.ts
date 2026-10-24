// The investigation loop: read the change → map it through the semantic layer → hypothesize
// → choose discriminating experiments → observe → revise → finish. Then the harness confirms
// any failure (repeat + control) and the deterministic judge decides the verdict.

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { RunMode, RunSummary, Verdict } from "../../contracts/agent/types.js";
import type { EvidenceAdapter, WorldsAdapter } from "./adapters.js";
import { parseChange } from "./change.js";
import { type ChainLink, InvestigationWorld } from "./engines/worldModel.js";
import { confirmationsNeeded, judge } from "./judge.js";
import { type ChatMessage, type ChatRequest, type ChatResult, NightshiftError } from "./llm/nightshift.js";
import { isNemotron } from "./llm/receipts.js";
import { NO_TOOLS_PROMPT, SYSTEM_PROMPT, taskMessage } from "./prompts.js";
import { InvestigationState } from "./state.js";
import { type Budgets, DEFAULT_BUDGETS, ToolGateway, toolSpecs } from "./tools.js";
import { TraceWriter } from "./trace.js";

export interface ChatModel {
  chat(req: ChatRequest): Promise<ChatResult>;
}

export interface InvestigateOptions {
  changeId: string;
  mode: RunMode;
  outDir: string;
  model: ChatModel;
  evidence: EvidenceAdapter;
  worlds: WorldsAdapter;
  budgets?: Partial<Budgets>;
  /** Persist the World Model here to carry verified topology into later runs (off for scorecard runs). */
  memoryDir?: string;
  /** Mark every trace event as replayed from a recording (sample mode). */
  replay?: boolean;
  /** Checked before any model call; a failing check makes the run an outage, not a wrong answer. */
  healthCheck?: () => Promise<{ ok: boolean; detail: string }>;
}

const OUTAGE_KINDS = new Set(["offline", "upstream", "timeout", "bad_response"]);
const MAX_NUDGES = 2;

export async function investigate(opts: InvestigateOptions): Promise<RunSummary> {
  const budgets: Budgets = { ...DEFAULT_BUDGETS, ...opts.budgets };
  const started = Date.now();
  const runId = `run-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}-${randomUUID().slice(0, 6)}`;
  const trace = new TraceWriter(runId, opts.mode, join(opts.outDir, runId), opts.replay ?? false);
  await trace.init();

  const change = await opts.worlds.getChange(opts.changeId);
  const state = new InvestigationState();
  const world = new InvestigationWorld(runId, { namespace: `domino-${change.world_id}`, ...(opts.memoryDir ? { persistDir: opts.memoryDir } : {}) });
  const rememberedComponents = world.knownComponents();
  const gateway = new ToolGateway({
    mode: opts.mode,
    changeId: change.change_id,
    worldId: change.world_id,
    evidence: opts.evidence,
    worlds: opts.worlds,
    state,
    world,
    trace,
    budgets,
  });

  await trace.emit({ type: "run_started", change, budgets: { max_steps: budgets.max_steps, max_model_calls: budgets.max_model_calls, max_ms: budgets.max_ms } });
  const parsed = parseChange(change);
  await trace.emit({ type: "change_parsed", summary: parsed.summary, entities: parsed.entities });
  if (rememberedComponents > 0) {
    await trace.emit({ type: "memory", engine: "world_model", action: "read", detail: `Loaded ${rememberedComponents} components verified by earlier investigations of this system` });
  }

  let modelCalls = 0;
  let modelFailures = 0;
  let cacheHits = 0;
  let allNemotron = true;
  let outage = false;
  let prediction: RunSummary["model_prediction"] = null;
  let causeClaim: string | null = null;
  let headline: string | null = null;

  if (opts.healthCheck) {
    const health = await opts.healthCheck();
    if (!health.ok) {
      outage = true;
      await trace.emit({ type: "error", stage: "health_check", message: health.detail, recoverable: false });
    }
  }

  const callModel = async (req: ChatRequest, misrouteRetries = 1): Promise<ChatResult | null> => {
    if (outage && modelCalls === 0 && opts.healthCheck) return null; // never started: model service down
    if (modelCalls >= budgets.max_model_calls || Date.now() - started > budgets.max_ms) return null;
    modelCalls++;
    try {
      const result = await opts.model.chat(req);
      if (result.receipt.cacheStatus === "hit") cacheHits++;
      allNemotron &&= isNemotron(result.receipt);
      await trace.emit({
        type: "model_call",
        purpose: req.purpose ?? "investigate",
        routed_model: result.receipt.routedModel,
        provider_model: result.receipt.providerModel,
        request_id: result.receipt.requestId,
        latency_ms: result.latencyMs,
        attempts: result.attempts,
        outcome: "ok",
      });
      return result;
    } catch (err) {
      const e = err as NightshiftError;
      modelFailures++;
      if (e.kind === "non_nemotron" && misrouteRetries > 0) {
        await trace.emit({ type: "error", stage: "model", message: `${e.message}; retrying once`, recoverable: true });
        return callModel(req, misrouteRetries - 1);
      }
      if (e.kind === "non_nemotron") allNemotron = false;
      if (OUTAGE_KINDS.has(e.kind)) outage = true;
      await trace.emit({ type: "model_call", purpose: req.purpose ?? "investigate", routed_model: null, provider_model: null, request_id: null, latency_ms: 0, attempts: 0, outcome: "failed" });
      await trace.emit({ type: "error", stage: "model", message: e.message, recoverable: false });
      return null;
    }
  };

  if (opts.mode === "no_tools") {
    const result = await callModel({
      purpose: "single_shot",
      messages: [
        { role: "system", content: NO_TOOLS_PROMPT },
        { role: "user", content: `Investigation ${runId}.\n${taskMessage(change, parsed, budgets, opts.mode)}` },
      ],
    });
    const answer = parseJsonObject(result?.message.content ?? "");
    prediction = (["breaks", "safe", "unsure"].includes(answer?.prediction) ? answer.prediction : null) as RunSummary["model_prediction"];
    causeClaim = typeof answer?.cause_claim === "string" ? answer.cause_claim : null;
    headline = typeof answer?.headline === "string" ? answer.headline : null;
  } else {
    const tools = toolSpecs(opts.mode);
    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `Investigation ${runId}.\n` +
          taskMessage(change, parsed, budgets, opts.mode) +
          (rememberedComponents > 0
            ? `\n\nThe shared world model already holds ${rememberedComponents} components verified by earlier investigations of this system. Use inspect_world_model before re-querying what is already known.`
            : ""),
      },
    ];
    let nudges = 0;
    for (let step = 1; step <= budgets.max_steps && !gateway.finished; step++) {
      const result = await callModel({ purpose: `step_${step}`, messages, tools, toolChoice: "auto" });
      if (!result) break;
      const msg = result.message;
      messages.push({ role: "assistant", content: msg.content ?? null, ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) });

      if (!msg.tool_calls?.length) {
        if (++nudges > MAX_NUDGES) break;
        messages.push({ role: "user", content: "Continue by calling a tool. Call finish when you are done." });
        continue;
      }
      const stepsLeft = budgets.max_steps - step;
      for (const call of msg.tool_calls) {
        const output = await gateway.call(call.function.name, call.function.arguments);
        messages.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: `${output}\n[steps left: ${stepsLeft}]` });
        if (gateway.finished) break;
      }
      if (!gateway.finished && stepsLeft === 2) {
        messages.push({ role: "user", content: "Budget almost used. Run at most one more decisive experiment, then call finish." });
      } else if (!gateway.finished && stepsLeft === 1) {
        messages.push({ role: "user", content: "Last step: call finish now with your best explanation and limitations." });
      }
    }
    if (gateway.finished) {
      prediction = gateway.finished.prediction;
      causeClaim = gateway.finished.cause_claim || null;
      headline = gateway.finished.headline;
    }

    // Harness confirmation: a model-observed failure only counts after a repeat and a control run.
    if (opts.mode !== "no_experiments") {
      for (const need of confirmationsNeeded(state.experiments)) {
        const { observe, workload, params } = need.template.request;
        await gateway.runExperiment(
          { world_id: change.world_id, change_id: change.change_id, variant: need.variant, observe, ...(workload ? { workload } : {}), ...(params ? { params } : {}) },
          [],
          `Harness confirmation: ${need.variant} run required before the judge can call a reproduced failure.`,
        );
      }
    }
  }

  const judgement = judge(state.experiments);
  const verdict: Verdict = outage && judgement.verdict !== "reproduced_failure" ? "inconclusive" : judgement.verdict;
  const supported = [...state.hypotheses.values()].filter((h) => h.status === "supported" || gateway.finished?.supported_hypothesis_ids.includes(h.hypothesis_id));
  let graphChain = verdict === "reproduced_failure" ? chainToFailure(world, [change.change_id, ...parsed.entities.map((e) => e.id)], judgement.failingAssertions) : [];
  if (verdict === "reproduced_failure" && !graphChain.length) graphChain = world.longestChainFrom(change.change_id);
  if (graphChain.length) {
    await trace.emit({ type: "memory", engine: "world_model", action: "read", detail: `Causal chain traced through the world model: ${graphChain.length} provenance-carrying links` });
  }
  const causal_chain = graphChain.length
    ? graphChain.map((l) => ({ edge: `${l.from} ${l.relation} ${l.to}`, status: l.status === "unresolved" ? ("inferred" as const) : l.status, refs: [l.row_id] }))
    : supported.flatMap((h) =>
    [...h.evidence_for].map((ref) => ({
      edge: `${h.hypothesis_id}: ${h.mechanism}`,
      status: (state.isKnownRef(ref) ? "observed" : "inferred") as "observed" | "inferred",
      refs: [ref],
    })),
  );

  await trace.emit({
    type: "verdict",
    verdict,
    headline: headline ?? defaultHeadline(verdict, judgement.failingAssertions),
    causal_chain,
    tested: judgement.tested,
    limitations: [...(gateway.finished?.limitations ?? []), ...judgement.reasons.filter((r) => verdict !== "reproduced_failure" || !r.startsWith("Baseline passed")), ...(outage ? ["Model service outage during the run: this result says nothing about the change."] : []), ...(cacheHits ? [`${cacheHits} model answer(s) came from Nightshift's cache.`] : [])],
    decided_by: "deterministic_judge",
  });
  await trace.emit({ type: "run_finished", duration_ms: Date.now() - started, model_calls: modelCalls, experiments: state.experiments.length });

  const summary: RunSummary = {
    run_id: runId,
    change_id: change.change_id,
    mode: opts.mode,
    verdict,
    cause_claim: causeClaim,
    model_prediction: prediction,
    evidence_refs: [...new Set([...(gateway.finished?.evidence ?? []), ...supported.flatMap((h) => h.evidence_for)])],
    model_calls: modelCalls,
    experiments: state.experiments.length,
    duration_ms: Date.now() - started,
    outage,
    all_calls_nemotron: allNemotron && modelCalls > 0,
    model_failures: modelFailures,
    cache_hits: cacheHits,
  };
  await trace.writeSummary(summary);
  return summary;
}

/** Failing assertions are named "<component>.<check>": walk the graph from each changed entity to that component. */
function chainToFailure(world: InvestigationWorld, changed: string[], failingAssertions: string[]): ChainLink[] {
  const consumers = [...new Set(failingAssertions.map((a) => a.split(".")[0]!).filter(Boolean))];
  for (const consumer of consumers) {
    for (const entity of changed) {
      const chain = world.causalChain(entity, consumer);
      if (chain.length) return chain;
    }
  }
  return [];
}

function defaultHeadline(verdict: Verdict, failing: string[]): string {
  if (verdict === "reproduced_failure") return `Reproduced failure under tested conditions (${failing.join(", ")}).`;
  if (verdict === "no_failure_observed") return "No failure observed under the tested conditions.";
  return "Inconclusive: not enough evidence to decide.";
}

function parseJsonObject(text: string): any {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}
