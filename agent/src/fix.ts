// Verified fixes: after a reproduced failure, the investigator expresses its mitigation as
// overrides of settings the world exposes, and the harness re-runs the world with them applied.
// Code decides whether the fix held (judgeFix); the model only proposes it.

import type { ExperimentCatalog, ExperimentRequest, ExperimentResult, FixTrim, FixVerification } from "../../contracts/agent/types.js";
import { names } from "./chain.js";
import { judgeFix } from "./judge.js";
import type { ChatMessage, ChatRequest, ChatResult, ToolSpec } from "./llm/nightshift.js";
import type { ToolGateway } from "./tools.js";

type Overridable = NonNullable<ExperimentCatalog["overridable"]>[number];
type Value = string | number | boolean;

export const FIX_ROUNDS = 2;
const CANDIDATE_REPEATS = 2;

const PROPOSE_FIX: ToolSpec = {
  type: "function",
  function: {
    name: "propose_fix",
    description: "Express your mitigation as concrete setting overrides; Domino re-runs the world with them applied.",
    parameters: {
      type: "object",
      properties: {
        overrides: {
          type: "array",
          description: "One entry per setting to change",
          items: {
            type: "object",
            properties: { target: { type: "string", description: "a target from the list" }, value: { type: "string", description: "the new value" } },
            required: ["target", "value"],
          },
        },
        mitigation: { type: "string", description: "The fix in plain words, as engineers should read it" },
      },
      required: ["overrides", "mitigation"],
    },
  },
};

/** Turn the model's [{target, value}] into typed overrides, or say what is wrong with them. */
export function parseOverrides(raw: unknown, targets: Overridable[]): { overrides: Record<string, Value> } | { error: string } {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.entries(raw).map(([target, value]) => ({ target, value })) : [];
  const overrides: Record<string, Value> = {};
  for (const item of list as Array<{ target?: unknown; value?: unknown }>) {
    const t = targets.find((x) => x.target === String(item?.target ?? ""));
    if (!t) return { error: `"${String(item?.target)}" is not an overridable setting. Use only: ${targets.map((x) => x.target).join(", ")}.` };
    const text = String(item.value ?? "").trim();
    let value: Value = text;
    if (t.type === "number") {
      value = Number(text);
      if (!Number.isFinite(value)) return { error: `${t.target} needs a number, got "${text}".` };
    } else if (t.type === "boolean") {
      if (!/^(true|false)$/i.test(text)) return { error: `${t.target} needs true or false, got "${text}".` };
      value = /^true$/i.test(text);
    }
    if (value === t.current) return { error: `${t.target} is already ${t.current}; an override must change it.` };
    overrides[t.target] = value;
  }
  if (!Object.keys(overrides).length) return { error: "Give at least one override." };
  return { overrides };
}

const line = (r: ExperimentResult) =>
  `[${r.experiment_id}] ${r.request.variant} + fix: ${Object.entries(r.observations).map(([k, v]) => `${k}=${v}`).join(", ")}; ${r.assertions.filter((a) => !a.passed).map((a) => `FAILED ${a.name} (${a.detail})`).join("; ") || (r.completed ? "all assertions passed" : `did not run: ${r.logs_tail}`)}`;

const passes = (r: ExperimentResult | null) => !!r && r.completed && r.assertions.every((a) => a.passed);

/**
 * P4: keep only the overrides a fix needs. Each override is first tried alone (which also tells its kind:
 * does it bring the metrics the cause chain names back to baseline, or only add headroom?). Then overrides are
 * dropped one at a time, least preferred first, while the candidate still passes. The reduced set is
 * re-verified the usual way; if it does not hold, the full set stands. Code decides all of this; no model call.
 */
export async function trimFix(o: {
  overrides: Record<string, Value>;
  run: (variant: "candidate" | "baseline", overrides: Record<string, Value>) => Promise<ExperimentResult | null>;
  failing: ExperimentResult;
  baseline?: ExperimentResult;
  /** Text of the cause chain, to prefer the override it points at. */
  chainText: string;
  /** A verification run of the candidate with every override applied (gives a single override's kind for free). */
  fullCandidate?: ExperimentResult;
}): Promise<{ kept: Record<string, Value>; trim: FixTrim; verified: { status: "verified" | "failed" | "untested"; reasons: string[] } | null; runs: ExperimentResult[] } | null> {
  const keys = Object.keys(o.overrides);
  const runs: ExperimentResult[] = [];
  const run = async (variant: "candidate" | "baseline", keep: string[]) => {
    const r = await o.run(variant, Object.fromEntries(keep.map((k) => [k, o.overrides[k]!])));
    if (r) runs.push(r);
    return r;
  };
  // Every metric the change moved. A fix removes the cause only if all of them return to baseline; if some stay
  // moved while the checks pass, it only adds headroom (e.g. more workers absorb added latency that is still there).
  const moved = o.baseline ? Object.keys(o.failing.observations).filter((m) => String(o.baseline!.observations[m]) !== String(o.failing.observations[m])) : [];
  const kindOf = (r: ExperimentResult | null): FixTrim["kinds"][string] =>
    !r || !o.baseline || !moved.length ? "undetermined" : moved.every((m) => String(r.observations[m]) === String(o.baseline!.observations[m])) ? "removes_cause" : "adds_headroom";

  if (keys.length < 2) {
    const kinds = Object.fromEntries(keys.map((k) => [k, kindOf(o.fullCandidate ?? null)])) as FixTrim["kinds"];
    return { kept: { ...o.overrides }, trim: { proposed: { ...o.overrides }, not_needed: [], alternatives: [], kinds, experiments: [] }, verified: null, runs };
  }
  const alone = new Map<string, ExperimentResult | null>();
  for (const k of keys) {
    const r = await run("candidate", [k]);
    if (!r) return null; // data layer unavailable: keep the verified fix as it was
    alone.set(k, r);
  }
  const kinds = Object.fromEntries(keys.map((k) => [k, kindOf(alone.get(k)!)])) as FixTrim["kinds"];
  const trim: FixTrim = { proposed: { ...o.overrides }, not_needed: [], alternatives: [], kinds, experiments: [] };

  // Keep preference: removes the cause, then named in the cause chain, then fixes it alone. Drop the rest first.
  const named = (k: string) => names(o.chainText, k); // whole words: "workers" in "8 workers", not "rate" in "separate"
  const score = (k: string) => (kinds[k] === "removes_cause" ? 4 : 0) + (named(k) ? 2 : 0) + (passes(alone.get(k)!) ? 1 : 0);
  const dropOrder = [...keys].sort((a, b) => score(a) - score(b));
  let kept = [...keys];
  for (const k of dropOrder) {
    if (kept.length === 1) break;
    const rest = kept.filter((x) => x !== k);
    const r = rest.length === 1 ? alone.get(rest[0]!)! : await run("candidate", rest);
    if (passes(r)) kept = rest;
  }

  let verified: { status: "verified" | "failed" | "untested"; reasons: string[] } | null = null;
  if (kept.length < keys.length) {
    const check: ExperimentResult[] = [];
    for (const variant of ["candidate", "candidate", "baseline"] as const) {
      const r = await run(variant, kept);
      if (!r) return null;
      check.push(r);
    }
    verified = judgeFix(check.filter((r) => r.request.variant === "candidate"), check.filter((r) => r.request.variant === "baseline"));
    if (verified.status !== "verified") kept = [...keys]; // the smaller set did not hold: the full fix stands
  }
  for (const k of keys.filter((x) => !kept.includes(x))) (passes(alone.get(k)!) ? trim.alternatives : trim.not_needed).push(k);
  trim.experiments = runs.map((r) => r.experiment_id);
  return { kept: Object.fromEntries(kept.map((k) => [k, o.overrides[k]!])), trim, verified, runs };
}

export async function verifyFix(ctx: {
  targets: Overridable[];
  failing: ExperimentResult; // the reproduced candidate run the fix must repair
  mitigation: string;
  messages: ChatMessage[]; // the investigator's conversation
  callModel: (req: ChatRequest) => Promise<ChatResult | null>;
  gateway: ToolGateway;
  investigatorModel?: string;
  onDataOutage: () => void;
  /** For P4: the baseline run without the fix, and the cause chain's text. */
  baseline?: ExperimentResult;
  chainText?: string;
}): Promise<{ verification: FixVerification; mitigation: string; experimentIds: Set<string> }> {
  const { targets, failing, messages, gateway } = ctx;
  const ids = new Set<string>();
  const verification: FixVerification = { status: "untested", overrides: {}, experiments: [], reasons: [], rounds: 0 };
  let mitigation = ctx.mitigation;
  let lastCandidate: ExperimentResult | undefined;
  const list = targets.map((t) => `- ${t.target} (${t.type}, currently ${JSON.stringify(t.current)})${t.description ? `: ${t.description}` : ""}`).join("\n");
  messages.push({
    role: "user",
    content:
      `The judge confirmed the failure. Domino will now test your mitigation ("${mitigation}") by re-running the world with it applied.\n` +
      `Express it as overrides of these settings (they are the only ones the world can change):\n${list}\n` +
      `Pick the values that would avoid the failure given the numbers in the evidence, and call propose_fix.`,
  });

  for (let round = 1; round <= FIX_ROUNDS; round++) {
    // Ask for the overrides (one retry if they do not parse).
    let overrides: Record<string, Value> | null = null;
    for (let attempt = 0; attempt < 2 && !overrides; attempt++) {
      const result = await ctx.callModel({ purpose: `fix_${round}${attempt ? "_retry" : ""}`, messages, tools: [PROPOSE_FIX], toolChoice: "required", ...(ctx.investigatorModel ? { model: ctx.investigatorModel } : {}) });
      if (!result) {
        verification.reasons.push("The model could not be reached to propose the fix.");
        return { verification, mitigation, experimentIds: ids };
      }
      const msg = result.message;
      const call = msg.tool_calls?.find((c) => c.function.name === "propose_fix");
      messages.push({ role: "assistant", content: msg.content ?? null, ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) });
      let args: any = null;
      try {
        args = call ? JSON.parse(call.function.arguments) : null;
      } catch {
        /* reported below */
      }
      const parsed = args ? parseOverrides(args.overrides, targets) : { error: "Call propose_fix with overrides and mitigation." };
      const reply = "error" in parsed ? `Not applied: ${parsed.error}` : `Applying ${JSON.stringify(parsed.overrides)}; the harness runs baseline and candidate with the fix.`;
      for (const c of msg.tool_calls ?? []) messages.push({ role: "tool", tool_call_id: c.id, name: c.function.name, content: c === call ? reply : "Only propose_fix is available now." });
      if (!msg.tool_calls?.length) messages.push({ role: "user", content: reply });
      if (!("error" in parsed)) {
        overrides = parsed.overrides;
        if (typeof args.mitigation === "string" && args.mitigation.trim()) mitigation = args.mitigation.trim();
      }
    }
    if (!overrides) {
      verification.reasons.push("The investigator did not express its mitigation as valid overrides.");
      return { verification, mitigation, experimentIds: ids };
    }

    // Re-run the world with the fix: candidate twice (it must hold every time), baseline once (it must not break normal operation).
    verification.rounds = round;
    verification.overrides = overrides;
    const { observe, workload, params } = failing.request;
    const withFix = (variant: ExperimentRequest["variant"]): ExperimentRequest => ({
      world_id: failing.request.world_id,
      change_id: failing.request.change_id,
      variant,
      observe,
      ...(workload ? { workload } : {}),
      params: { ...(params ?? {}), overrides },
    });
    const runs: ExperimentResult[] = [];
    for (const variant of [...Array(CANDIDATE_REPEATS).fill("candidate"), "baseline"] as ExperimentRequest["variant"][]) {
      const r = await gateway
        .runExperiment(withFix(variant), [], `Fix verification (attempt ${round}): ${variant} re-run with the proposed fix applied (${Object.entries(overrides).map(([k, v]) => `${k}=${v}`).join(", ")}).`)
        .catch((err: Error) => {
          if (err.name !== "DataLayerUnavailable") throw err;
          ctx.onDataOutage();
          return null;
        });
      if (!r) {
        verification.status = "untested";
        verification.reasons = ["The data layer was unavailable while testing the fix."];
        return { verification, mitigation, experimentIds: ids };
      }
      ids.add(r.experiment_id);
      verification.experiments.push(r.experiment_id);
      runs.push(r);
    }
    lastCandidate = runs.find((r) => r.request.variant === "candidate");
    const decision = judgeFix(runs.filter((r) => r.request.variant === "candidate"), runs.filter((r) => r.request.variant === "baseline"));
    verification.status = decision.status;
    verification.reasons = decision.reasons;
    if (decision.status !== "failed" || round === FIX_ROUNDS) break;
    messages.push({
      role: "user",
      content: `The fix did not hold. ${decision.reasons.join(" ")}\n${runs.map(line).join("\n")}\nPropose a corrected fix with propose_fix (one more attempt).`,
    });
  }
  if (verification.status === "verified") {
    const { observe, workload, params } = failing.request;
    const trimmed = await trimFix({
      overrides: verification.overrides,
      failing,
      ...(ctx.baseline ? { baseline: ctx.baseline } : {}),
      chainText: ctx.chainText ?? "",
      ...(lastCandidate ? { fullCandidate: lastCandidate } : {}),
      run: async (variant, overrides) => {
        const r = await gateway
          .runExperiment(
            { world_id: failing.request.world_id, change_id: failing.request.change_id, variant, observe, ...(workload ? { workload } : {}), params: { ...(params ?? {}), overrides } },
            [],
            `Fix verification (keeping only what is needed): ${variant} with ${Object.entries(overrides).map(([k, v]) => `${k}=${v}`).join(", ")}.`,
          )
          .catch((err: Error) => {
            if (err.name !== "DataLayerUnavailable") throw err;
            ctx.onDataOutage();
            return null;
          });
        if (r) ids.add(r.experiment_id);
        return r;
      },
    });
    if (trimmed) {
      verification.trim = trimmed.trim;
      verification.overrides = trimmed.kept;
      if (trimmed.trim.not_needed.length || trimmed.trim.alternatives.length) {
        verification.experiments.push(...trimmed.runs.filter((r) => trimmed.trim.experiments.includes(r.experiment_id)).map((r) => r.experiment_id));
        verification.reasons = [...(trimmed.verified?.reasons ?? verification.reasons), `Only ${Object.keys(trimmed.kept).join(", ")} ${Object.keys(trimmed.kept).length === 1 ? "is" : "are"} needed.`];
      }
    }
  }
  return { verification, mitigation, experimentIds: ids };
}
