import type { ArmOutcome, CaseKind, HypothesisStatus, LinkStatus, RunMode, RunStatus, Variant, Verdict } from '../types'
import type { IconName } from '../components/Icon'

// The only verdict wording the UI may show. Never "safe" or "verified".
export const VERDICT: Record<Verdict, { label: string; tone: Tone; icon: IconName }> = {
  reproduced_failure: { label: 'Reproduced failure', tone: 'fail', icon: 'x-circle' },
  no_failure_observed: { label: 'No failure observed under these tests', tone: 'neutral', icon: 'minus-circle' },
  inconclusive: { label: 'Inconclusive', tone: 'warn', icon: 'help-circle' },
}

export type Tone = 'fail' | 'neutral' | 'warn' | 'ok' | 'muted' | 'accent'

/** How the deterministic judge reaches each verdict, in plain words. */
export const VERDICT_RULE: Record<Verdict, string> = {
  reproduced_failure: 'The baseline passed, the candidate failed, and the control passed again once the change was undone.',
  no_failure_observed: 'The candidate passed the same checks as the baseline, under the conditions that were tested.',
  inconclusive: 'The runs did not give the judge enough to decide either way.',
}

export const CASE_KIND: Record<CaseKind, string> = {
  inspired: 'Simulation of a real incident mechanism',
  held_out: 'Held-out case, not seen by the agent rules',
  safe: 'Safe change, checks for false alarms',
  practice: 'Practice run, not a scored case',
  other: 'Not assigned to a case yet',
}

export const RUN_MODE: Record<RunMode, { label: string; description: string }> = {
  full: { label: 'Full Domino', description: 'Semantic layer, model reasoning and experiments' },
  no_tools: { label: 'No tools', description: 'Model only: no semantic layer, no experiments' },
  no_experiments: { label: 'No experiments', description: 'Semantic layer and model, but nothing is run' },
  no_usl: { label: 'No semantic layer', description: 'Model and experiments without Zetaris' },
}

export const RUN_STATUS: Record<RunStatus, { label: string; tone: Tone; icon: IconName }> = {
  complete: { label: 'Complete', tone: 'muted', icon: 'check-circle' },
  running: { label: 'Running', tone: 'warn', icon: 'clock' },
  stopped: { label: 'Stopped', tone: 'muted', icon: 'alert' },
  failed: { label: 'Run failed', tone: 'fail', icon: 'alert' },
  outage: { label: 'Outage: excluded from scoring', tone: 'warn', icon: 'alert' },
}

// The reviewer checks the model's explanation against the evidence; it never touches the verdict.
export const REVIEW_OUTCOME: Record<
  'approved' | 'sent_back' | 'flagged' | 'unavailable',
  { label: string; tone: Tone; icon: IconName; text: string }
> = {
  approved: { label: 'Explanation approved', tone: 'ok', icon: 'check-circle', text: 'Every claim in the explanation is backed by evidence in the run.' },
  sent_back: { label: 'Sent back for revision', tone: 'warn', icon: 'help-circle', text: 'The reviewer asked for changes and the run ended before another round.' },
  flagged: { label: 'Explanation flagged', tone: 'warn', icon: 'alert', text: 'Some claims in the explanation are not supported by the evidence. The verdict still stands: it comes from the experiments, not the explanation.' },
  unavailable: { label: 'Review unavailable', tone: 'muted', icon: 'minus-circle', text: 'The reviewer model could not be reached.' },
}

export const LINK_STATUS: Record<LinkStatus, { label: string; tone: Tone }> = {
  observed: { label: 'Observed', tone: 'accent' },
  inferred: { label: 'Inferred', tone: 'warn' },
  unresolved: { label: 'Unresolved', tone: 'fail' },
}

export const HYPOTHESIS: Record<HypothesisStatus, { label: string; tone: Tone; icon: IconName }> = {
  supported: { label: 'Supported', tone: 'fail', icon: 'x-circle' },
  refuted: { label: 'Refuted', tone: 'muted', icon: 'minus-circle' },
  open: { label: 'Open', tone: 'warn', icon: 'help-circle' },
  untested: { label: 'Not tested', tone: 'muted', icon: 'clock' },
}

export const ARM_ROLE: Record<Variant, string> = {
  baseline: 'Baseline',
  candidate: 'Candidate',
  control: 'Control',
}

export const ARM_OUTCOME: Record<ArmOutcome, { label: string; tone: Tone; icon: IconName }> = {
  pass: { label: 'Pass', tone: 'ok', icon: 'check-circle' },
  fail: { label: 'Fail', tone: 'fail', icon: 'x-circle' },
  error: { label: 'Error', tone: 'warn', icon: 'alert' },
}

const TRACE_KINDS: Record<string, { label: string; icon: IconName }> = {
  run_started: { label: 'Start', icon: 'flag' },
  change_parsed: { label: 'Change', icon: 'file-code' },
  usl_query: { label: 'Zetaris', icon: 'database' },
  dependency_path: { label: 'Chain', icon: 'database' },
  model_call: { label: 'Model', icon: 'cpu' },
  hypothesis: { label: 'Hypothesis', icon: 'list' },
  memory: { label: 'Memory', icon: 'info' },
  experiment_requested: { label: 'Experiment', icon: 'flask' },
  experiment_result: { label: 'Result', icon: 'flask' },
  revision: { label: 'Revision', icon: 'list' },
  verdict: { label: 'Verdict', icon: 'flag' },
  review: { label: 'Review', icon: 'help-circle' },
  error: { label: 'Error', icon: 'alert' },
  run_finished: { label: 'Finish', icon: 'flag' },
}

export function traceKind(type: string): { label: string; icon: IconName } {
  return TRACE_KINDS[type] ?? { label: type, icon: 'list' }
}

/** "nvidia/nemotron-3.5-lightning-30b-a3b" → "nemotron-3.5-lightning-30b-a3b" */
export function shortModel(model: string): string {
  return model.split('/').pop() ?? model
}

export function isNemotron(model: string): boolean {
  return /nemotron/i.test(model)
}

export function formatMs(ms: number | null): string {
  if (ms == null) return '—'
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}
