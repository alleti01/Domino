import type { Investigation } from '../types'
import { STEPS, type Step } from '../content'
import { VERDICT } from './labels'
import { plural } from './runs'

export type StepState = 'done' | 'failed' | 'warn' | 'pending' | 'skipped'

export interface StepStatus {
  step: Step
  state: StepState
  detail: string
}

/** Where a run stands on each of the five steps, worded for the landing page and the replay. */
export function stepStatuses(inv: Investigation): StepStatus[] {
  const running = inv.status === 'running'
  const notYet = (text: string): Pick<StepStatus, 'state' | 'detail'> =>
    running ? { state: 'pending', detail: 'Waiting…' } : { state: 'skipped', detail: text }
  const sources = new Set(inv.chain.edges.flatMap((e) => e.refs.map((r) => r.source)))
  const candidateFailed = inv.experiments.some((x) => x.variant === 'candidate' && x.outcome === 'fail')
  const anyError = inv.experiments.some((x) => x.outcome === 'error')

  const byKey: Record<Step['key'], Pick<StepStatus, 'state' | 'detail'>> = {
    change: inv.change ? { state: 'done', detail: inv.change.title } : notYet('Change not recorded'),
    connect: inv.chain.edges.length
      ? { state: 'done', detail: `${plural(inv.chain.edges.length, 'link')} across ${plural(sources.size, 'source')}` }
      : notYet('No semantic-layer links'),
    suspect: inv.hypotheses.length
      ? { state: 'done', detail: `${inv.hypotheses.length} ${inv.hypotheses.length === 1 ? 'hypothesis' : 'hypotheses'}` }
      : notYet('No hypotheses'),
    test: inv.experiments.length
      ? {
          state: candidateFailed ? 'failed' : anyError ? 'warn' : 'done',
          detail: `${plural(inv.experiments.length, 'run')} · ${
            candidateFailed ? 'candidate failed' : anyError ? 'a run did not finish' : 'all passed'
          }`,
        }
      : notYet('Not run in this mode'),
    conclude: inv.verdict
      ? {
          state: inv.verdict.verdict === 'reproduced_failure' ? 'failed' : inv.verdict.verdict === 'inconclusive' ? 'warn' : 'done',
          detail: VERDICT[inv.verdict.verdict].label,
        }
      : notYet('No verdict'),
  }
  return STEPS.map((step) => ({ step, ...byKey[step.key] }))
}

/** The observation that best shows the difference: first one where the candidate differs from the baseline. */
export function keyObservation(inv: Investigation) {
  const baseline = inv.experiments.find((x) => x.variant === 'baseline' && x.completed)
  const candidate =
    inv.experiments.find((x) => x.variant === 'candidate' && x.outcome === 'fail') ??
    inv.experiments.find((x) => x.variant === 'candidate' && x.completed)
  if (!baseline || !candidate) return null
  const key =
    Object.keys(candidate.observations).find((k) => candidate.observations[k] !== baseline.observations[k]) ??
    Object.keys(candidate.observations)[0]
  if (!key) return null
  return { key, baseline: baseline.observations[key], candidate: candidate.observations[key] }
}
