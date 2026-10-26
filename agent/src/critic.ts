// Independent reviewer: a second, larger Nemotron model checks the investigator's explanation
// and mitigation against the evidence the run actually retrieved. It never sets the verdict:
// causation comes from the controlled experiments and the deterministic judge. It polices the
// words: wrong numbers, unsupported claims, a mechanism the observations contradict, bad fixes.

import type { ExperimentResult, Verdict } from "../../contracts/agent/types.js";
import type { ChatModel } from "./agent.js";
import type { ChatMessage } from "./llm/nightshift.js";
import { unsupportedNumbers } from "./numbers.js";
import type { InvestigationState } from "./state.js";
import type { FinishArgs } from "./tools.js";

export interface Review {
  approved: boolean;
  issues: Array<{ statement: string; problem: string; refs: string[] }>;
  reviewerModel: string | null;
}

const SYSTEM = `You are an independent reviewer. A different model investigated a proposed software change; you check its written explanation and mitigation against the evidence pack.
The verdict is NOT yours to judge: a deterministic judge decided it from controlled experiments in which baseline, candidate and control differ only by the change. Causation shown by those experiments is established, and reasonable inferences that follow from the experiment results are fine.
Work through it as a checklist and submit it with submit_review:
1. claims: split the explanation into its factual claims (each number, setting, limit, component, cause or effect). For each, give the evidence id that supports it and mark it supported, unsupported (no evidence says this) or contradicted (evidence says otherwise). Numbers must match the evidence exactly or follow from it by simple arithmetic.
2. mitigation: if there is one, decide whether applying it would actually avoid the failure seen in the candidate experiment, doing the arithmetic against the limits in the evidence. Answer would_fix true or false with your reasoning.
3. consistency: does the explanation agree with the experiments (a failure reproduced vs. no failure observed)?
Flag only what is wrong or unsupported; do not flag wording, style or reasonable inference.`;

const TOOL = {
  type: "function" as const,
  function: {
    name: "submit_review",
    description: "Submit the checklist review of the explanation.",
    parameters: {
      type: "object",
      properties: {
        claims: {
          type: "array",
          items: {
            type: "object",
            properties: {
              statement: { type: "string", description: "one factual claim from the explanation" },
              verdict: { type: "string", enum: ["supported", "unsupported", "contradicted"] },
              evidence: { type: "string", description: "evidence id(s) for it, or the evidence that contradicts it" },
              problem: { type: "string", description: "what is wrong, if not supported" },
            },
            required: ["statement", "verdict"],
          },
        },
        mitigation: {
          type: "object",
          properties: {
            present: { type: "boolean" },
            would_fix: { type: "boolean", description: "would applying it avoid the failure, given the numbers in the evidence" },
            reasoning: { type: "string" },
          },
          required: ["present"],
        },
        consistent_with_experiments: { type: "boolean" },
        approved: { type: "boolean", description: "true if nothing material is wrong" },
        issues: {
          type: "array",
          items: { type: "object", properties: { statement: { type: "string" }, problem: { type: "string" }, refs: { type: "array", items: { type: "string" } } }, required: ["statement", "problem"] },
        },
      },
      required: ["claims", "mitigation", "consistent_with_experiments"],
    },
  },
};

function evidencePack(state: InvestigationState): string {
  const rows = [...state.rowFacts.entries()].slice(0, 60).map(([id, f]) => `[${id}] ${f}`);
  const experiments = state.experiments.map((x: ExperimentResult) => {
    const obs = Object.entries(x.observations).map(([k, v]) => `${k}=${v}`).join(", ");
    const failed = x.assertions.filter((a) => !a.passed).map((a) => `${a.name} (${a.detail})`);
    const fix = (x.request.params as any)?.overrides;
    return `[${x.experiment_id}] ${x.request.variant}${fix ? ` + fix ${JSON.stringify(fix)}` : ""}: ${obs}; ${failed.length ? `FAILED ${failed.join("; ")}${x.logs_tail ? `; log: ${x.logs_tail.slice(0, 400)}` : ""}` : "all assertions passed"}`;
  });
  return [`Retrieved facts:`, ...(rows.length ? rows : ["(none)"]), ``, `Experiments:`, ...(experiments.length ? experiments : ["(none)"])].join("\n");
}

export async function reviewExplanation(
  model: ChatModel,
  reviewerModel: string,
  ctx: { changeTitle: string; diff: string; verdict: Verdict; judgeReasons: string[]; finish: FinishArgs; state: InvestigationState },
): Promise<Review> {
  const { finish } = ctx;
  const user = [
    `Change: ${ctx.changeTitle}`,
    "```",
    ctx.diff.trim(),
    "```",
    `Judge's verdict: ${ctx.verdict} (${ctx.judgeReasons.join(" ")})`,
    `Experiments run: ${ctx.state.experiments.length}`,
    `Investigator's prediction: ${finish.prediction}`,
    ``,
    `Explanation to review:`,
    `Headline: ${finish.headline}`,
    `Explanation: ${finish.cause_claim ?? "(none)"}`,
    finish.mitigation ? `Mitigation: ${finish.mitigation}` : `Mitigation: (none)`,
    ``,
    evidencePack(ctx.state),
  ].join("\n");

  // Ultra sometimes answers in prose instead of calling the tool: read JSON from the text, else retry once.
  let args: { approved?: unknown; issues?: unknown } | null = null;
  let routed: string | null = null;
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: user },
  ];
  for (let attempt = 0; attempt < 2 && !args; attempt++) {
    const result = await model.chat({ model: reviewerModel, purpose: attempt ? "review_retry" : "review", messages, tools: [TOOL], toolChoice: "required" });
    routed = result.receipt.routedModel;
    const call = result.message.tool_calls?.find((c) => c.function.name === "submit_review");
    args = call ? safeJson(call.function.arguments) : extractReview(result.message.content);
    if (!args) {
      messages.push({ role: "assistant", content: result.message.content ?? "" });
      messages.push({ role: "user", content: 'Respond ONLY by calling submit_review, or with a single JSON object {"claims": [{"statement": string, "verdict": "supported"|"unsupported"|"contradicted", "evidence": string, "problem": string}], "mitigation": {"present": boolean, "would_fix": boolean, "reasoning": string}, "consistent_with_experiments": boolean}.' });
    }
  }
  if (!args) throw new Error("reviewer did not return a review");
  const a = args as any;
  const issues: Review["issues"] = [];
  for (const c of Array.isArray(a.claims) ? a.claims : []) {
    if (c && (c.verdict === "unsupported" || c.verdict === "contradicted")) {
      issues.push({ statement: String(c.statement ?? ""), problem: `${c.verdict}: ${c.problem ?? c.evidence ?? "no evidence supports this"}`, refs: c.evidence ? [String(c.evidence)] : [] });
    }
  }
  if (ctx.finish.mitigation && a.mitigation?.would_fix === false) {
    issues.push({ statement: ctx.finish.mitigation, problem: `mitigation would not avoid the failure: ${a.mitigation.reasoning ?? ""}`.trim(), refs: [] });
  }
  if (a.consistent_with_experiments === false) {
    issues.push({ statement: ctx.finish.headline, problem: "the explanation disagrees with the experiment results", refs: [] });
  }
  for (const i of Array.isArray(a.issues) ? a.issues : []) {
    if (i && typeof i.statement === "string" && typeof i.problem === "string" && !issues.some((x) => x.statement === i.statement)) {
      issues.push({ statement: i.statement, problem: i.problem, refs: Array.isArray(i.refs) ? i.refs.map(String) : [] });
    }
  }
  // Deterministic number check: every quantity in the explanation must come from the evidence.
  const evidenceText = [ctx.diff, ...ctx.state.rowFacts.values(), ...ctx.state.experiments.map((x) => `${JSON.stringify(x.observations)} ${x.assertions.map((s2) => s2.detail).join(" ")} ${x.logs_tail ?? ""}`)].join(" ");
  for (const n of unsupportedNumbers(`${ctx.finish.headline} ${ctx.finish.cause_claim ?? ""}`, evidenceText)) {
    issues.push({ statement: String(n), problem: `the number ${n} does not appear in the evidence and does not follow from it (deterministic check)`, refs: [] });
  }
  const checklistFound = Array.isArray(a.claims);
  return { approved: checklistFound ? issues.length === 0 : a.approved === true && issues.length === 0, issues, reviewerModel: routed };
}

/** What the investigator is told when the reviewer sends the explanation back. */
export function revisionRequest(review: Review): string {
  return [
    `An independent reviewer (${review.reviewerModel ?? "a second model"}) checked your explanation against the evidence and found problems:`,
    ...review.issues.map((i, n) => `${n + 1}. "${i.statement}": ${i.problem}${i.refs.length ? ` [${i.refs.join(", ")}]` : ""}`),
    `Fix exactly these points: for each one, correct or remove the quoted statement (retrieve or test what you need to back it), and keep the parts that were not flagged. Then call finish again.`,
  ].join("\n");
}

function safeJson(text: string): { approved?: unknown; issues?: unknown } | null {
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && ("approved" in v || "claims" in v) ? v : null;
  } catch {
    return null;
  }
}

/** Find a {"approved": ..., "issues": ...} object in a prose answer. */
export function extractReview(text: string | null): { approved?: unknown; issues?: unknown } | null {
  if (!text) return null;
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    for (let end = text.lastIndexOf("}"); end > start; end = text.lastIndexOf("}", end - 1)) {
      const found = safeJson(text.slice(start, end + 1));
      if (found) return found;
    }
  }
  return null;
}
