import type { SiteData } from '../../types'
import { DEMO_VIDEO_URL } from '../../config'
import { RUN_LOCALLY, VERDICT_MEANING } from '../../content'
import { VERDICT } from '../../lib/labels'
import { href } from '../../lib/router'
import { experimentSummary, showcases, type Showcase } from '../../lib/showcase'
import { CommandBlock } from '../common'
import { measureLabel } from './story/storyData'
import { Arrow, ArrowLink } from './Motion'

/**
 * One case that broke and one that didn't, each in a sentence with its
 * measured values, and the way to every case in the dashboard.
 */
export function Outcomes({ site }: { site: SiteData }) {
  const all = showcases(site.cases)
  const picks = [
    all.find((s) => s.inv.verdict?.verdict === 'reproduced_failure'),
    all.find((s) => s.inv.verdict?.verdict === 'no_failure_observed'),
  ].filter((s): s is Showcase => !!s)

  return (
    <section id="cases" className="support" aria-labelledby="cases-title" tabIndex={-1}>
      <header className="support-head">
        <h2 id="cases-title" className="support-title">
          Same engine, <em>different outcomes.</em>
        </h2>
        <p>Every change goes through the same investigation, including ones that should raise no alarm.</p>
      </header>

      <ul className="support-cases">
        {picks.map((s) => {
          const v = VERDICT[s.inv.verdict!.verdict]
          const x = experimentSummary(s.inv)
          const failed = s.inv.verdict!.verdict === 'reproduced_failure'
          return (
            <li key={s.caseEntry.id} className={`support-case tone-${v.tone}`}>
              <p className="support-case-verdict">{v.label}</p>
              <h3>{s.caseEntry.label}</h3>
              {x && (
                <p className="support-case-number">
                  {measureLabel(x.key)}: {String(x.baseline ?? '—')} → {String(x.candidate ?? '—')}
                  {failed && x.limit?.value != null ? `, past the limit of ${x.limit.value}.` : failed ? '.' : ', and every check still passed.'}
                </p>
              )}
              {!failed && <p className="support-case-note">This is not a guarantee about production: only these conditions were tested.</p>}
              <ArrowLink className="chapter-link" href={href.case(s.caseEntry.id)}>
                Open the report<span className="visually-hidden"> for {s.caseEntry.label}</span>
              </ArrowLink>
            </li>
          )
        })}
      </ul>
      <p className="support-all">
        <ArrowLink href={href.cases}>All {site.cases.length} cases in the dashboard</ArrowLink>
        <span>Saved practice runs on synthetic systems.</span>
      </p>
    </section>
  )
}

const BUILT_WITH = [
  { name: 'Zetaris', role: 'Semantic layer that joins the separate sources', to: href.underTheHoodAt('zetaris') },
  { name: 'NVIDIA Nemotron', role: 'Reasons about the change, via Meterless Nightshift', to: href.underTheHoodAt('nemotron') },
  { name: 'Meterless World Model', role: "Keeps the investigation's state", to: href.underTheHoodAt('meterless') },
]

/** The technology behind the build, each linking to the evidence of what it actually did. */
export function BuiltWith() {
  return (
    <section id="built-with" className="builtwith" aria-labelledby="builtwith-title" tabIndex={-1}>
      <h2 id="builtwith-title" className="chapter-kicker">
        Built with
      </h2>
      <ul>
        {BUILT_WITH.map((b) => (
          <li key={b.name}>
            <a href={b.to}>
              <span className="builtwith-name">{b.name}</span>
              <span className="builtwith-role">{b.role}</span>
              <Arrow />
            </a>
          </li>
        ))}
        <li>
          <a href={href.results}>
            <span className="builtwith-name">Results</span>
            <span className="builtwith-role">Every verdict, case by case</span>
            <Arrow />
          </a>
        </li>
      </ul>
    </section>
  )
}

/** Short answers to the questions a careful reader asks next. */
export function Faq() {
  return (
    <section id="faq" className="faq" aria-labelledby="faq-title" tabIndex={-1}>
      <h2 id="faq-title" className="support-title">
        Questions
      </h2>
      <div className="faq-list">
        <details>
          <summary>What do the three verdicts mean?</summary>
          <dl className="faq-answer faq-verdicts">
            {VERDICT_MEANING.map(([key, meaning]) => (
              <div key={key} className={`tone-${VERDICT[key].tone}`}>
                <dt>{VERDICT[key].label}</dt>
                <dd>{meaning}</dd>
              </div>
            ))}
          </dl>
        </details>
        <details>
          <summary>Who decides the verdict: the model or Domino?</summary>
          <div className="faq-answer">
            <p>
              Domino's deterministic judge, from the sandbox results. The model plans the investigation and explains it; a
              second model reviews that explanation against the evidence. Neither can change the verdict.
            </p>
          </div>
        </details>
        <details>
          <summary>Are these real incidents?</summary>
          <div className="faq-answer">
            <p>
              No. Each case is a small synthetic system that recreates a failure mechanism from a public incident, and every run
              shown is a recorded practice run. Domino does not claim it would have prevented those incidents.
            </p>
          </div>
        </details>
        <details>
          <summary>Where is the full evidence?</summary>
          <div className="faq-answer">
            <p>
              Each report lists the source rows, hypotheses, every sandbox run with its logs, model receipts and the limits of
              the result. <ArrowLink href={href.cases}>Open the dashboard</ArrowLink>
            </p>
          </div>
        </details>
        <details>
          <summary>Can I run it myself?</summary>
          <div className="faq-answer">
            <p>Yes. The dashboard runs locally from the saved runs, with no keys:</p>
            <CommandBlock lines={RUN_LOCALLY} />
          </div>
        </details>
      </div>
    </section>
  )
}

/** The way in, once more, and nothing else. */
export function Closing({ reportHref }: { reportHref: string }) {
  return (
    <section id="start" className="closing" aria-labelledby="closing-title" tabIndex={-1}>
      <h2 id="closing-title" className="closing-title">
        See it break <em>before it ships.</em>
      </h2>
      <div className="hero-actions">
        <a className="btn-chamfer" href={reportHref}>
          See an example investigation
          <Arrow />
        </a>
        <a className="story-secondary" href={href.cases}>
          Browse all cases
        </a>
        {DEMO_VIDEO_URL && (
          <ArrowLink href={DEMO_VIDEO_URL} external>
            Watch the demo
          </ArrowLink>
        )}
      </div>
    </section>
  )
}
