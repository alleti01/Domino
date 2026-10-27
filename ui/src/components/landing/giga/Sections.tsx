// The sections that explain Domino at a glance: the problem it solves, what it
// gives back, what it measured, and what it runs on. Every number and name
// comes from the saved runs; nothing here is typed in by hand.

import type { SiteData } from '../../../types'
import { href } from '../../../lib/router'
import { chainTiles, experimentSummary, type Showcase } from '../../../lib/showcase'
import { siteFacts } from './data'
import { cap, plainComponent, plainFailure, plainMeasure, plainRelation, plainRun, plainSource, plainTitle } from './plain'
import { Reveal } from './Reveal'


/* ---------- The problem: the real chain, change to failure ---------- */

export function Problem({ show }: { show: Showcase }) {
  const tiles = chainTiles(show.inv)
  const x = experimentSummary(show.inv)
  const broke = show.inv.experiments.find((e) => e.outcome === 'fail')?.assertions.find((a) => !a.passed)?.name
  if (tiles.length < 2) return null
  return (
    <section id="problem" className="g-section p-section" aria-labelledby="problem-title">
      <div className="g-wrap">
        <Reveal>
          <p className="g-label">The problem</p>
          <h2 id="problem-title" className="g-h2">
            Each change was right.
            <br />
            The combination broke.
          </h2>
          <p className="g-body p-lead">
            Teams test the code they changed. Outages start somewhere else: a permission changes what a query returns, a generated file grows, and a service two hops away hits a limit it was never tested
            against. The facts that connect them live in different systems, so no one sees the chain until it fails.
          </p>
        </Reveal>
        <Reveal delay={1}>
          <ol className="p-chain" aria-label="The dependency path Domino found for one recorded change">
            {tiles.map((t, i) => {
              const last = i === tiles.length - 1
              return (
                <li key={t.id} className={last ? 'is-end' : undefined} style={{ ['--i' as string]: i }}>
                  {t.link && <span className="p-rel">{plainRelation(t.link.relation)}</span>}
                  <span className="p-tile">
                    <b>{plainComponent(t.kind, t.label)}</b>
                    <small>from the {t.sources.length ? plainSource(t.sources[0]) : 'semantic layer'}</small>
                  </span>
                </li>
              )
            })}
          </ol>
          <p className="p-foot">
            The path Domino found for one recorded change, <b>{plainTitle(show.inv.change?.title)}</b>
            {x && x.limit?.value != null ? (
              <>
                : the {plainMeasure(x.key)} went from {String(x.baseline)} to {String(x.candidate)}, past a limit of {x.limit.value}
                {broke ? <>, and {plainFailure(broke)}.</> : '.'}
              </>
            ) : (
              '.'
            )}{' '}
            Each fact came from a different system.
            {' '}The same shape as the{' '}
            <a href="https://blog.cloudflare.com/18-november-2025-outage/" target="_blank" rel="noreferrer">
              Cloudflare outage of 18 Nov 2025<span className="visually-hidden"> (opens in a new tab)</span>
            </a>{' '}
            and the{' '}
            <a href="https://www.crowdstrike.com/wp-content/uploads/2024/08/Executive-Summary_Root-Cause-Analysis_Channel-File-291.pdf" target="_blank" rel="noreferrer">
              CrowdStrike update of July 2024<span className="visually-hidden"> (opens in a new tab)</span>
            </a>
            . These worlds are synthetic, built on those public mechanisms.
          </p>
        </Reveal>
      </div>
    </section>
  )
}

/* ---------- What you get back: a verdict and its evidence ---------- */

export function Verdicts({ show }: { show: Showcase }) {
  const inv = show.inv
  const runs = inv.experiments.filter((e) => e.completed)
  const sources = [...new Set(inv.chain.nodes.flatMap((n) => n.refs.map((r) => r.source)))].filter(Boolean)
  const verdicts = [
    { key: 'reproduced_failure', name: 'Reproduced failure', tone: 'fail', rule: 'It worked before the change, broke with it, the same way twice, and worked again once the change was undone.' },
    { key: 'no_failure_observed', name: 'No failure observed', tone: 'calm', rule: 'It passed the same checks with the change as without it, under the conditions that were tested.' },
    { key: 'inconclusive', name: 'Inconclusive', tone: 'warn', rule: 'The runs did not give enough to decide either way, so Domino says so.' },
  ] as const
  const bundle: [string, string][] = [
    ['The change', plainTitle(inv.change?.title)],
    ['How it connects', `${inv.chain.nodes.length} parts and ${inv.chain.edges.length} links between them, found in ${sources.length} separate systems`],
    ['Cited evidence', `${inv.evidence.size} items, each linked to the source row or run it came from`],
    ['Sandbox runs', runs.map((r) => `${plainRun(r.variant)}: ${r.outcome === 'fail' ? 'broke' : 'worked'}`).join(' · ') || 'none'],
    ['What broke', (() => {
      const f = runs.find((r) => r.outcome === 'fail')?.assertions.find((a) => !a.passed)
      return f ? cap(plainFailure(f.name)) : 'Nothing, under the conditions tested'
    })()],
    ['Model receipts', `${inv.receipts.length} calls, each with its routed model and request id`],
    ['Second check', inv.review?.outcome === 'approved' ? 'Explanation approved by the reviewer model' : `Reviewer: ${inv.review?.outcome ?? 'not run'}`],
  ]
  return (
    <section id="verdicts" className="g-section v-section" aria-labelledby="verdicts-title">
      <div className="g-wrap v-grid">
        <div>
          <Reveal>
            <p className="g-label">What you get back</p>
            <h2 id="verdicts-title" className="g-h2">
              One verdict,
              <br />
              decided by code.
            </h2>
            <p className="g-body">The AI plans the tests and explains the result. Plain code reads the test runs and picks one of three verdicts, so the AI can&rsquo;t talk its way to a pass.</p>
          </Reveal>
          <Reveal delay={1}>
            <dl className="v-list">
              {verdicts.map((v) => (
                <div key={v.key} className={`v-row is-${v.tone}`}>
                  <dt>
                    <i aria-hidden="true" />
                    {v.name}
                  </dt>
                  <dd>{v.rule}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
        <Reveal delay={2} className="v-card-wrap">
          <figure className="v-card">
            <figcaption>
              <span>Evidence bundle</span>
              <a href={href.case(show.caseEntry.id)}>{show.caseEntry.label} ↗</a>
            </figcaption>
            <dl>
              {bundle.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </figure>
        </Reveal>
      </div>
    </section>
  )
}

/* ---------- Results: what the recorded runs measured ---------- */

export function Results({ site }: { site: SiteData }) {
  const f = siteFacts(site)
  if (!f.runs) return null
  const per = f.worlds ? Math.round(f.runs / f.worlds) : 0
  const pct = f.answeredCalls ? Math.floor((100 * f.nemotronCalls) / f.answeredCalls) : 0
  const mins = f.medianSeconds != null ? `${Math.floor(f.medianSeconds / 60)}m ${String(Math.round(f.medianSeconds % 60)).padStart(2, '0')}s` : 'n/a'
  const stats: [string, string, string][] = [
    [`${f.steady}/${f.worlds}`, 'worlds', `reached the same verdict on all ${per} independent runs`],
    [String(f.runs), 'live runs', `${f.reproduced} reproduced a failure, ${f.noFailure} found none${f.inconclusive ? `, ${f.inconclusive} inconclusive` : ''}`],
    [`${pct}%`, 'of model calls', `answered by NVIDIA Nemotron: ${f.nemotronCalls} calls, each with a receipt${f.failedCalls ? `; ${f.failedCalls} retried after a provider error` : ''}`],
    [mins, 'per investigation', `median, with ${f.medianCalls ?? 'n/a'} model calls each`],
  ]
  return (
    <section id="results" className="g-section r-section" aria-labelledby="results-title">
      <div className="g-wrap">
        <Reveal>
          <p className="g-label">Results</p>
          <h2 id="results-title" className="g-h2">
            Measured on recorded runs,
            <br />
            not claimed.
          </h2>
          <p className="g-body">
            The frozen agent, run three times on each of {f.worlds} practice worlds, live: the real semantic layer, real Nemotron calls, real sandbox runs.
          </p>
        </Reveal>
        <Reveal delay={1}>
          <dl className="r-stats">
            {stats.map(([n, unit, text]) => (
              <div key={unit}>
                <dt>
                  <span className="r-num">{n}</span>
                  <span className="r-unit">{unit}</span>
                </dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
          <div className="r-foot">
            <p>
              The reviewer model approved {f.approved} explanations, flagged {f.flagged} for review and was unavailable for {f.reviewUnavailable}. These are practice worlds. A held-out world,
              kept away from everyone building the agent, is scored separately.
            </p>
            <a className="k-explore" href={href.results}>
              See the scorecard
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M4.5 2.5 8 6 4.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ---------- What it runs on, and the rules it keeps ---------- */

export function Stack({ site }: { site: SiteData }) {
  const f = siteFacts(site)
  const rows: { name: string; role: string; detail: string; proof: string }[] = [
    {
      name: 'Zetaris Unified Semantic Layer',
      role: 'Connects the facts',
      detail: `Joins ${f.sources.length || 'several'} independent sources${f.sources.length ? ` (${f.sources.join(', ')})` : ''} into one model Domino can query. Every fact keeps the row it came from.`,
      proof: href.underTheHoodAt('zetaris'),
    },
    {
      name: `NVIDIA ${f.investigator ?? 'Nemotron'}`,
      role: 'Investigates',
      detail: 'Reads the change and the joined facts, forms a hypothesis that could be proven wrong, and plans the sandbox runs that would test it.',
      proof: href.underTheHoodAt('nemotron'),
    },
    {
      name: `NVIDIA ${f.reviewer ?? 'Nemotron'}`,
      role: 'Checks the explanation',
      detail: 'A second, larger model reads every explanation against the evidence before it is shown, and flags any claim the evidence does not back.',
      proof: href.underTheHoodAt('nemotron'),
    },
    {
      name: 'Meterless Nightshift',
      role: 'Routes every model call',
      detail: 'Sends each call to Nemotron and returns a receipt with the routed model and request id, so every step can be traced.',
      proof: href.underTheHoodAt('nemotron'),
    },
    {
      name: 'Meterless World Model',
      role: 'Remembers',
      detail: 'Keeps the components, links and hypotheses an investigation has found, so later steps build on them instead of starting over.',
      proof: href.underTheHoodAt('meterless'),
    },
  ]
  const rules = [
    'Code decides pass or fail. The model only plans and explains.',
    'Read-only, non-admin access to the semantic layer.',
    'Writes only inside a disposable sandbox, never to a real system.',
    'A failure counts only if the candidate fails the same way on repeat and the control passes again.',
    'Every claim in the explanation cites a source row or a sandbox run.',
    'Synthetic data only, labelled as synthetic.',
  ]
  return (
    <section id="stack" className="g-section s-section" aria-labelledby="stack-title">
      <div className="g-wrap">
        <Reveal>
          <p className="g-label">What it runs on</p>
          <h2 id="stack-title" className="g-h2">
            Five parts,
            <br />
            one investigation.
          </h2>
        </Reveal>
        <Reveal delay={1}>
          <ul className="s-rows">
            {rows.map((r) => (
              <li key={r.name}>
                <span className="s-role">{r.role}</span>
                <span className="s-name">{r.name}</span>
                <span className="s-detail">{r.detail}</span>
                <a className="s-proof" href={r.proof}>
                  Proof
                </a>
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={2}>
          <div className="s-rules">
            <p className="g-label">The rules it keeps</p>
            <ul>
              {rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
