// Independent reviewer: a second, larger Nemotron model checks the investigator's explanation
// and mitigation against the evidence the run actually retrieved. It never sets the verdict:
// causation comes from the controlled experiments and the deterministic judge. It polices the
// words: wrong numbers, unsupported claims, a mechanism the observations contradict, bad fixes.

import type { ExperimentResult, Verdict } from "../../contracts/agent/types.js";
import type { ChatModel } from "./agent.js";
import type { InvestigationState } from "./state.js";
import type { FinishArgs } from "./tools.js";

export interface Review {
  approved: boolean;
  issues: Array<{ statement: string; problem: string; refs: string[] }>;
  reviewerModel: string | null;
}

const SYSTEM = `You are an independent reviewer. A different model investigated a proposed software change; you check its written explanation against the evidence pack.
The verdict is NOT yours to judge: it was decided by a deterministic judge from controlled experiments in which baseline, candidate and control differ only by the change. Causation shown by those experiments is established.
Check:
1. Every factual statement (numbers, settings, names, limits, rates) matches the evidence pack exactly.
2. No statement is unsupported by the evidence (invented components, causes or effects).
3. The described mechanism is consistent with the experiment observations.
4. The mitigation, if any, would actually avoid the failure given the numbers in the evidence (check the arithmetic).
5. For a "no failure observed" verdict: the explanation of why it is safe uses the evidence correctly and does not overclaim production safety.
Ignore style and wording. Approve unless something material is wrong. Cite evidence ids in refs. Use the submit_review tool.`;

const TOOL = {
  type: "function" as const,
  function: {
    name: "submit_review",
    description: "Submit the review of the explanation.",
    parameters: {
      type: "object",
      properties: {
        approved: { type: "boolean", description: "true if nothing material is wrong" },
        issues: {
          type: "array",
          items: {
            type: "object",
            properties: {
              statement: { type: "string", description: "the exact statement that is wrong or unsupported" },
              problem: { type: "string", description: "what is wrong, according to the evidence" },
              refs: { type: "array", items: { type: "string" }, description: "evidence ids showing the problem" },
            },
            required: ["statement", "problem"],
          },
        },
      },
      required: ["approved", "issues"],
    },
  },
};

function evidencePack(state: InvestigationState): string {
  const rows = [...state.rowFacts.entries()].slice(0, 60).map(([id, f]) => `[${id}] ${f}`);
  const experiments = state.experiments.map((x: ExperimentResult) => {
    const obs = Object.entries(x.observations).map(([k, v]) => `${k}=${v}`).join(", ");
    const failed = x.assertions.filter((a) => !a.passed).map((a) => `${a.name} (${a.detail})`);
    return `[${x.experiment_id}] ${x.request.variant}: ${obs}; ${failed.length ? `FAILED ${failed.join("; ")}` : "all assertions passed"}`;
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
    ``,
    `Explanation to review:`,
    `Headline: ${finish.headline}`,
    `Explanation: ${finish.cause_claim ?? "(none)"}`,
    finish.mitigation ? `Mitigation: ${finish.mitigation}` : `Mitigation: (none)`,
    ``,
    evidencePack(ctx.state),
  ].join("\n");

  const result = await model.chat({
    model: reviewerModel,
    purpose: "review",
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
    tools: [TOOL],
    toolChoice: "required",
  });
  const call = result.message.tool_calls?.find((c) => c.function.name === "submit_review");
  if (!call) throw new Error("reviewer did not call submit_review");
  const args = JSON.parse(call.function.arguments) as { approved?: unknown; issues?: unknown };
  const issues = Array.isArray(args.issues)
    ? args.issues
        .filter((i: any) => i && typeof i.statement === "string" && typeof i.problem === "string")
        .map((i: any) => ({ statement: i.statement, problem: i.problem, refs: Array.isArray(i.refs) ? i.refs.map(String) : [] }))
    : [];
  return { approved: args.approved === true, issues, reviewerModel: result.receipt.routedModel };
}

/** What the investigator is told when the reviewer sends the explanation back. */
export function revisionRequest(review: Review): string {
  return [
    `An independent reviewer (${review.reviewerModel ?? "a second model"}) checked your explanation against the evidence and found problems:`,
    ...review.issues.map((i, n) => `${n + 1}. "${i.statement}": ${i.problem}${i.refs.length ? ` [${i.refs.join(", ")}]` : ""}`),
    `Fix them: retrieve or test what you need, correct the explanation and mitigation so every statement is backed by evidence, then call finish again.`,
  ].join("\n");
}
