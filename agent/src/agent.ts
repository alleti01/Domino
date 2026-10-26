// The investigation loop: read the change → map it through the semantic layer → hypothesize
// → choose discriminating experiments → observe → revise → finish. Then the harness confirms
// any failure (repeat + control) and the deterministic judge decides the verdict.

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { FixVerification, RunMode, RunSummary, Verdict } from "../../contracts/agent/types.js";
import type { EvidenceAdapter, WorldsAdapter } from "./adapters.js";
import { parseChange } from "./change.js";
import { type Review, reviewExplanation, revisionRequest } from "./critic.js";
import { type ChainLink, InvestigationWorld } from "./engines/worldModel.js";
import { verifyFix } from "./fix.js";
import { confirmationsNeeded, judge } from "./judge.js";
import { type ChatMessage, type ChatRequest, type ChatResult, NightshiftError } from "./llm/nightshift.js";
import { isNemotron } from "./llm/receipts.js";
import { NO_TOOLS_PROMPT, SYSTEM_PROMPT, taskMessage } from "./prompts.js";
import { InvestigationState } from "./state.js";
import { type Budgets, DEFAULT_BUDGETS, type FinishArgs, ToolGateway, toolSpecs, toolsFor } from "./tools.js";
import { TraceWriter } from "./trace.js";

export const INVESTIGATOR_MODEL = process.env.DOMINO_INVESTIGATOR_MODEL ?? "nvidia/nemotron-3.5-lightning-30b-a3b";
export const REVIEWER_MODEL = process.env.DOMINO_REVIEWER_MODEL ?? "nvidia/nemotron-3-ultra-550b-a55b";
export const DEFAULT_CRITIC = { model: REVIEWER_MODEL, maxRounds: 2, revisionSteps: 6 };

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
  /** Independent second-model review of the explanation (full mode only). */
  critic?: { model: string; maxRounds: number; revisionSteps: number };
  /** Pin the investigator to a model id (else the client default, e.g. meterless/auto). */
  investigatorModel?: string;
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
  const reviewNotes: string[] = [];
  let fixVerification: FixVerification | null = null;
  const fixRuns = new Set<string>(); // fix-verification runs never count toward the main verdict

  if (opts.healthCheck) {
    const health = await opts.healthCheck();
    if (!health.ok) {
      outage = true;
      await trace.emit({ type: "error", stage: "health_check", message: health.detail, recoverable: false });
    }
  }

  /** Every model call goes through here: budgets, receipts in the trace, outage accounting. */
  let lastFailure: string | null = null;
  let recoverEmpty = false; // set by the investigator loop while it can still retry an empty reply
  const callModel = async (req: ChatRequest, misrouteRetries = 1, critical = true): Promise<ChatResult | null> => {
    lastFailure = null;
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
        return callModel(req, misrouteRetries - 1, critical);
      }
      if (e.kind === "non_nemotron") allNemotron = false;
      lastFailure = e.kind;
      // An empty completion is recoverable inside the loop; only a real outage ends the run.
      if (critical && OUTAGE_KINDS.has(e.kind) && !(e.kind === "bad_response" && recoverEmpty)) outage = true; // a reviewer failure is not an investigation outage
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
    for (const id of [change.change_id, ...parsed.entities.map((e) => e.id)]) if (id.includes("/")) gateway.entities.add(id);
    // Give the full table names up front so the model does not guess short ones.
    const usl = toolsFor(opts.mode).some((t) => t.name === "query_usl");
    const sources = usl ? await gateway.sources().catch(() => []) : [];
    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `Investigation ${runId}.\n` +
          taskMessage(change, parsed, budgets, opts.mode, sources) +
          (rememberedComponents > 0
            ? `\n\nThe shared world model already holds ${rememberedComponents} components verified by earlier investigations of this system. Use inspect_world_model before re-querying what is already known.`
            : ""),
      },
    ];
    let step = 0;
    // The investigator: Nemotron working through the tool gateway until it calls finish.
    const investigate_ = async (maxSteps: number) => {
      let nudges = 0;
      let emptyRecoveries = 0;
      let forceTool = false;
      for (let i = 1; i <= maxSteps && !gateway.finished; i++) {
        step++;
        recoverEmpty = emptyRecoveries < 2;
        const result = await callModel({ purpose: `step_${step}`, messages, tools, toolChoice: forceTool ? "required" : "auto", ...(opts.investigatorModel ? { model: opts.investigatorModel } : {}) });
        recoverEmpty = false;
        forceTool = false;
        if (!result) {
          // Nemotron sometimes returns an empty completion mid-run; ask again with a tool call required.
          if (lastFailure === "bad_response" && emptyRecoveries < 2 && !outage) {
            emptyRecoveries++;
            forceTool = true;
            messages.push({ role: "user", content: "Your previous reply was empty. Continue the investigation by calling one of the tools." });
            await trace.emit({ type: "error", stage: "model", message: `Empty completion; retrying the step with a tool call required (${emptyRecoveries}/2)`, recoverable: true });
            continue;
          }
          if (lastFailure === "bad_response") outage = true;
          break;
        }
        const msg = result.message;
        messages.push({ role: "assistant", content: msg.content ?? null, ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) });

        if (!msg.tool_calls?.length) {
          if (++nudges > MAX_NUDGES) break;
          messages.push({ role: "user", content: "Continue by calling a tool. Call finish when you are done." });
          continue;
        }
        const stepsLeft = maxSteps - i;
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
    };

    // Harness confirmation: a model-observed failure only counts after a repeat and a control run.
    const confirm = async () => {
      if (opts.mode === "no_experiments") return;
      for (const need of confirmationsNeeded(state.experiments)) {
        const { observe, workload, params } = need.template.request;
        await gateway.runExperiment(
          { world_id: change.world_id, change_id: change.change_id, variant: need.variant, observe, ...(workload ? { workload } : {}), ...(params ? { params } : {}) },
          [],
          `Harness confirmation: ${need.variant} run required before the judge can call a reproduced failure.`,
        ).catch(async (err: Error) => {
          if (err.name !== "DataLayerUnavailable") throw err;
          gateway.dataOutages++;
          await trace.emit({ type: "error", stage: "data:confirmation", message: err.message, recoverable: false });
        });
      }
    };

    // Guaranteed ending: if the steps ran out, one last call may only use finish, so every run
    // ends with an explanation, a mitigation and an independent review.
    const forceFinish = async (why: string) => {
      if (gateway.finished || outage || !toolsFor(opts.mode).some((t) => t.name === "finish")) return;
      let tested = "";
      if (toolsFor(opts.mode).some((t) => t.name === "run_experiment") && !state.experiments.some((x) => x.request.variant === "candidate" && x.completed)) {
        // Domino never concludes untested: the harness runs the minimum comparison itself.
        const catalog = await opts.worlds.catalog(change.world_id).catch(() => null);
        const observe = (catalog?.observables ?? []).map((o) => o.name);
        const results = [];
        for (const variant of ["baseline", "candidate"] as const) {
          const r = await gateway
            .runExperiment({ world_id: change.world_id, change_id: change.change_id, variant, observe }, [], "Harness minimum test: the investigation reached its budget without testing the change; Domino always compares baseline and candidate before concluding.")
            .catch(async (err: Error) => {
              if (err.name !== "DataLayerUnavailable") throw err;
              gateway.dataOutages++;
              return null;
            });
          if (r) results.push(r);
        }
        await confirm();
        tested = `\nThe harness ran the comparison you did not run:\n${results.map((r) => `[${r.experiment_id}] ${r.request.variant}: ${Object.entries(r.observations).map(([k, v]) => `${k}=${v}`).join(", ")}; ${r.assertions.filter((a) => !a.passed).map((a) => `FAILED ${a.name} (${a.detail})`).join("; ") || "all assertions passed"}`).join("\n")}`;
      }
      gateway.allowFinishUntested = true;
      messages.push({ role: "user", content: `${why}${tested}\nCall finish now: explain what the evidence and experiments show, cite the rows and experiments, propose a mitigation if it breaks, and list what you could not test.` });
      for (let attempt = 0; attempt < 2 && !gateway.finished; attempt++) {
        step++;
        const result = await callModel({ purpose: `step_${step}_finish`, messages, tools: toolSpecs(opts.mode, ["finish"]), toolChoice: "required", ...(opts.investigatorModel ? { model: opts.investigatorModel } : {}) });
        if (!result) return;
        const msg = result.message;
        messages.push({ role: "assistant", content: msg.content ?? null, ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) });
        for (const call of msg.tool_calls ?? []) {
          const output = await gateway.call(call.function.name, call.function.arguments);
          messages.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: output });
        }
      }
    };

    await investigate_(budgets.max_steps);
    await confirm();
    await forceFinish("Your step budget is used up.");

    // Independent review: a second Nemotron model checks the explanation; problems go back to the investigator.
    if (opts.critic && opts.mode === "full" && gateway.finished && !outage) {
      for (let round = 1; round <= opts.critic.maxRounds; round++) {
        const current = gateway.finished;
        if (!current) break;
        const interim = judge(state.experiments);
        let review: Review;
        try {
          const reviewerChannel: ChatModel = {
            chat: async (req) => {
              const r = await callModel(req, 1, false);
              if (!r) throw new Error("reviewer model call failed");
              return r;
            },
          };
          review = await reviewExplanation(reviewerChannel, opts.critic.model, {
            changeTitle: change.title,
            diff: change.diff,
            verdict: interim.verdict,
            judgeReasons: interim.reasons,
            finish: current,
            state,
          });
        } catch (err) {
          await trace.emit({ type: "review", round, reviewer_model: null, approved: false, issues: [], outcome: "unavailable" });
          await trace.emit({ type: "error", stage: "review", message: (err as Error).message, recoverable: true });
          reviewNotes.push("Independent review was unavailable for this run.");
          break;
        }
        const last = round === opts.critic.maxRounds;
        const outcome = review.approved ? "approved" : last ? "flagged" : "sent_back";
        await trace.emit({ type: "review", round, reviewer_model: review.reviewerModel, approved: review.approved, issues: review.issues, outcome });
        if (review.approved) break;
        if (last) {
          reviewNotes.push(...review.issues.map((i) => `Reviewer (${review.reviewerModel ?? "second model"}) flagged: "${i.statement}": ${i.problem}`));
          break;
        }
        const previous: FinishArgs = current;
        gateway.finished = null;
        messages.push({ role: "user", content: revisionRequest(review) });
        gateway.setFlagged(review.issues.map((i) => i.statement));
        await trace.emit({ type: "revision", what_changed: `Sent back by the independent reviewer: ${review.issues.map((i) => i.problem).join(" | ").slice(0, 400)}`, hypothesis_ids: [] });
        await investigate_(opts.critic.revisionSteps);
        await forceFinish("Your revision budget is used up.");
        if (!gateway.finished) gateway.finished = previous; // keep the last complete explanation
        await confirm();
      }
    }

    // Verified fix: re-run the world with the investigator's mitigation applied (full mode, reproduced failures,
    // worlds that expose overridable settings). Runs after the review so it tests the final mitigation.
    if (opts.mode === "full" && gateway.finished?.mitigation && !outage && judge(state.experiments).verdict === "reproduced_failure") {
      const targets = (await gateway.catalog().catch(() => null))?.overridable ?? [];
      const failing = [...state.experiments].reverse().find((x) => x.request.variant === "candidate" && x.completed && x.assertions.some((a) => !a.passed));
      if (targets.length && failing) {
        const fix = await verifyFix({
          targets,
          failing,
          mitigation: gateway.finished.mitigation,
          messages,
          callModel: (req) => callModel(req, 1, false),
          gateway,
          ...(opts.investigatorModel ? { investigatorModel: opts.investigatorModel } : {}),
          onDataOutage: () => gateway.dataOutages++,
        });
        fixVerification = fix.verification;
        for (const id of fix.experimentIds) fixRuns.add(id);
        gateway.finished = { ...gateway.finished, mitigation: fix.mitigation };
        if (fix.verification.status === "verified") {
          // The fix was tested directly; an experiment outranks the reviewer's opinion of it.
          for (let i = reviewNotes.length - 1; i >= 0; i--) if (reviewNotes[i]!.includes("mitigation would not avoid the failure")) reviewNotes.splice(i, 1);
        } else {
          reviewNotes.push(`Suggested fix ${fix.verification.status === "failed" ? "did not hold" : "was not tested"}: ${fix.verification.reasons.join(" ")}`);
        }
      }
    }

    if (gateway.finished) {
      prediction = gateway.finished.prediction;
      causeClaim = gateway.finished.cause_claim || null;
      headline = gateway.finished.headline;
    }
  }

  if (gateway.dataOutages > 0) outage = true; // Zetaris/data layer down at some point: not an agent mistake
  const judgement = judge(state.experiments.filter((x) => !fixRuns.has(x.experiment_id)));
  const verdict: Verdict = outage && judgement.verdict !== "reproduced_failure" ? "inconclusive" : judgement.verdict;
  // Deterministic consistency check: the model's prediction must agree with what the experiments showed.
  if (prediction === "breaks" && verdict === "no_failure_observed") {
    reviewNotes.unshift("The investigator predicted a failure, but the experiments showed none under the tested conditions; read its explanation with caution.");
  } else if (prediction === "safe" && verdict === "reproduced_failure") {
    reviewNotes.unshift("The investigator predicted the change was safe, but the experiments reproduced a failure; its explanation is not reliable.");
  }
  const supported = [...state.hypotheses.values()].filter((h) => h.status === "supported" || gateway.finished?.supported_hypothesis_ids.includes(h.hypothesis_id));
  let graphChain = verdict === "reproduced_failure" ? chainToFailure(world, [change.change_id, ...parsed.entities.map((e) => e.id)], judgement.failingAssertions) : [];
  if (verdict === "reproduced_failure" && !graphChain.length) graphChain = world.longestChainFrom(change.change_id);
  if (graphChain.length) {
    await trace.emit({ type: "memory", engine: "world_model", action: "read", detail: `Causal chain traced through the world model: ${graphChain.length} provenance-carrying links` });
  }
  const causal_chain = graphChain.length
    ? graphChain.map((l) => ({ edge: `${l.from} ${l.relation} ${l.to}`, status: l.status === "unresolved" ? ("inferred" as const) : l.status, refs: l.row_ids.length ? l.row_ids : [l.row_id], ...(l.detail ? { detail: l.detail } : {}) }))
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
    limitations: [...reviewNotes, ...(gateway.finished?.limitations ?? []), ...judgement.reasons.filter((r) => verdict !== "reproduced_failure" || !r.startsWith("Baseline passed")), ...(outage ? ["Model service outage during the run: this result says nothing about the change."] : []), ...(cacheHits ? [`${cacheHits} model answer(s) came from Nightshift's cache.`] : [])],
    decided_by: "deterministic_judge",
    ...(gateway.finished?.mitigation && verdict === "reproduced_failure" ? { mitigation: gateway.finished.mitigation } : {}),
    ...(fixVerification && verdict === "reproduced_failure" ? { fix_verification: fixVerification } : {}),
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
    fix: fixVerification && verdict === "reproduced_failure" ? fixVerification.status : null,
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
