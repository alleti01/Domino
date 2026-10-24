import { useEffect } from 'react'
import type { SiteState } from '../../data/useSite'
import { DEMO_VIDEO_URL } from '../../config'
import { HEADLINE, HERO_SUB, RUN_LOCALLY } from '../../content'
import { href } from '../../lib/router'
import { scrollToSection } from '../../lib/scroll'
import { flagship } from '../../lib/showcase'
import { CommandBlock } from '../common'
import { CaseTabs } from './CaseTabs'
import { ChainStory } from './ChainStory'
import { ExperimentStory } from './ExperimentStory'
import { HowItWorks } from './HowItWorks'
import { Limits } from './Limits'
import { ProofCounters } from './ProofCounters'

export function LandingPage({ state, section }: { state: SiteState; section: string | null }) {
  // ?section=demo (from the nav) scrolls to that part of the page.
  useEffect(() => {
    if (section) scrollToSection(section)
  }, [section, state.status])

  const site = state.status === 'ready' ? state.site : null
  const show = site ? flagship(site.cases) : null
  const placeholder = site?.isPlaceholder ?? false

  return (
    <div className="landing">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-backdrop" aria-hidden="true" />
        <div className="hero-inner">
          <p className="hero-kicker">
            <span className="hero-kicker-dot" aria-hidden="true" />
            Pre-deployment failure investigation
          </p>
          <h1 id="hero-title" className="hero-title">
            {HEADLINE.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </h1>
          <p className="hero-sub">{HERO_SUB}</p>
          <div className="hero-buttons">
            <a className="btn btn-light btn-lg" href={href.try}>
              Try it yourself
            </a>
            <a className="btn btn-muted btn-lg" href={href.landing('demo')}>
              Watch demo
            </a>
          </div>
        </div>
      </section>

      <section id="demo" className="video-stage" aria-labelledby="demo-title" tabIndex={-1}>
        <h2 id="demo-title" className="visually-hidden">
          Demo video
        </h2>
        <div className="video-frame">
          <div className="video-screen">
            <DemoVideo />
          </div>
        </div>
      </section>

      <ChainStory show={show} placeholder={placeholder} />
      <ExperimentStory show={show} placeholder={placeholder} />
      <HowItWorks show={show} placeholder={placeholder} />
      <CaseTabs cases={site?.cases ?? []} placeholder={placeholder} />
      {site && <ProofCounters site={site} />}
      <Limits />

      <section id="start" className="landing-block final-cta" aria-labelledby="start-title" tabIndex={-1}>
        <h2 id="start-title" className="final-cta-title">
          See it break before it ships.
        </h2>
        <p className="hero-sub">Pick a pull request, run Domino and watch it find what breaks. No keys needed.</p>
        <div className="hero-buttons">
          <a className="btn btn-light btn-lg" href={href.try}>
            Try it yourself
          </a>
        </div>
        <details className="run-locally">
          <summary>Prefer your own machine? Run it locally</summary>
          <CommandBlock lines={RUN_LOCALLY} />
        </details>
      </section>
    </div>
  )
}

function DemoVideo() {
  if (DEMO_VIDEO_URL && /\.(mp4|webm)$/i.test(DEMO_VIDEO_URL)) {
    return <video className="video-media" src={DEMO_VIDEO_URL} controls preload="metadata" />
  }
  if (DEMO_VIDEO_URL) {
    return (
      <iframe
        className="video-media"
        src={DEMO_VIDEO_URL}
        title="Domino demo video"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    )
  }
  return (
    <div className="video-placeholder">
      <span className="video-play" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5.5v13l11-6.5z" />
        </svg>
      </span>
      <p className="video-label">Demo video · coming soon</p>
      <p className="video-note">
        Recorded from a real Domino run. Until then, <a href={href.try}>try it yourself</a>.
      </p>
    </div>
  )
}
