// Deterministic verdict judge. The model proposes; this code decides. A failure is only
// "reproduced" when the same workload passes on baseline, fails on candidate (repeatably)
// and passes again on control (the change reverted).

import type { ExperimentResult, Verdict } from "../../contracts/agent/types.js";

export interface Judgement {
  verdict: Verdict;
  reasons: string[];
  tested: string[];
  failingAssertions: string[];
  groupKey: string | null;
}

const groupKeyOf = (r: ExperimentResult) => JSON.stringify({ w: r.request.workload ?? "default", p: r.request.params ?? {} });
const failed = (r: ExperimentResult) => r.assertions.filter((a) => !a.passed).map((a) => a.name);
const passes = (r: ExperimentResult) => r.completed && failed(r).length === 0;

export function describeExperiment(r: ExperimentResult): string {
  const params = Object.entries(r.request.params ?? {}).map(([k, v]) => `${k}=${v}`).join(", ");
  const outcome = !r.completed ? "did not complete" : passes(r) ? "all assertions passed" : `failed: ${failed(r).join(", ")}`;
  return `${r.experiment_id}: ${r.request.variant} · workload ${r.request.workload ?? "default"}${params ? ` (${params})` : ""} → ${outcome}`;
}

export function judge(results: ExperimentResult[]): Judgement {
  const tested = results.map(describeExperiment);
  if (!results.length) return { verdict: "inconclusive", reasons: ["No experiment was run."], tested, failingAssertions: [], groupKey: null };

  const groups = new Map<string, ExperimentResult[]>();
  for (const r of results) groups.set(groupKeyOf(r), [...(groups.get(groupKeyOf(r)) ?? []), r]);

  const reasons: string[] = [];
  let sawCleanComparison = false;
  let sawProblem = false; // any group where baseline failed or candidate failed without confirmation

  for (const [key, rs] of groups) {
    const of = (v: string) => rs.filter((r) => r.request.variant === v && r.completed);
    const baseline = of("baseline");
    const candidate = of("candidate");
    const control = of("control");
    const incomplete = rs.filter((r) => !r.completed);
    if (incomplete.length) reasons.push(`${incomplete.length} run(s) did not complete in group ${key}.`);
    if (!baseline.length || !candidate.length) continue;

    if (!baseline.every(passes)) {
      sawProblem = true;
      reasons.push(`Baseline already fails in group ${key}; the change is not isolated as the cause.`);
      continue;
    }
    const failingCandidates = candidate.filter((r) => !passes(r));
    if (failingCandidates.length) {
      const sameFailure = new Set(failingCandidates.map((r) => failed(r).sort().join("|")));
      const repeatable = failingCandidates.length >= 2 && sameFailure.size === 1 && failingCandidates.length === candidate.length;
      const controlPasses = control.length > 0 && control.every(passes);
      if (repeatable && controlPasses) {
        return {
          verdict: "reproduced_failure",
          reasons: [
            `Baseline passed ${baseline.length}×, candidate failed ${failingCandidates.length}× with the same assertion(s), control (change reverted) passed ${control.length}×.`,
          ],
          tested,
          failingAssertions: failed(failingCandidates[0]!),
          groupKey: key,
        };
      }
      sawProblem = true;
      if (!repeatable) reasons.push(`Candidate failure in group ${key} was not repeatable (${failingCandidates.length}/${candidate.length} runs failed).`);
      if (!controlPasses) reasons.push(`No passing control run in group ${key}, so the change is not confirmed as the cause.`);
      continue;
    }
    sawCleanComparison = true;
  }

  if (sawCleanComparison && !sawProblem) {
    return {
      verdict: "no_failure_observed",
      reasons: ["Baseline and candidate both passed under every tested workload."],
      tested,
      failingAssertions: [],
      groupKey: null,
    };
  }
  return { verdict: "inconclusive", reasons: reasons.length ? reasons : ["No complete baseline/candidate comparison."], tested, failingAssertions: [], groupKey: null };
}

/** Experiments the harness must add before judging: confirm a candidate failure and run its control. */
export function confirmationsNeeded(results: ExperimentResult[]): Array<{ template: ExperimentResult; variant: "candidate" | "control" | "baseline" }> {
  const needed: Array<{ template: ExperimentResult; variant: "candidate" | "control" | "baseline" }> = [];
  const groups = new Map<string, ExperimentResult[]>();
  for (const r of results) groups.set(groupKeyOf(r), [...(groups.get(groupKeyOf(r)) ?? []), r]);
  for (const rs of groups.values()) {
    const failingCandidate = rs.find((r) => r.request.variant === "candidate" && r.completed && !passes(r));
    if (!failingCandidate) continue;
    const count = (v: string) => rs.filter((r) => r.request.variant === v && r.completed).length;
    if (count("baseline") === 0) needed.push({ template: failingCandidate, variant: "baseline" });
    if (count("candidate") < 2) needed.push({ template: failingCandidate, variant: "candidate" });
    if (count("control") === 0) needed.push({ template: failingCandidate, variant: "control" });
  }
  return needed;
}
