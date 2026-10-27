import { useEffect, useMemo, useRef, useState } from 'react'
import type { SiteData } from '../../../types'
import { href } from '../../../lib/router'
import { caseCards, featured, loopData } from './data'
import { Outages } from './Outages'
import { Hero } from './Device'
import { Pipes } from './Pipes'
import { Reveal } from './Reveal'
import { Grid } from './Grid'
import { StackStrip } from './Partners'
import { Steps } from './Steps'
import { Loop } from './Loop'
import { LiveSection } from './LiveSection'

/* ---------- Shared bits ---------- */

/* ---------- Closing ---------- */

function Closing() {
  const [change, setChange] = useState('')
  const root = useRef<HTMLElement>(null)

  // As the section scrolls in, the orange panel grows from an inset card to the
  // full width of the page (--open goes 0 → 1).
  useEffect(() => {
    const el = root.current
    if (!el) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return el.style.setProperty('--open', '1')
    let raf = 0
    const read = () => {
      raf = 0
      const top = el.getBoundingClientRect().top
      const t = Math.min(1, Math.max(0, (innerHeight - top) / (innerHeight * 0.75)))
      el.style.setProperty('--open', (t * t * (3 - 2 * t)).toFixed(4))
    }
    const on = () => (raf ||= requestAnimationFrame(read))
    read()
    addEventListener('scroll', on, { passive: true })
    addEventListener('resize', on)
    return () => {
      removeEventListener('scroll', on)
      removeEventListener('resize', on)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <section ref={root} className="g-cta is-accent" aria-labelledby="cta-title">
      <div className="g-cta-bg" aria-hidden="true" />
      <Pipes tone="light" />
      <div className="g-wrap">
        <Reveal>
          <p className="g-label">Before you deploy</p>
          <h2 id="cta-title" className="g-h2">
            Test your
            <br />
            next change.
          </h2>
          <p className="g-lead">Describe a change or paste a pull request link.</p>
          <form
            className="g-cta-field"
            onSubmit={(e) => {
              e.preventDefault()
              // Whatever was typed, the dashboard is where a real check starts.
              window.location.hash = href.cases.replace(/^#/, '')
            }}
          >
            <label className="visually-hidden" htmlFor="cta-change">
              Change to test
            </label>
            <input
              id="cta-change"
              type="text"
              value={change}
              onChange={(e) => setChange(e.target.value)}
              placeholder="e.g. Give the billing service read access to the orders database"
              autoComplete="off"
            />
            <button type="submit" className="g-btn g-btn-accent">
              Run
            </button>
          </form>
        </Reveal>
      </div>
    </section>
  )
}

/* ---------- Page ---------- */

export function Landing({ site }: { site: SiteData | null }) {
  const cards = useMemo(() => (site ? caseCards(site.cases) : []), [site])
  const show = site ? featured(site.cases) : null
  return (
    <>
      <Hero cards={cards} />
      {site && <StackStrip site={site} />}
      {show && <Steps show={show} />}
      {site && <Outages site={site} />}
      {site && show && <LiveSection site={site} show={show} />}
      {site && <Loop data={loopData(site)} cards={cards} />}
      {site && show && <Grid site={site} show={show} />}
      <Closing />
    </>
  )
}
