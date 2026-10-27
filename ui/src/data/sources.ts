// Where the dashboard reads files from. Paths are relative to the source root,
// e.g. "manifest.json" or "runs/<run_id>/trace.jsonl". Saved runs are bundled
// into the build so it works offline, from any folder, with no keys.

import { LoadError } from './errors'

export interface DataSource {
  name: string
  isPlaceholder: boolean
  /** A project's runs folder is connected (DOMINO_RUNS_DIR), even if it has no runs yet. */
  connected?: boolean
  /** Every file path the source has. */
  list(): string[]
  readText(path: string): Promise<string>
}

type Loaders = Record<string, () => Promise<string>>

function globSource(name: string, prefix: string, files: Loaders): DataSource {
  const byPath = new Map(Object.entries(files).map(([k, load]) => [k.slice(prefix.length), load]))
  return {
    name,
    isPlaceholder: false,
    list: () => [...byPath.keys()],
    async readText(path) {
      const load = byPath.get(path)
      if (!load) throw new LoadError(`${name}${path} not found`)
      return load()
    },
  }
}

/** samples/ at the repo root: the agent's runs/<run_id>/ folders plus optional manifest, scorecard, Zetaris and receipts. */
export const samplesSource = globSource(
  'samples/',
  '../../../samples/',
  import.meta.glob('../../../samples/**/*.{json,jsonl}', { query: '?raw', import: 'default' }) as Loaders,
)

/** The saved runs. Empty until the agent has written one; the console then shows its empty state. */
export function defaultSource(): DataSource {
  return samplesSource
}

// ---------- Live: the dev server's data API (see vite.config.ts) ----------

export interface LiveListing {
  version: string
  roots: { samples: string; runs: string | null }
  files: { path: string; size: number; mtimeMs: number; from?: 'samples' | 'runs' }[]
}

/** The dev server's file listing, or null when there is no API (static build) or it is unreachable. */
export async function fetchListing(signal?: AbortSignal): Promise<LiveListing | null> {
  try {
    const res = await fetch('api/domino/files', { cache: 'no-store', signal })
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null
    const body = (await res.json()) as LiveListing
    return Array.isArray(body.files) ? body : null
  } catch {
    return null
  }
}

/** Files served live by the dev server, read on demand. `projectOnly` keeps just the connected project's runs. */
export function liveSource(listing: LiveListing, projectOnly = false): DataSource {
  const paths = listing.files.filter((f) => !projectOnly || f.from === 'runs').map((f) => f.path)
  return {
    name: [listing.roots.samples, listing.roots.runs]
      .filter((r): r is string => !!r)
      .map((r) => `${r.split('/').slice(-2).join('/')}/`)
      .join(' + '),
    isPlaceholder: false,
    connected: projectOnly && !!listing.roots.runs,
    list: () => paths,
    async readText(path) {
      const res = await fetch(`api/domino/file?path=${encodeURIComponent(path)}`, { cache: 'no-store' })
      if (!res.ok) throw new LoadError(`${path}: HTTP ${res.status}`)
      return res.text()
    },
  }
}

/** No runs at all: what the console reads when no project is connected. */
export const emptySource: DataSource = {
  name: 'no project connected',
  isPlaceholder: false,
  list: () => [],
  async readText(path) {
    throw new LoadError(`${path} not found`)
  },
}
