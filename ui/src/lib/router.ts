import { useMemo, useSyncExternalStore } from 'react'

// Hash routing keeps the built app working from any static host or folder.
// URLs look like  #/cases/cloudflare/pr?run=<run_id>&evidence=e7%23B-002

export type ReportView = 'investigation' | 'pr'

export type Route =
  | { name: 'home'; section: string | null }
  | { name: 'try' }
  | { name: 'cases-index' }
  | { name: 'case'; caseId: string; view: ReportView; runId: string | null; section: string | null }
  | { name: 'results' }
  | { name: 'under-the-hood' }
  | { name: 'not-found'; path: string }

export interface AppLocation {
  route: Route
  /** Evidence open in the side panel, from ?evidence=. */
  evidenceId: string | null
  /** Path without query, e.g. "/cases/cloudflare". Changes mean "new page". */
  path: string
  params: URLSearchParams
}

export function parseHash(hash: string): AppLocation {
  const raw = hash.replace(/^#/, '') || '/'
  const [pathPart, query = ''] = raw.split('?')
  const path = '/' + pathPart.split('/').filter(Boolean).join('/')
  const params = new URLSearchParams(query)
  const seg = path.split('/').filter(Boolean).map(decodeURIComponent)

  let route: Route
  if (seg.length === 0) route = { name: 'home', section: params.get('section') }
  else if (seg[0] === 'try' && seg.length === 1) route = { name: 'try' }
  else if (seg[0] === 'cases' && seg.length === 1) route = { name: 'cases-index' }
  else if (seg[0] === 'results' && seg.length === 1) route = { name: 'results' }
  else if (seg[0] === 'under-the-hood' && seg.length === 1) route = { name: 'under-the-hood' }
  else if (seg[0] === 'cases' && seg[1] && (seg.length === 2 || (seg.length === 3 && seg[2] === 'pr'))) {
    route = {
      name: 'case',
      caseId: seg[1],
      view: seg[2] === 'pr' ? 'pr' : 'investigation',
      runId: params.get('run'),
      section: params.get('section'),
    }
  } else route = { name: 'not-found', path }

  return { route, evidenceId: params.get('evidence'), path, params }
}

function build(path: string, params: Record<string, string | null | undefined> = {}): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
  const qs = q.toString()
  return `#${path}${qs ? `?${qs}` : ''}`
}

export const href = {
  home: '#/',
  /** A landing-page section, e.g. landing('how'). */
  landing: (section: string) => build('/', { section }),
  try: '#/try',
  cases: '#/cases',
  results: '#/results',
  underTheHood: '#/under-the-hood',
  case: (
    caseId: string,
    opts: { view?: ReportView; runId?: string | null; section?: string | null; evidence?: string | null } = {},
  ) =>
    build(`/cases/${encodeURIComponent(caseId)}${opts.view === 'pr' ? '/pr' : ''}`, {
      run: opts.runId,
      section: opts.section,
      evidence: opts.evidence,
    }),
}

/** The current URL with the evidence panel opened on `id`, or closed when null. */
export function withEvidence(loc: AppLocation, id: string | null): string {
  const params = Object.fromEntries(loc.params)
  return build(loc.path, { ...params, evidence: id })
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export function useLocation(): AppLocation {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  return useMemo(() => parseHash(hash), [hash])
}

export function navigate(to: string, { replace = false } = {}) {
  if (replace) window.location.replace(to)
  else window.location.hash = to.replace(/^#/, '')
}
