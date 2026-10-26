import type { SiteData } from '../../types'
import { DEMO_VIDEO_URL } from '../../config'
import { RUN_LOCALLY, VERDICT_MEANING } from '../../content'
import { CASE_KIND, VERDICT, isNemotron } from '../../lib/labels'
import { href } from '../../lib/router'
import { experimentSummary, showcases, type Showcase } from '../../lib/showcase'
import { CommandBlock } from '../common'
import { Arrow, ArrowLink } from './Motion'

const LIMITS = [
  'A passing test is not a promise the change is fine in production. Domino says exactly what it tested.',
  'Every case is a small synthetic world that recreates a failure mechanism seen in real public incidents. We do not claim Domino would have stopped those incidents.',
  'Every run on this site is a saved practice run, shown from its recorded trace.',
]

/**
 * Cases and proof in one compact band: one case that broke and one that
 * didn't, then the figures counted across every saved run, each opening the
 * evidence behind it. Every case stays one click away in the dashboard.
 */
export function Support({ site }: { site: SiteData }) {
  const all = showcases(site.cases)
  const picks = [
    all.find((s) => s.inv.verdict?.verdict === 'reproduced_failure'),
    all.find((s) => s.inv.verdict?.verdict === 'no_failure_observed'),
  ].filter((s): s is Showcase => !!s)

  const invs = site.cases.flatMap((c) => c.runs.flatMap((r) => (r.load.ok ? [r.load.investigation] : [])))
  const calls = invs.flatMap((i) => i.receipts)
  const nemotron = calls.filter((r) => r.routedModel && isNemotron(r.routedModel)).length
  const sources = new Set(invs.flatMap((i) => [...i.evidence.values()].filter((e) => e.kind === 'row').map((e) => e.source)))
  const judged = invs.filter((i) => i.verdict?.decidedBy === 'deterministic_judge').length
  const verdicts = invs.filter((i) => i.verdict).length
  const memory = invs.reduce((n, i) => n + i.memory.length, 0)
  const figures = [
    { value: `${nemotron}/${calls.length}`, label: 'model calls answered by NVIDIA Nemotron via Meterless Nightshift', to: href.underTheHoodAt('nemotron'), cta: 'Receipts' },
    { value: String(sources.size), label: 'independent data sources joined in the Zetaris semantic layer', to: href.underTheHoodAt('zetaris'), cta: 'Zetaris proof' },
    { value: `${judged}/${verdicts}`, label: 'verdicts decided by the deterministic judge, not a model', to: href.results, cta: 'Results' },
    { value: String(memory), label: 'Meterless World Model reads and writes across the runs', to: href.underTheHoodAt('meterless'), cta: 'Activity' },
  ]

  return (
    <section id="cases" className="support" aria-labelledby="support-title" tabIndex={-1}>
      <header className="support-head">
        <p className="chapter-kicker">Across the cases</p>
        <h2 id="support-title" className="support-title">
          Same engine, <em>different outcomes.</em>
        </h2>
        <p>
          {all.length} saved practice runs went through the same investigation, including changes that should raise no alarm.
        </p>
      </header>

      <ul className="support-cases">
        {picks.map((s) => {
          const v = VERDICT[s.inv.verdict!.verdict]
          const x = experimentSummary(s.inv)
          return (
            <li key={s.caseEntry.id} className={`support-case tone-${v.tone}`}>
              <p className="support-case-verdict">{v.label}</p>
              <h3>
                <a href={href.case(s.caseEntry.id)}>{s.caseEntry.label}</a>
              </h3>
              {x && (
                <p className="support-case-number">
                  <code>{x.key}</code>
                  <span>
                    {String(x.baseline ?? '—')} → {String(x.candidate ?? '—')}
                    {x.limit?.value != null && <> (limit {x.limit.value})</>}
                  </span>
                </p>
              )}
              <p className="support-case-kind">{CASE_KIND[s.caseEntry.kind]}</p>
              <p className="support-case-links">
                <ArrowLink href={href.case(s.caseEntry.id)}>Report</ArrowLink>
                <a href={href.case(s.caseEntry.id, { view: 'pr' })}>
                  PR comment<span className="visually-hidden"> for {s.caseEntry.label}</span>
                </a>
              </p>
            </li>
          )
        })}
        <li className="support-all">
          <a href={href.cases}>
            <span>All {site.cases.length} cases</span>
            <span className="support-all-note">in the dashboard</span>
            <Arrow />
          </a>
        </li>
      </ul>

      <ul id="proof" className="support-figures" aria-label="Counted across every saved run" tabIndex={-1}>
        {figures.map((f) => (
          <li key={f.cta}>
            <a href={f.to}>
              <span className="figure-value">{f.value}</span>
              <span className="figure-label">{f.label}</span>
              <span className="figure-cta">
                {f.cta}
                <Arrow />
              </span>
            </a>
          </li>
        ))}
      </ul>
      <p className="support-note">Counted from the saved runs. Each figure opens the evidence behind it.</p>
    </section>
  )
}

/** The three verdicts, the limits that matter, and the way in. */
export function Closing({ reportHref }: { reportHref: string }) {
  return (
    <section id="start" className="closing" aria-labelledby="closing-title" tabIndex={-1}>
      <div className="closing-verdicts">
        <p className="chapter-kicker">What a verdict means</p>
        <dl>
          {VERDICT_MEANING.map(([key, meaning]) => {
            const v = VERDICT[key]
            return (
              <div key={key} className={`tone-${v.tone}`}>
                <dt>{v.label}</dt>
                <dd>{meaning}</dd>
              </div>
            )
          })}
        </dl>
        <ul className="closing-limits">
          {LIMITS.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>

      <div className="closing-cta">
        <h2 id="closing-title" className="closing-title">
          See it break <em>before it ships.</em>
        </h2>
        <div className="hero-actions">
          <a className="btn-chamfer" href={reportHref}>
            Open a real investigation
            <Arrow />
          </a>
          <a className="story-secondary" href={href.try}>
            Try it yourself
          </a>
        </div>
        <Demo />
        <details className="run-locally">
          <summary>Prefer your own machine? Run it locally</summary>
          <CommandBlock lines={RUN_LOCALLY} />
        </details>
      </div>
    </section>
  )
}

/** The demo video when there is one; until then, an honest line rather than an empty frame. */
function Demo() {
  if (DEMO_VIDEO_URL && /\.(mp4|webm)$/i.test(DEMO_VIDEO_URL)) {
    return (
      <figure id="demo" className="closing-demo" tabIndex={-1}>
        <video src={DEMO_VIDEO_URL} controls preload="metadata" />
        <figcaption>The demo, recorded from a saved Domino run.</figcaption>
      </figure>
    )
  }
  if (DEMO_VIDEO_URL) {
    return (
      <p id="demo" className="closing-demo" tabIndex={-1}>
        <ArrowLink href={DEMO_VIDEO_URL} external>
          Watch the demo video
        </ArrowLink>
      </p>
    )
  }
  return (
    <p id="demo" className="closing-demo" tabIndex={-1}>
      <span className="closing-demo-mark" aria-hidden="true" />
      Demo video: not recorded yet. Until then, every report shows a saved run's full trace, step by step.
    </p>
  )
}
