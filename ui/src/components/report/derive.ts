// Pure helpers shared by the report views.

import type { ExperimentRun, Investigation } from '../../types'
import { ARM_ROLE } from '../../lib/labels'

/** What the path means depends on what the experiments established. */
export function pathTitle(inv: Investigation) {
  if (!inv.verdict) return 'Dependency path so far'
  return inv.verdict.verdict === 'reproduced_failure' ? 'How the change reaches the failure' : 'The path Domino examined'
}

/** Each run's role, with repeats and who asked for them made explicit. */
export function armLabel(x: ExperimentRun, all: ExperimentRun[]) {
  const before = all.slice(0, all.indexOf(x)).filter((y) => y.variant === x.variant).length
  return `${ARM_ROLE[x.variant]}${before > 0 ? `, repeat ${before}` : ''}`
}

export function requestedBy(x: ExperimentRun) {
  return x.requestedBy === 'harness' ? 'Added by the harness' : x.requestedBy === 'agent' ? 'Requested by the agent' : null
}


/** Every observation recorded by any run, in first-seen order. */
export function observationKeys(inv: Investigation): string[] {
  return [...new Set(inv.experiments.flatMap((x) => Object.keys(x.observations)))]
}

const failedChecks = (x: ExperimentRun) => x.assertions.filter((a) => !a.passed).map((a) => a.name)
const list = (names: string[]) => names.join(', ')

/**
 * Plain statements about what the recorded runs show for one observation:
 * whether it moved, whether repeats agree, and what the control did. Nothing
 * is inferred beyond the runs themselves.
 */
export function instrumentNotes(inv: Investigation, key: string): string[] {
  const done = inv.experiments.filter((x) => x.completed)
  const base = done.find((x) => x.variant === 'baseline')
  const cands = done.filter((x) => x.variant === 'candidate')
  const control = done.find((x) => x.variant === 'control')
  const notes: string[] = []

  const b = base?.observations[key]
  const moved = cands.map((x) => x.observations[key]).filter((v) => v !== undefined && v !== b)
  if (base && b !== undefined && cands.length > 0) {
    notes.push(
      moved.length > 0
        ? `${key} went from ${b} to ${[...new Set(moved)].join(' / ')} with the change. A changed value is not a failure by itself; pass and fail come from the checks.`
        : `${key} read the same with and without the change.`,
    )
  }

  if (cands.length > 0) {
    const failing = cands.filter((x) => failedChecks(x).length > 0)
    const names = [...new Set(failing.flatMap(failedChecks))]
    if (failing.length === 0) {
      notes.push(cands.length === 1 ? 'The candidate run passed every check.' : `All ${cands.length} candidate runs passed every check.`)
    } else if (cands.length === 1) {
      notes.push(`The candidate run failed ${list(names)}.`)
    } else {
      notes.push(`${failing.length} of ${cands.length} candidate runs failed ${list(names)}${failing.length === cands.length ? ': the repeat agrees.' : '.'}`)
    }
  }

  if (control) {
    const f = failedChecks(control)
    notes.push(f.length === 0 ? 'With the change undone, the control passed every check.' : `With the change undone, the control still failed ${list(f)}.`)
  } else if (done.length > 0) {
    notes.push('No control run (change undone) was recorded.')
  }
  return notes
}
