import { useEffect, useMemo, useState } from 'react'
import { errorMessage } from './errors'
import { asRunning, loadSite, type LoadedSite } from './load'
import { agentSamplesSource, defaultSource, placeholderSource, type DataSource } from './sources'
import type { SiteData } from '../types'

export type SiteState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; site: SiteData }

/** Forces a UI state so every screen can be reviewed without a real run. */
export type PreviewState = 'normal' | 'agent-samples' | 'placeholders' | 'running' | 'loading' | 'empty' | 'error'

export const PREVIEW_STATES: { value: PreviewState; label: string }[] = [
  { value: 'normal', label: 'As loaded' },
  { value: 'agent-samples', label: 'Agent sample runs (stub world)' },
  { value: 'placeholders', label: 'Placeholders' },
  { value: 'running', label: 'Run in progress' },
  { value: 'loading', label: 'Loading' },
  { value: 'empty', label: 'No cases' },
  { value: 'error', label: 'Load error' },
]

// Events kept when previewing a run in progress: enough to show the change,
// queries and hypotheses, but no experiments or verdict yet.
const RUNNING_PREVIEW_EVENTS = 12

export function useSite(preview: PreviewState): SiteState {
  // Tagged with the source it came from, so switching sources shows loading
  // until the new data arrives.
  const [result, setResult] = useState<
    ({ ok: true; value: LoadedSite } | { ok: false; message: string }) & { source: DataSource }
  >()

  const source: DataSource =
    preview === 'agent-samples' ? agentSamplesSource : preview === 'placeholders' ? placeholderSource : defaultSource()

  useEffect(() => {
    let cancelled = false
    loadSite(source)
      .then((value) => !cancelled && setResult({ ok: true, value, source }))
      .catch((e) => !cancelled && setResult({ ok: false, message: errorMessage(e), source }))
    return () => {
      cancelled = true
    }
  }, [source])

  const loaded = result?.source === source ? result : undefined
  return useMemo<SiteState>(() => {
    if (preview === 'loading' || !loaded) return { status: 'loading' }
    if (preview === 'error') return { status: 'error', message: 'samples/manifest.json: not valid JSON (preview)' }
    if (!loaded.ok) return { status: 'error', message: loaded.message }
    const { site } = loaded.value
    if (preview === 'empty') return { status: 'ready', site: { ...site, cases: [] } }
    if (preview === 'running') return { status: 'ready', site: asRunning(loaded.value, RUNNING_PREVIEW_EVENTS) }
    return { status: 'ready', site }
  }, [loaded, preview])
}
