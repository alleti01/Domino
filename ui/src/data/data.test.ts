import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { toInvestigation, type RunFiles } from './adapter'
import { asRunning, loadSite } from './load'
import { parseManifest, parseTrace } from './parse'
import { agentSamplesSource, placeholderSource, type DataSource } from './sources'
import { VERDICT } from '../lib/labels'

// Abhi's real sample runs (contract v0.1.0), copied into fixtures/agent-v0.1.
const FIXTURES = join(__dirname, '../../fixtures/agent-v0.1/runs')
const REPRODUCED = 'run-20261024012543-6d5dfe'
const NO_FAILURE = 'run-20261024010745-222e42'
const traceText = (run: string) => readFileSync(join(FIXTURES, run, 'trace.jsonl'), 'utf8')

function files(text: string, extra: Partial<RunFiles> = {}): RunFiles {
  const parsed = parseTrace(text, 'trace.jsonl')
  return { events: parsed.events, summary: null, bundle: null, receipts: new Map(), parseWarnings: parsed.warnings, ...extra }
}
const META = { caseId: 'c1', label: 'Case 1', kind: 'practice' as const, isPlaceholder: false }

describe('real agent traces', () => {
  it('parse without errors or warnings', () => {
    for (const run of [REPRODUCED, NO_FAILURE]) {
      const parsed = parseTrace(traceText(run), run)
      expect(parsed.warnings).toEqual([])
      expect(parsed.events[0].type).toBe('run_started')
      expect(parsed.events.at(-1)?.type).toBe('run_finished')
    }
  })

  const inv = toInvestigation(files(traceText(REPRODUCED)), META)

  it('reads the change, verdict and status', () => {
    expect(inv.runId).toBe(REPRODUCED)
    expect(inv.status).toBe('complete')
    expect(inv.replay).toBe(false)
    expect(inv.runMode).toBe('full')
    expect(inv.change?.title).toBe('Give svc_builder read access to the mirror schema')
    expect(inv.change?.entities.map((e) => e.id)).toEqual(['svc_builder', 'mirror.*'])
    expect(inv.verdict?.verdict).toBe('reproduced_failure')
    expect(inv.verdict?.decidedBy).toBe('deterministic_judge')
  })

  it('matches every causal link to an edge in the dependency graph', () => {
    expect(inv.chain.causal).toHaveLength(3)
    expect(inv.chain.causal.every((l) => l.edge)).toBe(true)
    expect(inv.chain.causal[0].refs).toEqual([{ source: 'service_registry', ids: ['s1'] }])
    expect(inv.chain.nodes.length).toBeGreaterThan(5)
  })

  it('pairs each experiment request with its result and judges it from the assertions', () => {
    expect(inv.experiments.map((x) => [x.id, x.variant, x.outcome])).toEqual([
      ['x1', 'baseline', 'pass'],
      ['x2', 'candidate', 'fail'],
      ['x3', 'candidate', 'fail'],
      ['x4', 'control', 'pass'],
    ])
    expect(inv.experiments[0].rationale).toContain('Establish normal operation')
  })

  it('keeps the latest hypothesis status and its history', () => {
    const h1 = inv.hypotheses.find((h) => h.id === 'h1')!
    expect(h1.status).toBe('supported')
    expect(h1.history).toEqual(['open'])
    expect(h1.revisions).toHaveLength(1)
    expect(h1.experimentIds).toEqual(['x1', 'x2'])
    expect(h1.evidenceAgainst).toEqual([{ source: 'Experiments', ids: ['x1'] }])
  })

  it('records every model call with the model that answered', () => {
    expect(inv.receipts).toHaveLength(14)
    expect(inv.receipts.every((r) => r.routedModel === 'nvidia/nemotron-3.5-lightning-30b-a3b')).toBe(true)
    expect(inv.memory.map((m) => m.action)).toContain('update')
  })

  it('resolves every cited ID to evidence in the trace', () => {
    expect(inv.warnings).toEqual([])
    expect(inv.evidence.get('s1')?.source).toBe('service_registry')
    expect(inv.evidence.get('x2')?.facts.some((f) => f.startsWith('Failed: loader.loads_input'))).toBe(true)
  })

  it("flags the model's own overclaiming wording instead of hiding it", () => {
    const nfo = toInvestigation(files(traceText(NO_FAILURE)), META)
    expect(nfo.verdict?.verdict).toBe('no_failure_observed')
    expect(nfo.verdict?.headline).toContain('safe')
    expect(nfo.verdict?.wordingNote).toContain('"safe"')
    expect(nfo.chain.causal).toEqual([])
  })

  it('ignores a bundle from a different run, with a warning', () => {
    const withBundle = toInvestigation(
      files(traceText(REPRODUCED), {
        bundle: { bundle_version: '1', run_id: 'other', replay: true, mode: 'full', verdict: {} as never, causal_chain: [], experiments: [], cited_evidence: [] },
      }),
      META,
    )
    expect(withBundle.warnings[0]).toContain('bundle.json is for run other')
  })

  it('treats a trace with no run_finished as still running', () => {
    const lines = traceText(REPRODUCED).trim().split('\n').slice(0, 12).join('\n')
    const partial = toInvestigation(files(lines), META)
    expect(partial.status).toBe('running')
    expect(partial.verdict).toBeNull()
  })
})

describe('parseTrace errors', () => {
  const lines = traceText(REPRODUCED).trim().split('\n')
  const edit = (i: number, change: (e: Record<string, unknown>) => void) => {
    const copy = [...lines]
    const e = JSON.parse(copy[i])
    change(e)
    copy[i] = JSON.stringify(e)
    return copy.join('\n')
  }

  it('names the line of invalid JSON', () => {
    expect(() => parseTrace(`${lines[0]}\n{oops`, 'r.jsonl')).toThrow('r.jsonl line 2: not valid JSON')
  })
  it('names a missing required field', () => {
    expect(() => parseTrace(edit(1, (e) => delete e.entities), 'r.jsonl')).toThrow('"entities" should be an array')
  })
  it('rejects verdicts outside the three allowed values', () => {
    const i = lines.findIndex((l) => JSON.parse(l).type === 'verdict')
    expect(() => parseTrace(edit(i, (e) => (e.verdict = 'safe')), 'r.jsonl')).toThrow('verdict "safe" must be one of')
  })
  it('rejects mixed run IDs and duplicate seq numbers', () => {
    expect(() => parseTrace(edit(3, (e) => (e.run_id = 'other')), 'r.jsonl')).toThrow('differs from')
    expect(() => parseTrace(edit(3, (e) => (e.seq = 1)), 'r.jsonl')).toThrow('duplicate seq 1')
  })
  it('skips unknown event types with a warning', () => {
    const parsed = parseTrace(edit(3, (e) => (e.type = 'future_thing')), 'r.jsonl')
    expect(parsed.warnings[0]).toContain('unknown event type "future_thing"')
  })
})

describe('parseManifest', () => {
  it('refuses an unsupported schema major version', () => {
    expect(() => parseManifest(JSON.stringify({ schema_version: '1.0', cases: [] }))).toThrow("isn't supported")
  })
})

describe('loadSite', () => {
  it('groups the agent sample runs into the case the manifest names', async () => {
    const { site } = await loadSite(agentSamplesSource)
    expect(site.isPlaceholder).toBe(false)
    expect(site.cases).toHaveLength(1)
    expect(site.cases[0].runs.map((r) => r.verdict)).toEqual(['reproduced_failure', 'no_failure_observed'])
  })

  it('gives runs the manifest does not mention a case of their own', async () => {
    const noManifest: DataSource = { ...agentSamplesSource, list: () => agentSamplesSource.list().filter((p) => p !== 'manifest.json') }
    const { site } = await loadSite(noManifest)
    expect(site.cases.map((c) => c.label).sort()).toEqual([
      'Give svc_builder read access to the mirror schema',
      'Give svc_reports read access to the mirror schema',
    ])
  })

  it('loads the placeholder files end to end, Domino runs before comparison runs', async () => {
    const { site } = await loadSite(placeholderSource)
    expect(site.isPlaceholder).toBe(true)
    expect(site.cases.map((c) => c.id)).toEqual(['cloudflare', 'crowdstrike', 'surprise', 'safe'])
    expect(site.cases.flatMap((c) => c.runs).every((r) => r.load.ok)).toBe(true)
    expect(site.cases[0].runs.map((r) => r.runMode)).toEqual(['full', 'full', 'no_experiments'])
    expect(site.warnings).toEqual([])
  })

  it('keeps the site working when one run file is broken', async () => {
    const broken: DataSource = {
      ...placeholderSource,
      readText: (p) => (p === 'runs/run-placeholder-safe-1/trace.jsonl' ? Promise.resolve('{nope') : placeholderSource.readText(p)),
    }
    const { site } = await loadSite(broken)
    const all = site.cases.flatMap((c) => c.runs)
    expect(all.filter((r) => !r.load.ok)).toHaveLength(1)
    expect(all.filter((r) => r.load.ok)).toHaveLength(all.length - 1)
  })

  it('previews a run in progress by replaying only the first events', async () => {
    const site = asRunning(await loadSite(placeholderSource), 5)
    const latest = site.cases[0].runs[0]
    expect(latest.status).toBe('running')
    expect(latest.load.ok && latest.load.investigation.verdict).toBeNull()
  })
})

describe('wording rules', () => {
  it('verdict labels never claim safety or verification', () => {
    for (const v of Object.values(VERDICT)) expect(v.label).not.toMatch(/\b(safe|verified|guarantee)/i)
  })

  // Any "safe" / "verified" / "guarantee" / "prevent" in the UI's own text must be a negation
  // or a case name. Add to ALLOWED only with a reason.
  const CLAIM = /\b(safe|safely|verified|guarantee[sd]?|prevent(s|ed)?)\b/i
  const ALLOWED = [
    /safe in production/, // "none of them means the change is safe in production"
    /not a guarantee/,
    /not verified by Domino|has not tested or verified/,
    /safe changes?\b/i, // the case category that checks for false alarms
    /'safe'/, // the case kind / contract literal
    /verified: false/, // contract: mitigations are never verified
    /const OVERCLAIM/, // the detector itself
    /does not claim it would have prevented/, // honest disclaimer about real incidents
  ]
  it('the UI source never claims safety, verification or prevention', () => {
    const src = join(__dirname, '..')
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, name.name)
        if (name.isDirectory()) walk(p)
        else if (/\.tsx?$/.test(name.name) && !name.name.endsWith('.test.ts')) {
          readFileSync(p, 'utf8')
            .split('\n')
            .forEach((line, i) => {
              if (/^\s*(\/\/|\/?\*)/.test(line)) return
              if (CLAIM.test(line) && !ALLOWED.some((a) => a.test(line))) {
                offenders.push(`${p.slice(src.length + 1)}:${i + 1}: ${line.trim()}`)
              }
            })
        }
      }
    }
    walk(src)
    expect(offenders).toEqual([])
  })
})

describe('landing tour helpers', () => {
  it('builds the domino chain from the real run, adding the limit from the graph', async () => {
    const { chainTiles, experimentSummary, flagship } = await import('../lib/showcase')
    const { site } = await loadSite(agentSamplesSource)
    const show = flagship(site.cases)!
    expect(show.inv.verdict?.verdict).toBe('reproduced_failure')

    const tiles = chainTiles(show.inv)
    expect(tiles.map((t) => t.id)).toEqual(['svc_builder', 'builder', 'items.list', 'loader', 'max_items'])
    expect(tiles[0].link).toBeNull()
    expect(tiles.at(-1)?.link).toMatchObject({ relation: 'bounded_by', fromGraph: true })

    const exp = experimentSummary(show.inv)!
    expect(exp).toMatchObject({ key: 'builder.query_rows', baseline: 30, candidate: 60, control: 30, candidateFailed: true })
    // The sample doesn't state max_items' value, so none is shown.
    expect(exp.limit).toMatchObject({ name: 'max_items', value: null })
  })
})
