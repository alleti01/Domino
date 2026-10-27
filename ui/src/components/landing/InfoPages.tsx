// The pages behind the top nav, for what the landing page leaves out: how each
// sponsor's technology is used, how a check is bounded and measured, and who
// built it. Laid out like an enterprise platform page: a split header with a
// drawn visual, a band of figures, then ruled sections that pair a short text
// with a small interface drawn from the recorded runs.

import { useEffect, useMemo, type ReactNode } from 'react'
import { HACKATHON, REPO_URL } from '../../config'
import type { SiteState } from '../../data/useSite'
import { href } from '../../lib/router'
import { scrollToSection } from '../../lib/scroll'
import { DIcon, type DIconName } from '../../dash/icons'
import { infoFacts, type InfoFacts } from './info/facts'
import {
  AccessUI,
  AssertUI,
  BrandTile,
  FlowDiagram,
  GatewayUI,
  HubVisual,
  IconTile,
  LayersVisual,
  MemoryUI,
  ModelsUI,
  ReceiptsUI,
  RunsVisual,
  SourcesUI,
  TwoSourceUI,
  type Brand,
} from './info/Visuals'

export type InfoPageName = 'sponsors' | 'method' | 'about'

const dash = '–'

function Hero({ kicker, title, lead, visual, cta }: { kicker: string; title: ReactNode; lead: string; visual: ReactNode; cta?: { label: string; to: string } }) {
  return (
    <header className="ip2-hero">
      <div className="g-wrap ip2-hero-in">
        <div className="ip2-hero-copy">
          <p className="ip2-kicker">{kicker}</p>
          <h1 id="ip-title">{title}</h1>
          <p className="ip2-lead">{lead}</p>
          <div className="ip2-hero-cta">
            <a className="g-btn g-btn-accent" href={href.cases}>
              Open the dashboard
            </a>
            {cta && (
              <a className="ip2-link" href={cta.to}>
                {cta.label} <DIcon name="arrow-right" size={13} />
              </a>
            )}
          </div>
        </div>
        <div className="ip2-stage">{visual}</div>
      </div>
    </header>
  )
}

function Band({ items }: { items: [ReactNode, string][] }) {
  return (
    <div className="ip2-band">
      <dl className="g-wrap">
        {items.map(([v, l]) => (
          <div key={l}>
            <dd>{v ?? dash}</dd>
            <dt>{l}</dt>
          </div>
        ))}
      </dl>
    </div>
  )
}

function Section({ id, kicker, title, lede, children }: { id: string; kicker: string; title: string; lede?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="ip2-sec">
      <div className="g-wrap">
        <header className="ip2-sh">
          <div>
            <p className="ip2-kicker">{kicker}</p>
            <h2>{title}</h2>
          </div>
          {lede && <p>{lede}</p>}
        </header>
        {children}
      </div>
    </section>
  )
}

/** One ruled row: what it is on the left, a small drawn interface on the right. */
function Row({ id, head, title, children, visual, link }: { id?: string; head: ReactNode; title: string; children: ReactNode; visual: ReactNode; link?: { label: string; to: string } }) {
  return (
    <article id={id} className="ip2-row">
      <div className="ip2-row-copy">
        <div className="ip2-row-head">{head}</div>
        <h3>{title}</h3>
        {children}
        {link && (
          <a className="ip2-link" href={link.to}>
            {link.label} <DIcon name="arrow-right" size={13} />
          </a>
        )}
      </div>
      <div className="ip2-row-stage">{visual}</div>
    </article>
  )
}

function SponsorHead({ brand, name, role }: { brand: Brand; name: string; role: string }) {
  return (
    <>
      <BrandTile brand={brand} size={48} />
      <span>
        <b>{name}</b>
        <small>{role}</small>
      </span>
    </>
  )
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="ip2-steps">
      {items.map((s) => (
        <li key={s}>{s}</li>
      ))}
    </ol>
  )
}

// ---------------------------------------------------------------------------

function SponsorsPage({ fx }: { fx: InfoFacts | null }) {
  const f = fx?.site
  const pct = f && f.answeredCalls ? `${Math.floor((100 * f.nemotronCalls) / f.answeredCalls)}%` : null
  return (
    <>
      <Hero
        kicker="Sponsors"
        title={
          <>
            How we used
            <br />
            each sponsor.
          </>
        }
        lead="Four pieces of sponsor technology run in every check Domino makes. Here is what each one does, where it sits in a check, and the records you can open to see it working."
        visual={<HubVisual facts={fx} />}
        cta={{ label: 'How a check works', to: href.info('method') }}
      />
      <Band
        items={[
          [fx?.queries, 'Semantic-layer queries'],
          [f?.nemotronCalls, 'Nemotron calls'],
          [pct, 'Of AI calls on Nemotron'],
          [fx?.memory.total, 'World Model reads and writes'],
        ]}
      />
      <Section id="all" kicker="In every check" title="Four sponsors, one check." lede="Each one has a single job. Together they take a change from a pull request to a verdict with the evidence behind it.">
        <div className="ip2-rows">
          <Row
            id="zetaris"
            head={<SponsorHead brand="zetaris" name="Zetaris" role="Semantic layer" />}
            title="Every system, one place to ask."
            visual={<SourcesUI facts={fx} />}
            link={{ label: 'See the semantic layer', to: href.underTheHoodAt('zetaris') }}
          >
            <p>
              Each test setup has separate sources: change records, a permissions catalog, service settings and the code. Zetaris joins them into one compiled <b>Unified Semantic Layer</b>, with data-quality rules that catch joins that don’t line up.
            </p>
            <Steps
              items={[
                'Domino asks the layer what the change touches, then follows the path downstream.',
                'Every risk it reports rests on at least two facts from separate sources.',
                'It reads with a non-admin, read-only login, and every query is logged.',
              ]}
            />
          </Row>
          <Row
            id="nemotron"
            head={<SponsorHead brand="nvidia" name="NVIDIA Nemotron" role="Investigator and reviewer" />}
            title="Two Nemotron models do the reasoning."
            visual={<ModelsUI facts={fx} />}
            link={{ label: 'See every model call', to: href.underTheHoodAt('nemotron') }}
          >
            <p>
              <b>{f?.investigator ?? 'Nemotron 3.5 Lightning'}</b> runs the investigation. <b>{f?.reviewer ?? 'Nemotron 3 Ultra'}</b>, a much larger model, checks its explanation. Neither one decides the verdict: plain code does, from what the sandbox runs measured.
            </p>
            <Steps
              items={[
                'The investigator writes the queries and turns what it finds into guesses a test can rule out.',
                'It picks the test that best tells the guesses apart, and revises when a result surprises it.',
                'The reviewer reads the explanation against the evidence and approves or flags it.',
              ]}
            />
          </Row>
          <Row
            id="nightshift"
            head={<SponsorHead brand="meterless" name="Meterless Nightshift" role="Model routing" />}
            title="Every AI call goes through Nightshift."
            visual={<ReceiptsUI facts={fx} />}
            link={{ label: 'See the receipts', to: href.underTheHoodAt('nemotron') }}
          >
            <p>
              Domino never calls a model directly. Each call goes through <b>Meterless Nightshift</b>, which routes it and returns a receipt naming the model that actually answered. That is how every figure on this site traces back to a call.
            </p>
            <Steps items={['Calls that fail are recorded too, apart from wrong answers.', 'Each check is capped on steps, model calls and time.']} />
          </Row>
          <Row
            id="world-model"
            head={<SponsorHead brand="meterless" name="Meterless World Model" role="Investigation state" />}
            title="Where a check keeps what it finds."
            visual={<MemoryUI facts={fx} />}
            link={{ label: 'See every read and write', to: href.underTheHoodAt('meterless') }}
          >
            <p>
              The <b>Meterless World Model</b> holds the state of an investigation: the paths Domino found in the semantic layer, the guesses it is testing and the experiments that bear on them, each with where it came from.
            </p>
            <Steps items={['Domino reads that state to choose the next experiment.', 'The verdict’s cause chain is built by walking it.']} />
          </Row>
        </div>
      </Section>
    </>
  )
}

// ---------------------------------------------------------------------------

const LIMITS: { title: string; text: string; ui: (fx: InfoFacts | null) => ReactNode }[] = [
  { title: 'Code decides pass or fail', text: 'Fixed checks on what the sandbox measured decide the verdict. The model can’t mark anything as passed.', ui: (fx) => <AssertUI facts={fx} /> },
  { title: 'No raw shell, no secrets', text: 'Every tool call goes through a gateway that allows only listed calls and checks their arguments, targets, quotas and timeouts.', ui: () => <GatewayUI /> },
  { title: 'Read-only context', text: 'Domino reads the semantic layer as a non-admin, read-only user. It writes only inside throwaway sandboxes.', ui: () => <AccessUI /> },
  { title: 'Two sources for every risk', text: 'Each reported risk rests on at least two facts from separate sources. Every link is marked observed, inferred or unresolved.', ui: (fx) => <TwoSourceUI facts={fx} /> },
]

const LIMITATIONS = [
  { q: 'Does passing mean the change is fine in production?', a: 'No. A test setup rebuilds how a failure happens, not the original production system. A pass says the experiments Domino ran found nothing.' },
  { q: 'Is the semantic layer a complete map?', a: 'No. Keys can be missing and names can collide. Domino marks each link observed, inferred or unresolved, and reports that uncertainty instead of hiding it.' },
  { q: 'Why are checks kept short?', a: 'A model call through the router can take tens of seconds, so every check is capped on steps, model calls and time.' },
  { q: 'What kinds of change does it cover?', a: 'This build covers a small set of failure families on synthetic systems, not any enterprise system.' },
]

function MethodPage({ fx }: { fx: InfoFacts | null }) {
  return (
    <>
      <Hero
        kicker="Method"
        title={
          <>
            How a check works,
            <br />
            and how we measured it.
          </>
        }
        lead="What Domino is allowed to do, how a verdict is reached, how we tested it against simpler versions of itself, and where it falls short."
        visual={<RunsVisual facts={fx} />}
        cta={{ label: 'How we used each sponsor', to: href.info('sponsors') }}
      />
      <Band
        items={[
          ['7', 'Steps in a check'],
          ['3', 'Sandbox runs per test'],
          [fx?.site.worlds, 'Test setups'],
          [fx?.site.runs, 'Recorded runs'],
        ]}
      />
      <Section id="check" kicker="01 · The check" title="From a pull request to a verdict." lede="Every check is capped on steps, model calls and time. The sponsor behind each step is marked.">
        <FlowDiagram />
      </Section>
      <Section id="limits" kicker="02 · Limits" title="The model doesn’t get the final word." lede="It plans the tests and explains the results. Four rules keep everything else out of its hands.">
        <div className="ip2-cards">
          {LIMITS.map((l) => (
            <article key={l.title} className="ip2-card">
              <div className="ip2-card-stage">{l.ui(fx)}</div>
              <h3>{l.title}</h3>
              <p>{l.text}</p>
            </article>
          ))}
        </div>
      </Section>
      <Section id="measure" kicker="03 · Measurement" title="Measured against simpler versions of itself." lede="The same labelled test setups, run five ways, so each part has to earn its place.">
        <div className="ip2-modes">
          {[
            ['A', 'Static checks only', 'What the schemas alone catch'],
            ['B', 'Nemotron alone, no tools', 'What the model knows without looking'],
            ['C', 'Nemotron with all the context, no experiments', 'Whether reading is enough'],
            ['D', 'Full Domino', 'The product'],
            ['E', 'Full Domino, semantic layer hidden', 'Whether Zetaris actually helps'],
          ].map(([m, what, tells]) => (
            <div key={m} className={m === 'D' ? 'is-on' : undefined}>
              <span className="ip2-mode">{m}</span>
              <b>{what}</b>
              <small>{tells}</small>
            </div>
          ))}
        </div>
        <div className="ip2-two">
          <div>
            <h3>The cases</h3>
            <ul className="ip2-ticks">
              <li>Setups that really break, built on the mechanism of public outages</li>
              <li>A change that looks risky but breaks nothing</li>
              <li>Variants: different numbers, near misses and fixed versions</li>
            </ul>
          </div>
          <div>
            <h3>The rules</h3>
            <ul className="ip2-ticks">
              <li>Repeat runs are independent</li>
              <li>Model-provider outages are counted apart from wrong answers</li>
              <li>Sample sizes are always reported; numbers are never rounded up</li>
            </ul>
          </div>
        </div>
      </Section>
      <Section id="compare" kicker="04 · Comparison" title="Before the change ships, not after." lede="Most tools look at a change after deployment, or only run the tests someone already wrote.">
        <div className="ip2-table">
          <table>
            <thead>
              <tr>
                <th>Kind of tool</th>
                <th>What it does</th>
                <th>What Domino does</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Incident analysis', 'Finds the cause after an incident', 'Tests the guess before the change ships'],
                ['Release checks', 'Watches a change after it’s deployed', 'Runs targeted experiments before deployment'],
                ['Infrastructure plans', 'Shows which resources will change', 'Looks at how the app behaves, which a plan doesn’t show'],
                ['CI test selection', 'Runs the tests developers already wrote', 'Builds the test nobody wrote'],
                ['Static and contract tests', 'Check known kinds of rules', 'Picks the experiment from evidence joined across systems'],
              ].map(([a, b, c]) => (
                <tr key={a}>
                  <td>{a}</td>
                  <td>{b}</td>
                  <td>
                    <DIcon name="check" size={13} /> {c}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section id="limitations" kicker="05 · Limitations" title="What a verdict doesn’t tell you.">
        <div className="ip2-faq">
          {LIMITATIONS.map((l, k) => (
            <details key={l.q} open={k === 0}>
              <summary>
                {l.q}
                <DIcon name="plus" size={14} />
              </summary>
              <p>{l.a}</p>
            </details>
          ))}
        </div>
      </Section>
    </>
  )
}

// ---------------------------------------------------------------------------

const TEAM: { name: string; area: string; icon: DIconName; built: string[] }[] = [
  { name: 'Anish', area: 'Data layer', icon: 'data', built: ['The Zetaris semantic layer', 'The test setups', 'The scorecard'] },
  { name: 'Abhi', area: 'Investigation agent', icon: 'model', built: ['Nemotron through Nightshift', 'The investigation loop', 'The World Model'] },
  { name: 'Adhvik', area: 'Product', icon: 'overview', built: ['The dashboard', 'The docs', 'The submission'] },
]

const PRIVACY: { icon: DIconName; title: string; text: string }[] = [
  { icon: 'data', title: 'Synthetic data only', text: 'Every system and source is made for this project and labelled as such. No real customer or personal data.' },
  { icon: 'shield', title: 'Read-only access', text: 'The semantic layer is read through a non-admin, read-only account. Admin is for setup scripts only.' },
  { icon: 'clock', title: 'Bounded calls', text: 'Every external call has a timeout and retries are capped.' },
  { icon: 'flask', title: 'Sealed sandboxes', text: 'Experiments run in sandboxes with no network access.' },
  { icon: 'file', title: 'Evidence, not instructions', text: 'Text Domino retrieves is treated as evidence, never as instructions.' },
  { icon: 'github', title: 'No secrets in the repo', text: 'Credentials live in local, ignored files. Examples hold placeholders only.' },
]

function AboutPage({ fx }: { fx: InfoFacts | null }) {
  return (
    <>
      <Hero
        kicker="About"
        title={
          <>
            Built in six days
            <br />
            for Track 1.
          </>
        }
        lead="Domino is an entry to the GenAI.Works Open Agent Hackathon 2026, Track 1: Solving Fragmented Intelligence. The answer to a change is spread across systems that never talk to each other, and Domino joins them."
        visual={<LayersVisual facts={fx} />}
        cta={{ label: 'Source on GitHub', to: REPO_URL }}
      />
      <Band
        items={[
          ['22–27 Oct', 'Built during the event'],
          [fx?.site.sources.length, 'Sources joined'],
          [fx?.site.worlds, 'Test setups'],
          ['3', 'People'],
        ]}
      />
      <Section id="why" kicker="01 · Why Track 1" title="No single source shows the whole effect.">
        <div className="ip2-beliefs">
          {[
            ['The facts are scattered.', 'The diff is in GitHub. Permissions are in a catalog, limits are in configuration and real usage is in telemetry.'],
            ['Joining them raises the question.', 'A semantic layer across those sources shows which parts a change could reach, and which limit it could hit.'],
            ['An experiment answers it.', 'Domino runs the app without the change, with it and with it undone, and plain code reads the result.'],
          ].map(([t, d]) => (
            <div key={t}>
              <b>{t}</b>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section id="team" kicker="02 · Team" title="Three people, three parts.">
        <div className="ip2-team">
          {TEAM.map((p) => (
            <article key={p.name}>
              <span className="ip2-avatar">
                <DIcon name={p.icon} size={24} />
              </span>
              <b>{p.name}</b>
              <small>{p.area}</small>
              <ul className="ip2-ticks">
                {p.built.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </Section>
      <Section id="data" kicker="03 · Data and privacy" title="Synthetic systems, read-only access.">
        <div className="ip2-icons">
          {PRIVACY.map((p) => (
            <div key={p.title}>
              <IconTile name={p.icon} size={44} />
              <b>{p.title}</b>
              <p>{p.text}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section id="roadmap" kicker="04 · Roadmap" title="Each step follows a measured shortcoming.">
        <ol className="ip2-road">
          {[
            ['Connectors', 'GitHub, OpenTelemetry, cloud inventory, database catalogs and CI/CD'],
            ['Realistic experiments', 'Representative data, deterministic replay, service stand-ins'],
            ['Fewer false alarms', 'Calibration, controls and human review where it counts'],
            ['Customer-run deployment', 'Private open-weight models, on infrastructure the customer controls'],
            ['Design partners', 'Pilots on staging systems'],
          ].map(([t, d], k) => (
            <li key={t}>
              <span>0{k + 1}</span>
              <b>{t}</b>
              <p>{d}</p>
            </li>
          ))}
        </ol>
      </Section>
      <Section id="disclosures" kicker="05 · Disclosures" title="What we built, and with what.">
        <ul className="ip2-ticks is-wide">
          <li>Built during the event, 22–27 October 2026.</li>
          <li>All data in the repository is synthetic.</li>
          <li>Zetaris’s public getting-started guide was used as setup documentation; none of its code is copied in.</li>
          <li>Claude Code was used as a development assistant. It is not part of the running product.</li>
        </ul>
        <p className="ip2-note">{HACKATHON}.</p>
      </Section>
    </>
  )
}

const OTHERS: Record<InfoPageName, { label: string; line: string; visual: (fx: InfoFacts | null) => ReactNode }> = {
  sponsors: { label: 'Sponsors', line: 'How we used Zetaris, NVIDIA Nemotron and Meterless', visual: (fx) => <HubVisual facts={fx} compact /> },
  method: { label: 'Method', line: 'How a check works, and how we measured it', visual: (fx) => <RunsVisual facts={fx} compact /> },
  about: { label: 'About', line: 'Track 1, the team, data and roadmap', visual: (fx) => <LayersVisual facts={fx} compact /> },
}

export function InfoPage({ page, section, state }: { page: InfoPageName; section: string | null; state: SiteState }) {
  const site = state.status === 'ready' ? state.site : null
  const fx = useMemo(() => (site ? infoFacts(site) : null), [site])

  // A ?section= link lands on that section.
  useEffect(() => {
    if (!section) return
    const t = setTimeout(() => scrollToSection(section), 80)
    return () => clearTimeout(t)
  }, [page, section, fx])

  return (
    <article className="ip2" aria-labelledby="ip-title">
      {page === 'sponsors' ? <SponsorsPage fx={fx} /> : page === 'method' ? <MethodPage fx={fx} /> : <AboutPage fx={fx} />}
      <nav className="ip2-next" aria-label="More pages">
        <div className="g-wrap">
          {(Object.keys(OTHERS) as InfoPageName[])
            .filter((k) => k !== page)
            .map((k) => (
              <a key={k} href={href.info(k)}>
                <div className="ip2-next-stage">{OTHERS[k].visual(fx)}</div>
                <small>{OTHERS[k].label}</small>
                <span>
                  {OTHERS[k].line} <DIcon name="arrow-right" size={14} />
                </span>
              </a>
            ))}
        </div>
      </nav>
    </article>
  )
}
