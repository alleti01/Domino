import { useEffect, type CSSProperties } from 'react'
import type { SiteState } from '../../data/useSite'
import { DEMO_VIDEO_URL } from '../../config'
import { HEADLINE, HERO_SUB, RUN_LOCALLY } from '../../content'
import { VERDICT, isNemotron } from '../../lib/labels'
import { href } from '../../lib/router'
import { scrollToSection } from '../../lib/scroll'
import { chainTiles, flagship, type Showcase } from '../../lib/showcase'
import { useScrollProgress } from '../../hooks/useScrollProgress'
import { CommandBlock } from '../common'
import { CaseIndex } from './CaseIndex'
import { ChainStory } from './ChainStory'
import { ExperimentStory } from './ExperimentStory'
import { HowItWorks } from './HowItWorks'
import { Limits } from './Limits'
import { Arrow, ArrowLink } from './Motion'
import { ProofCounters } from './ProofCounters'

export function LandingPage({ state, section }: { state: SiteState; section: string | null }) {
  // ?section=demo (from the nav) scrolls to that part of the page.
  useEffect(() => {
    if (section) scrollToSection(section)
  }, [section, state.status])

  const site = state.status === 'ready' ? state.site : null
  const show = site ? flagship(site.cases) : null
  const placeholder = site?.isPlaceholder ?? false
  const flowRef = useScrollProgress<HTMLDivElement>()

  return (
    <div className="landing">
      <section className="hero" aria-labelledby="hero-title">
        <p className="hero-label">Pre-deployment failure investigation</p>
        {show && <RunStamp show={show} placeholder={placeholder} />}

        <h1 id="hero-title" className="hero-title">
          <span className="hero-line">
            <span>{HEADLINE[0]}</span>
          </span>
          <span className="hero-line hero-line-tail">
            <em>{HEADLINE[1]}</em>
          </span>
        </h1>

        <div className="hero-chain">{show && <HeroChain show={show} />}</div>

        <div className="hero-side">
          <p className="hero-sub">{HERO_SUB}</p>
          <div className="hero-actions">
            <a className="btn btn-ink" href={href.try}>
              Try it yourself
              <Arrow />
            </a>
            <a className="text-link" href={href.landing('demo')}>
              Watch the demo
            </a>
          </div>
          <p className="hero-note">
            No sign-up, no keys. <ArrowLink href={href.cases}>Open the dashboard</ArrowLink>
          </p>
        </div>
      </section>

      <figure id="demo" className="demo" tabIndex={-1} aria-labelledby="demo-caption">
        <div className="demo-screen">
          <DemoVideo />
        </div>
        <figcaption id="demo-caption" className="demo-caption">
          <span>Fig. 1</span> The demo, recorded from a real Domino run.{!DEMO_VIDEO_URL && ' Coming soon.'}
        </figcaption>
      </figure>

      {/* The chain line runs down the page and fills as you read: a change travelling through the system. */}
      <div ref={flowRef} className="flow">
        <div className="rail" aria-hidden="true">
          <span className="rail-fill" />
        </div>
        <ChainStory show={show} placeholder={placeholder} />
        <ExperimentStory show={show} placeholder={placeholder} />
        <HowItWorks show={show} placeholder={placeholder} />
        <CaseIndex cases={site?.cases ?? []} placeholder={placeholder} />
        {site && <ProofCounters site={site} />}
        <Limits />
      </div>

      <section id="start" className="final" aria-labelledby="start-title" tabIndex={-1} data-nav-theme="dark">
        <h2 id="start-title" className="final-title">
          See it break <em>before it ships.</em>
        </h2>
        <div className="final-side">
          <p>Pick a pull request, run Domino, and watch it find what breaks. No keys needed.</p>
          <a className="btn btn-paper" href={href.try}>
            Try it yourself
            <Arrow />
          </a>
          <details className="run-locally">
            <summary>Prefer your own machine? Run it locally</summary>
            <CommandBlock lines={RUN_LOCALLY} />
          </details>
        </div>
      </section>
    </div>
  )
}

/** A small evidence stamp: which run the page is built from. */
function RunStamp({ show, placeholder }: { show: Showcase; placeholder: boolean }) {
  const calls = show.inv.receipts.length
  const nemotron = show.inv.receipts.filter((r) => r.routedModel && isNemotron(r.routedModel)).length
  return (
    <p className="hero-stamp">
      {placeholder ? 'Placeholder run' : show.inv.replay ? 'Replayed run' : 'Live run'} ·{' '}
      <a href={href.case(show.caseEntry.id)}>{show.caseEntry.id}</a> · {nemotron}/{calls} Nemotron calls
    </p>
  )
}

/** The real chain from the flagship run, set as evidence: component → component → verdict. */
function HeroChain({ show }: { show: Showcase }) {
  const tiles = chainTiles(show.inv)
  const verdict = show.inv.verdict ? VERDICT[show.inv.verdict.verdict] : null
  if (tiles.length === 0) return null
  return (
    <ol className="hero-chain-list" aria-label="The dependency chain Domino found in this run">
      {tiles.map((t, i) => (
        <li key={t.id} style={{ '--i': i } as CSSProperties}>
          <span className="hero-chain-kind">{t.kind}</span>
          <span className="hero-chain-name">{t.label}</span>
        </li>
      ))}
      {verdict && (
        <li className={`hero-chain-verdict tone-${verdict.tone}`} style={{ '--i': tiles.length } as CSSProperties}>
          <span className="hero-chain-kind">verdict</span>
          <span className="hero-chain-name">{verdict.label}</span>
        </li>
      )}
    </ol>
  )
}

function DemoVideo() {
  if (DEMO_VIDEO_URL && /\.(mp4|webm)$/i.test(DEMO_VIDEO_URL)) {
    return <video className="demo-media" src={DEMO_VIDEO_URL} controls preload="metadata" />
  }
  if (DEMO_VIDEO_URL) {
    return (
      <iframe
        className="demo-media"
        src={DEMO_VIDEO_URL}
        title="Domino demo video"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    )
  }
  return (
    <div className="demo-placeholder">
      <span className="demo-play" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5.5v13l11-6.5z" />
        </svg>
      </span>
      <p>
        The demo video lands here once it's recorded. Until then, <a href={href.try}>try it yourself</a>.
      </p>
    </div>
  )
}
