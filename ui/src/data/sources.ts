// Where the dashboard reads files from. Paths are relative to the source root,
// e.g. "manifest.json" or "runs/<run_id>/trace.jsonl". Sample runs are bundled
// into the build so it works offline, from any folder, with no keys.

import { LoadError } from './errors'
import { placeholderFiles } from './placeholder'

export interface DataSource {
  name: string
  isPlaceholder: boolean
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

/** Abhi's real contract samples (stub world). Dev builds only. */
export const agentSamplesSource = globSource(
  'fixtures/agent-v0.1/',
  '../../fixtures/agent-v0.1/',
  (import.meta.env.DEV
    ? import.meta.glob('../../fixtures/agent-v0.1/**/*.{json,jsonl}', { query: '?raw', import: 'default' })
    : {}) as Loaders,
)

export const placeholderSource: DataSource = {
  name: 'built-in placeholders/',
  isPlaceholder: true,
  list: () => [...placeholderFiles().keys()],
  async readText(path) {
    const text = placeholderFiles().get(path)
    if (text == null) throw new LoadError(`placeholder ${path} not found`)
    return text
  },
}

/** Real samples once the agent has written any run, placeholders until then. */
export function defaultSource(): DataSource {
  return samplesSource.list().some((p) => p.endsWith('/trace.jsonl')) ? samplesSource : placeholderSource
}
