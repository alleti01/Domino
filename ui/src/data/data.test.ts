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

describe('real live runs in samples/', () => {
  it('load cleanly, with the reviewer outcome from each run', async () => {
    const { samplesSource } = await import('./sources')
    const { site } = await loadSite(samplesSource)
    expect(site.isPlaceholder).toBe(false)
    expect(site.cases.map((c) => c.id)).toEqual(['w-k7m2', 'w-h9c5', 'w-g4k8', 'w-r1z5', 'w-d2v4', 'w-t3n6', 'w-p4r8', 'w-x3c9', 'w-y6p3', 'w-n7v2'])
    // Three repeats per world, newest first.
    for (const c of site.cases) expect(c.runs).toHaveLength(3)
    const invs = site.cases.map((c) => {
      const r = c.runs[0]
      if (!r.load.ok) throw new Error(r.load.error)
      return r.load.investigation
    })
    for (const inv of invs) {
      expect(inv.replay).toBe(false)
      expect(inv.verdict?.decidedBy).toBe('deterministic_judge')
      expect(inv.receipts.length).toBeGreaterThan(0)
    }
    const byCase = Object.fromEntries(invs.map((i) => [i.caseId, i]))
    expect(byCase['w-h9c5'].review?.outcome).toBe('flagged')
    expect(byCase['w-h9c5'].review?.issues.length).toBeGreaterThan(0)
    expect(byCase['w-k7m2'].review?.outcome).toBe('approved')
    // Print anything odd in the real data so it's visible in test output.
    for (const inv of invs) if (inv.warnings.length) console.log(inv.caseId, inv.warnings)
  })
})

describe('landing tour on the real flagship run', () => {
  it('draws the chain from labels and reads the stated limit', async () => {
    const { samplesSource } = await import('./sources')
    const { chainTiles, experimentSummary, flagship } = await import('../lib/showcase')
    const { site } = await loadSite(samplesSource)
    const show = flagship(site.cases)!
    expect(show.caseEntry.id).toBe('w-k7m2')
    expect(chainTiles(show.inv).map((t) => t.label)).toEqual([
      '0042',
      'svc_bundle_reader',
      'bundle-builder',
      'bundle.json',
      'worker-runtime',
      'worker-runtime.max_entries',
    ])
    const exp = experimentSummary(show.inv)!
    expect(exp).toMatchObject({ baseline: 140, candidate: 280, control: 140 })
    expect(exp.limit).toEqual({ name: 'worker-runtime.max_entries', value: 200, evidenceId: 'runtime_config:rc-0007' })
  })
})

describe('landing 3D story on the real flagship run', () => {
  it('takes every component, link, run and the verdict from the saved run', async () => {
    const { samplesSource } = await import('./sources')
    const { flagship } = await import('../lib/showcase')
    const { storyData } = await import('../components/landing/story/storyData')
    const { site } = await loadSite(samplesSource)
    const story = storyData(flagship(site.cases)!)!
    expect(story.path[0].label).toBe('0042')
    expect(story.path.length + story.others.length).toBe(11)
    // The one inferred link is the assumption; the component it bounds is what breaks.
    expect(story.links.filter((l) => l.status === 'inferred')).toEqual([story.assumption])
    expect(story.path[story.assumption!.from].label).toBe('worker-runtime')
    expect(story.breaks).toBe(story.assumption!.from)
    expect(story.runs.map((r) => `${r.variant}:${r.outcome}`)).toEqual([
      'baseline:pass',
      'candidate:fail',
      'candidate:fail',
      'control:pass',
    ])
    // The run left its hypothesis open; the verdict comes from the judge, not from it.
    expect(story.hypothesis?.status).toBe('open')
    expect(story.hypothesis?.claim.endsWith('.')).toBe(true)
    expect(story.verdict).toEqual({ verdict: 'reproduced_failure', decidedBy: 'deterministic_judge' })
    // The scene's short names; full identifiers stay in the page text.
    const { shortName } = await import('../components/landing/story/storyData')
    expect(story.path.map(shortName)).toEqual([
      'Change 0042',
      'Bundle reader',
      'Bundle builder',
      'bundle.json',
      'Worker runtime',
      'Max entries',
    ])
    expect(story.runs.map((r) => r.value)).toEqual([140, 280, 280, 140])
    // The landing page compares one of each; the repeated candidate stays in the report.
    expect(story.trio.map((r) => `${r.variant}:${r.value}`)).toEqual(['baseline:140', 'candidate:280', 'control:140'])
    const { measureLabel } = await import('../components/landing/story/storyData')
    expect(measureLabel('meta-store.rows_visible_to_builder')).toBe('Rows visible to builder')
  })
})

describe('report navigation', () => {
  it('opens old single-page anchors on the tab that now holds them', async () => {
    const { resolveSection, auditView } = await import('../lib/report')
    expect(resolveSection(null)).toEqual({ tab: 'summary', anchor: null })
    expect(resolveSection('chain')).toEqual({ tab: 'context', anchor: 'chain' })
    expect(resolveSection('change')).toEqual({ tab: 'context', anchor: 'change' })
    expect(resolveSection('verdict')).toEqual({ tab: 'summary', anchor: 'verdict' })
    expect(resolveSection('receipts')).toEqual({ tab: 'audit', anchor: 'receipts' })
    expect(resolveSection('experiments')).toEqual({ tab: 'experiments', anchor: null })
    expect(resolveSection('audit')).toEqual({ tab: 'audit', anchor: null })
    expect(resolveSection('nonsense')).toEqual({ tab: 'summary', anchor: null })
    expect(auditView('receipts')).toBe('receipts')
    expect(auditView('trace')).toBe('trace')
  })

  it('never presents a saved trace as running now', async () => {
    const { traceOrigin } = await import('../lib/report')
    expect(traceOrigin({ replay: false, status: 'complete' })).toBe('Saved trace, recorded from a live run')
    expect(traceOrigin({ replay: true, status: 'complete' })).toBe('Saved trace, replayed from an earlier recording')
    expect(traceOrigin({ replay: false, status: 'running' })).toMatch(/ends before a verdict/)
  })
})

describe('overview filtering', () => {
  it('searches change titles and IDs and filters by the latest verdict', async () => {
    const { samplesSource } = await import('./sources')
    const { filterCases, latestState } = await import('../lib/report')
    const { site } = await loadSite(samplesSource)
    const R = 'reproduced_failure'
    const N = 'no_failure_observed'
    expect(site.cases.map(latestState)).toEqual([R, N, R, N, R, R, N, R, N, N])
    expect(filterCases(site.cases, '', R).map((c) => c.id)).toEqual(['w-k7m2', 'w-g4k8', 'w-d2v4', 'w-t3n6', 'w-x3c9'])
    expect(filterCases(site.cases, 'shard', 'all').map((c) => c.id)).toEqual(['w-k7m2', 'w-h9c5', 'w-d2v4', 'w-t3n6', 'w-p4r8'])
    expect(filterCases(site.cases, 'template t7', 'all').map((c) => c.id)).toEqual(['w-r1z5', 'w-x3c9', 'w-y6p3', 'w-n7v2'])
    expect(filterCases(site.cases, 'shard', N).map((c) => c.id)).toEqual(['w-h9c5', 'w-p4r8'])
    expect(filterCases(site.cases, 'nothing like this', 'all')).toEqual([])
  })
})

describe('dependency map', () => {
  const load = async () => {
    const { samplesSource } = await import('./sources')
    const { site } = await loadSite(samplesSource)
    const inv = (id: string) => {
      const r = site.cases.find((c) => c.id === id)!.runs[0]
      if (!r.load.ok) throw new Error(r.load.error)
      return r.load.investigation
    }
    return inv
  }
  const noOverlap = (l: ReturnType<typeof import('../lib/graph').layoutMap>) => {
    const spots = [...l.at.values()].map((p) => `${p.layer}:${p.row}`)
    return new Set(spots).size === spots.length
  }

  it('marks the verdict path on the retrieved graph and lays it along one row', async () => {
    const { investigationMap, layoutMap, pathOnly } = await import('../lib/graph')
    const map = investigationMap((await load())('w-k7m2'))
    expect(map.path).toHaveLength(6)
    expect(map.nodes.find((n) => n.id === map.path[0])?.isChange).toBe(true)
    expect(map.edges.filter((e) => e.onPath)).toHaveLength(5)
    // Path links keep the verdict's own status: the last one is inferred.
    expect(map.edges.filter((e) => e.onPath).map((e) => e.status)).toEqual(['observed', 'observed', 'observed', 'observed', 'inferred'])
    const l = layoutMap(map)
    expect(map.path.map((id) => l.at.get(id)!.row)).toEqual([0, 0, 0, 0, 0, 0])
    const layers = map.path.map((id) => l.at.get(id)!.layer)
    expect(layers).toEqual([...layers].sort((a, b) => a - b))
    expect(new Set(layers).size).toBe(layers.length)
    expect(noOverlap(l)).toBe(true)
    expect(pathOnly(map).nodes).toHaveLength(6)
  })

  it('draws no failure path when the verdict names none', async () => {
    const { investigationMap, layoutMap } = await import('../lib/graph')
    const map = investigationMap((await load())('w-h9c5'))
    expect(map.path).toEqual([])
    expect(map.edges.some((e) => e.onPath)).toBe(false)
    expect(map.nodes).toHaveLength(11)
    expect(noOverlap(layoutMap(map))).toBe(true)
  })

  it('wraps long names after separators', async () => {
    const { wrapName } = await import('../lib/graph')
    expect(wrapName('worker-runtime.max_entries', 16)).toEqual(['worker-runtime.', 'max_entries'])
    expect(wrapName('short', 16)).toEqual(['short'])
    expect(wrapName('a.b.c.d.e.f.g.h.i.j.k.l', 4, 2)).toEqual(['a.b.', 'c.d…'])
  })
})

describe('experiment instrument', () => {
  it('states only what the recorded runs show', async () => {
    const { samplesSource } = await import('./sources')
    const { instrumentNotes } = await import('../components/report/derive')
    const { site } = await loadSite(samplesSource)
    const inv = (id: string) => {
      const r = site.cases.find((c) => c.id === id)!.runs[0]
      if (!r.load.ok) throw new Error(r.load.error)
      return r.load.investigation
    }
    expect(instrumentNotes(inv('w-k7m2'), 'meta-store.rows_visible_to_builder')).toEqual([
      'meta-store.rows_visible_to_builder went from 140 to 280 with the change. A changed value is not a failure by itself; pass and fail come from the checks.',
      '2 of 2 candidate runs failed runtime_starts_with_bundle: the repeat agrees.',
      'With the change undone, the control passed every check.',
    ])
    const calm = instrumentNotes(inv('w-p4r8'), 'meta-store.rows_visible_to_builder')
    expect(calm[1]).toBe('The candidate run passed every check.')
    expect(calm[2]).toBe('No control run (change undone) was recorded.')
  })
})

describe('3D view and shared selection', () => {
  const load = async (id: string) => {
    const { samplesSource } = await import('./sources')
    const { site } = await loadSite(samplesSource)
    const r = site.cases.find((c) => c.id === id)!.runs[0]
    if (!r.load.ok) throw new Error(r.load.error)
    return r.load.investigation
  }

  it('keeps a valid selection when the drawn scope changes', async () => {
    const { investigationMap, pathOnly, resolveSelection } = await import('../lib/graph')
    const full = investigationMap(await load('w-k7m2'))
    const off = full.nodes.find((n) => n.step == null)!
    // A context component stays selected in the full map…
    expect(resolveSelection(full, { type: 'node', id: off.id })).toEqual({ type: 'node', id: off.id })
    // …and falls back to the first doubtful path link when only the path is drawn.
    const doubt = full.edges.find((e) => e.onPath && e.status !== 'observed')!
    expect(resolveSelection(pathOnly(full), { type: 'node', id: off.id })).toEqual({ type: 'edge', id: doubt.id })
    // With no path, the default is the change itself.
    const calm = investigationMap(await load('w-h9c5'))
    expect(resolveSelection(calm, null)).toEqual({ type: 'node', id: calm.nodes.find((n) => n.isChange)!.id })
  })

  it('lights a node, its links and their far ends, and nothing else', async () => {
    const { investigationMap, selectionFocus } = await import('../lib/graph')
    const map = investigationMap(await load('w-k7m2'))
    const builder = map.nodes.find((n) => n.label === 'bundle-builder')!
    const f = selectionFocus(map, { type: 'node', id: builder.id })
    expect(f.edges.size).toBe(5)
    expect(f.nodes.size).toBe(6)
    const edge = map.edges[0]
    expect([...selectionFocus(map, { type: 'edge', id: edge.id }).nodes].sort()).toEqual([edge.from, edge.to].sort())
  })

  it('walks only the verdict path, keeping each link’s own status', async () => {
    const { investigationMap, walkSteps } = await import('../lib/graph')
    const steps = walkSteps(investigationMap(await load('w-k7m2')))
    expect(steps.map((s) => s.edge.status)).toEqual(['observed', 'observed', 'observed', 'observed', 'inferred'])
    expect(steps[4].note).toMatch(/^Inferred: proposed from the surrounding evidence/)
    expect(steps[0].from.isChange).toBe(true)
    // No path in the verdict, no walkthrough: a layout route is never presented as causal.
    expect(walkSteps(investigationMap(await load('w-h9c5')))).toEqual([])
  })

  it('places the same run in the same spots, path on the front lane', async () => {
    const { investigationMap, layoutMap, place3d, edgeControls, SPACE } = await import('../lib/graph')
    const inv = await load('w-k7m2')
    const a = place3d(layoutMap(investigationMap(inv)))
    const b = place3d(layoutMap(investigationMap(inv)))
    expect([...a]).toEqual([...b])
    const map = investigationMap(inv)
    expect(map.path.map((id) => a.get(id)!.z)).toEqual(map.path.map(() => 0))
    // Links leave the source's right edge and land on the target's left edge.
    const e = map.edges.find((x) => x.onPath)!
    const [start, , , end] = edgeControls(a.get(e.from)!, a.get(e.to)!)
    expect(start[0]).toBeCloseTo(a.get(e.from)!.x + SPACE.tileW / 2)
    expect(end[0]).toBeCloseTo(a.get(e.to)!.x - SPACE.tileW / 2)
  })

  it('shortens long labels without touching IDs', async () => {
    const { displayName } = await import('../lib/graph')
    expect(displayName('svc_bundle_reader')).toBe('svc_bundle_reader')
    expect(displayName('worker-runtime.startup_timeout_s', 22)).toBe('…startup_timeout_s')
  })
})
