// Overview: one answer with the verdict mix beside it, four platform tiles,
// then the changes in two lists side by side, by what Domino found.

import { latestState, type LatestState } from '../../lib/report'
import { href } from '../../lib/router'
import type { CaseEntry, SiteData } from '../../types'
import { agreement, allRuns, citedSources, fmtDate, isExample, latestInv, pct, siteStats } from '../derive'
import { DIcon, type DIconName } from '../icons'
import { Alert, Empty, ExampleTag, PageHeader, Panel, Pips, VERDICT_SHORT } from '../ui'

const MARK: Record<LatestState, { icon: DIconName; tone: string }> = {
  reproduced_failure: { icon: 'x-circle', tone: 'fail' },
  no_failure_observed: { icon: 'minus-circle', tone: 'neutral' },
  inconclusive: { icon: 'help-circle', tone: 'warn' },
  incomplete: { icon: 'clock', tone: 'accent' },
  failed: { icon: 'alert', tone: 'fail' },
  outage: { icon: 'alert', tone: 'warn' },
  unreadable: { icon: 'alert', tone: 'fail' },
  none: { icon: 'dot', tone: 'muted' },
}

const STATE_LABEL: Partial<Record<LatestState, string>> = {
  incomplete: 'In progress',
  failed: 'Run failed',
  outage: 'Outage',
  unreadable: 'Unreadable',
  none: 'No runs',
}

const stateLabel = (s: LatestState) => (s in VERDICT_SHORT ? VERDICT_SHORT[s as keyof typeof VERDICT_SHORT] : (STATE_LABEL[s] ?? s))

function needsAttention(c: CaseEntry) {
  const a = agreement(c)
  const s = latestState(c)
  return a.agreeing < a.decided || !['reproduced_failure', 'no_failure_observed'].includes(s)
}

function ChangeRow({ c }: { c: CaseEntry }) {
  const inv = latestInv(c)
  const a = agreement(c)
  const s = latestState(c)
  const m = MARK[s]
  return (
    <li>
      <a className="dx-ov-row" href={href.case(c.id)}>
        <span className={`dx-ov-mark tone-${m.tone}`} title={stateLabel(s)}>
          <DIcon name={m.icon} size={16} />
        </span>
        <span className="dx-ov-text">
          <span className="dx-ov-title">{inv?.change?.title ?? c.label}</span>
          <span className="dx-faint dx-ov-sys">
            {c.label} · {fmtDate(c.runs[0]?.startedAt)}
            {a.agreeing < a.decided && <span className="dx-ov-flag"> · repeats disagree</span>}
          </span>
        </span>
        {a.decided > 1 && (
          <span className="dx-ov-pips" title={`${a.agreeing} of ${a.decided} runs agree`}>
            <Pips verdicts={a.verdicts} />
          </span>
        )}
        <DIcon name="chevron-right" size={14} className="dx-ov-go" />
      </a>
    </li>
  )
}

function Group({ title, tone, cases }: { title: string; tone: string; cases: CaseEntry[] }) {
  return (
    <section className="dx-panel dx-ov-col">
      <div className="dx-panel-h">
        <span className={`dx-dot tone-${tone}`} aria-hidden="true" />
        <h2>
          {title} <span className="dx-count">{cases.length}</span>
        </h2>
      </div>
      {cases.length === 0 ? (
        <p className="dx-faint" style={{ padding: '14px 16px' }}>
          None
        </p>
      ) : (
        <ol className="dx-ov-list">
          {cases.map((c) => (
            <ChangeRow key={c.id} c={c} />
          ))}
        </ol>
      )}
    </section>
  )
}

export function Overview({ site }: { site: SiteData }) {
  const s = siteStats(site)
  const repro = s.byLatest.reproduced_failure ?? 0
  const none = s.byLatest.no_failure_observed ?? 0
  const unsure = s.byLatest.inconclusive ?? 0
  const attention = site.cases.filter(needsAttention)
  const breaks = site.cases.filter((c) => !needsAttention(c) && latestState(c) === 'reproduced_failure')
  const clean = site.cases.filter((c) => !needsAttention(c) && latestState(c) === 'no_failure_observed')
  // The bar: failures first, then the rest, so the share reads at a glance.
  const order: LatestState[] = ['reproduced_failure', 'inconclusive', 'incomplete', 'failed', 'outage', 'unreadable', 'no_failure_observed', 'none']
  const barCases = [...site.cases].sort((a, b) => order.indexOf(latestState(a)) - order.indexOf(latestState(b)))

  const runs = allRuns(site).filter((r) => r.inv)
  const queries = runs.reduce((n, r) => n + r.inv!.queries, 0)
  const sources = new Set(runs.flatMap((r) => citedSources(r.inv!))).size
  const memory = runs.reduce((n, r) => n + r.inv!.memory.length, 0)
  const disagree = s.casesWithRepeats - s.consistentCases

  return (
    <>
      <PageHeader
        title="Overview"
        sub="Pre-deployment investigations: each proposed change is traced across connected systems, tested in a sandbox against a baseline and a revert, and decided by a deterministic judge."
        meta={site.cases.some((c) => isExample(c.kind)) ? <ExampleTag /> : undefined}
        actions={
          <a className="dx-btn dx-btn-primary" href={href.cases}>
            Investigations <DIcon name="arrow-right" size={14} />
          </a>
        }
      />

      {site.isPlaceholder && (
        <Alert tone="warn" icon="alert">
          <strong>Placeholder data.</strong> No saved runs were found, so these screens show layout placeholders, not Domino results.
        </Alert>
      )}

      {site.cases.length === 0 ? (
        <Panel>
          <Empty icon="investigations" title="No investigations yet">
            Connect a project and its pull request checks appear here.
          </Empty>
        </Panel>
      ) : (
        <div className="dx-stack">
          {/* The answer, with the verdict mix beside it */}
          <section className="dx-panel dx-hero">
            <div className="dx-hero-main">
              <span className={`dx-answer-icon tone-${repro ? 'fail' : 'neutral'}`}>
                <DIcon name={repro ? 'x-circle' : 'minus-circle'} size={24} />
              </span>
              <div>
                <h2 className="dx-hero-title">{repro ? `${repro} of ${s.cases} changes break something` : 'No change broke anything under these tests'}</h2>
                <p className="dx-muted">
                  Each change was tested in a sandbox and decided by Domino’s judge, not the model.
                </p>
                <ul className="dx-hero-checks">
                  {s.casesWithRepeats > 0 && (
                    <li className={disagree ? 'is-warn' : undefined}>
                      <DIcon name={disagree ? 'alert' : 'check'} size={13} />
                      {disagree ? `${disagree} changes disagree across repeats` : `Same verdict on every repeat (${s.consistentCases} of ${s.casesWithRepeats})`}
                    </li>
                  )}
                  {s.reviewed > 0 && (
                    <li>
                      <DIcon name="check" size={13} />
                      {s.approved} of {s.reviewed} explanations approved
                    </li>
                  )}
                </ul>
              </div>
            </div>

            <div className="dx-hero-mix">
              <div className="dx-mix-nums">
                <div className="tone-fail">
                  <span className="dx-mix-n">{repro}</span>
                  <span className="dx-mix-l">Break something</span>
                </div>
                <div className="tone-neutral">
                  <span className="dx-mix-n">{none}</span>
                  <span className="dx-mix-l">No failure found</span>
                </div>
                <div className={unsure ? 'tone-warn' : 'tone-muted'}>
                  <span className="dx-mix-n">{unsure}</span>
                  <span className="dx-mix-l">Inconclusive</span>
                </div>
              </div>
              <div className="dx-mix-bar" aria-label="Latest verdict for each change">
                {barCases.map((c) => {
                  const st = latestState(c)
                  const label = `${latestInv(c)?.change?.title ?? c.label} · ${c.label} · ${stateLabel(st)}`
                  return <a key={c.id} href={href.case(c.id)} className={`tone-${MARK[st].tone}`} title={label} aria-label={label} />
                })}
              </div>
            </div>
          </section>

          {/* Platform at a glance */}
          <div className="dx-tiles">
            <a href={href.underTheHoodAt('nemotron')}>
              <span className="dx-tile-l">
                <DIcon name="model" size={14} /> Answered by Nemotron
              </span>
              <span className="dx-tile-n">{pct(s.nemotronCalls, s.modelCalls)}</span>
              <span className="dx-tile-s">of {s.modelCalls.toLocaleString('en-US')} model calls</span>
            </a>
            <a href={href.underTheHoodAt('zetaris')}>
              <span className="dx-tile-l">
                <DIcon name="data" size={14} /> Semantic-layer queries
              </span>
              <span className="dx-tile-n">{queries.toLocaleString('en-US')}</span>
              <span className="dx-tile-s">across {sources} sources</span>
            </a>
            <a href={href.underTheHoodAt('meterless')}>
              <span className="dx-tile-l">
                <DIcon name="memory" size={14} /> World Model records
              </span>
              <span className="dx-tile-n">{memory}</span>
              <span className="dx-tile-s">kept across runs</span>
            </a>
            <a href={href.runs}>
              <span className="dx-tile-l">
                <DIcon name="runs" size={14} /> Runs
              </span>
              <span className="dx-tile-n">{s.runs}</span>
              <span className="dx-tile-s">latest {fmtDate(s.lastRunAt)}</span>
            </a>
          </div>

          {/* The changes, by what was found */}
          {attention.length > 0 && <Group title="Needs attention" tone="warn" cases={attention} />}
          <div className="dx-ov-cols">
            <Group title="Breaks something" tone="fail" cases={breaks} />
            <Group title="No failure found" tone="neutral" cases={clean} />
          </div>
        </div>
      )}
    </>
  )
}
