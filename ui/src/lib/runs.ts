import type { CaseEntry, Verdict } from '../types'

export interface RunSummary {
  /** Full-mode (Domino) runs only; ablation runs are other methods. */
  total: number
  /** Full-mode runs that reached a verdict. */
  decided: number
  /** Decided runs matching the expected verdict, when the case has one. */
  matching: number | null
  counts: Partial<Record<Verdict, number>>
  /** Runs in ablation modes (no_tools, no_experiments, no_usl). */
  ablations: number
}

export function summarizeRuns(c: CaseEntry): RunSummary {
  const counts: Partial<Record<Verdict, number>> = {}
  let decided = 0
  let matching = 0
  const full = c.runs.filter((r) => r.runMode === 'full')
  for (const r of full) {
    // Outage runs are excluded from accuracy, as in the scorecard.
    if (!r.verdict || r.status === 'outage') continue
    decided += 1
    counts[r.verdict] = (counts[r.verdict] ?? 0) + 1
    if (r.verdict === c.expectedVerdict) matching += 1
  }
  return {
    total: full.length,
    decided,
    matching: c.expectedVerdict ? matching : null,
    counts,
    ablations: c.runs.length - full.length,
  }
}

export function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
