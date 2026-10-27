import { href } from '../../lib/router'
import type { SiteData } from '../../types'
import { allRuns, shortRun } from '../derive'
import { Empty, PageHeader, Panel, rowLink, Stat, Stats } from '../ui'
import { ModelCalls } from './ModelCalls'
import { SemanticLayer } from './SemanticLayer'

export type PlatformSection = 'nemotron' | 'zetaris' | 'meterless'

export function platformSection(section: string | null): PlatformSection {
  return section === 'zetaris' || section === 'meterless' ? section : 'nemotron'
}

export const PLATFORM_TITLE: Record<PlatformSection, string> = {
  nemotron: 'Model calls',
  zetaris: 'Semantic layer',
  meterless: 'World Model',
}

function WorldModel({ site }: { site: SiteData }) {
  const rows = allRuns(site).filter((r) => r.inv)
  const ops = rows.flatMap((r) => r.inv!.memory.map((m) => ({ ...m, row: r })))
  const count = (a: string) => ops.filter((o) => o.action === a).length
  return (
    <>
      <PageHeader
        title="World Model"
        sub="The Meterless World Model holds the investigation’s state: the semantic-layer paths it found, the hypotheses it is testing and the experiments that bear on them, each with provenance. The verdict’s causal chain is built by walking that graph."
      />
      <Stats>
        <Stat label="Memory operations" value={ops.length} sub={`across ${rows.length} runs`} />
        <Stat label="Writes" value={count('write')} />
        <Stat label="Updates" value={count('update')} />
        <Stat label="Reads" value={count('read')} />
      </Stats>
      <Panel title="By run" count={rows.length} flush>
        {ops.length === 0 ? (
          <Empty icon="memory" title="No World Model operations in the loaded runs" />
        ) : (
          <div className="dx-table-wrap">
            <table className="dx-table dx-table-compact">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Change</th>
                  <th className="t-num">Writes</th>
                  <th className="t-num">Updates</th>
                  <th className="t-num">Reads</th>
                  <th>Last operation</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ caseEntry, run, inv }) => {
                  const m = inv!.memory
                  const link = href.case(caseEntry.id, { runId: run.runId, section: 'timeline' })
                  return (
                    <tr key={run.runId} {...rowLink(link)}>
                      <td>
                        <a className="dx-id" style={{ color: 'var(--dx-ink)' }} href={link}>
                          {shortRun(run.runId)}
                        </a>
                      </td>
                      <td>{caseEntry.label}</td>
                      <td className="t-num">{m.filter((x) => x.action === 'write').length}</td>
                      <td className="t-num">{m.filter((x) => x.action === 'update').length}</td>
                      <td className="t-num">{m.filter((x) => x.action === 'read').length}</td>
                      <td className="dx-muted">{m[m.length - 1]?.detail ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  )
}

export function Platform({ site, section }: { site: SiteData; section: PlatformSection }) {
  if (section === 'zetaris') return <SemanticLayer site={site} />
  if (section === 'meterless') return <WorldModel site={site} />
  return <ModelCalls site={site} />
}
