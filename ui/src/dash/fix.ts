// How the suggested fix is described everywhere: whether it held when Domino
// re-ran the experiments with it applied. Never "verified": it held on these
// re-runs, nothing more.

import type { Tone } from '../lib/labels'
import type { FixStatus, Investigation } from '../types'
import type { DIconName } from './icons'
import { humanize } from './ui'

export const FIX: Record<FixStatus, { label: string; tone: Tone; icon: DIconName; text: string }> = {
  held: {
    label: 'Fix held when re-run',
    tone: 'ok',
    icon: 'check',
    text: 'Domino re-ran the experiments with this fix applied, and the checks that failed passed.',
  },
  did_not_hold: {
    label: 'Fix did not hold',
    tone: 'fail',
    icon: 'x',
    text: 'Domino re-ran the experiments with this fix applied, and the checks still failed.',
  },
  not_tested: { label: 'Not tested', tone: 'warn', icon: 'minus-circle', text: 'Proposed by the model. Domino has not run it.' },
  not_applicable: { label: 'Nothing to test', tone: 'muted', icon: 'minus-circle', text: 'There was no failure for a fix to address.' },
}

/** The run's fix status; runs from before fix checks count as not tested. */
export function fixStatus(inv: Investigation): FixStatus {
  return inv.verdict?.fix?.status ?? 'not_tested'
}

/** "Workers in order-service → 12", one per setting the fix changes. */
export function fixSettings(overrides: Record<string, string | number | boolean>): { key: string; name: string; where: string | null; value: string }[] {
  return Object.entries(overrides).map(([key, value]) => {
    const h = humanize(key)
    return { key, name: h.name, where: h.scope?.split('.')[0] ?? null, value: String(value) }
  })
}

/** "workers in order-service set to 12", for sentences. */
export function fixSentence(overrides: Record<string, string | number | boolean>): string {
  return fixSettings(overrides)
    .map((s) => `${s.name.toLowerCase()}${s.where ? ` in ${s.where}` : ''} set to ${s.value}`)
    .join(', ')
}

/** One line for a PR comment or a feed: "Fix held when re-run (2 rounds)". */
export function fixLine(inv: Investigation): string {
  const f = inv.verdict?.fix
  const s = fixStatus(inv)
  const rounds = f && f.rounds > 1 && s !== 'not_tested' ? ` after ${f.rounds} attempts` : ''
  return `${FIX[s].label}${rounds}`
}
