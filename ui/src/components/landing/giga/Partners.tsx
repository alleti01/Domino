// "Built with": the hackathon stack as a row of logos under the hero. One logo
// is lit at a time; a bar along its top fills while it's on, then the next one
// takes over and its line slides in underneath. Clicking a logo picks it; the
// bar only waits while the band is off screen.
// The figures in each line are counted from the recorded runs.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { SiteData } from '../../../types'
import { href } from '../../../lib/router'
import meterlessLogo from '../../../assets/logos/meterless.svg'
import nvidiaLogo from '../../../assets/logos/nvidia.svg'
import zetarisLogo from '../../../assets/logos/zetaris.svg'
import { siteFacts, stackCounts } from './data'

const SLIDE_MS = 4800

function Meterless({ product }: { product: string }) {
  return (
    <span className="sk-ml">
      <img src={meterlessLogo} alt="" />
      <span>
        <b>Meterless</b>
        {product}
      </span>
    </span>
  )
}

interface Item {
  key: string
  name: string
  logo: ReactNode
  line: ReactNode
  to: string
}

export function StackStrip({ site }: { site: SiteData }) {
  const f = siteFacts(site)
  const n = stackCounts(site)
  const items: Item[] = [
    {
      key: 'zetaris',
      name: 'Zetaris',
      logo: <img className="sk-zt" src={zetarisLogo} alt="" />,
      line: (
        <>
          Zetaris joins <b>{f.sources.length} systems</b> into one place, so Domino can follow a change through the whole pipeline. <b>{n.queries} queries</b> in our runs.
        </>
      ),
      to: href.underTheHoodAt('zetaris'),
    },
    {
      key: 'nvidia',
      name: 'NVIDIA Nemotron',
      logo: <img className="sk-nv" src={nvidiaLogo} alt="" />,
      line: (
        <>
          Nemotron works out what could break and plans the test. Nemotron Ultra checks its explanation. <b>{f.nemotronCalls} calls</b> in our runs.
        </>
      ),
      to: href.underTheHoodAt('nemotron'),
    },
    {
      key: 'nightshift',
      name: 'Meterless Nightshift',
      logo: <Meterless product="Nightshift" />,
      line: (
        <>
          Every AI call goes through Nightshift, and each receipt names the model that actually answered. <b>{f.answeredCalls} receipts</b> in our runs.
        </>
      ),
      to: href.underTheHoodAt('nemotron'),
    },
    {
      key: 'world-model',
      name: 'Meterless World Model',
      logo: <Meterless product="World Model" />,
      line: (
        <>
          The World Model holds what a check finds, with where each piece came from. The final explanation is built from it. <b>{n.memory} reads and writes</b> in our runs.
        </>
      ),
      to: href.underTheHoodAt('meterless'),
    },
  ]

  const [on, setOn] = useState(0)
  const [cycle, setCycle] = useState(0)
  const [inView, setInView] = useState(false)
  const [seen, setSeen] = useState(false)
  const root = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        setInView(e.isIntersecting)
        if (e.isIntersecting) setSeen(true)
      },
      { threshold: 0.4 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Each logo's bar runs as a CSS animation; when it ends, the next one is lit.
  const next = () => {
    setOn((v) => (v + 1) % items.length)
    setCycle((c) => c + 1)
  }
  const pick = (k: number) => {
    setOn(k)
    setCycle((c) => c + 1)
  }

  return (
    <section
      ref={root}
      className={`sk${seen ? ' is-seen' : ''}`}
      aria-label="Built with"
      style={{ '--slide': `${SLIDE_MS}ms` } as CSSProperties}
    >
      <div className="sk-logos" role="tablist" aria-label="Tools Domino is built on">
        <p className="sk-label">Built with</p>
        {items.map((it, k) => (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={k === on}
            aria-label={it.name}
            className={k === on ? 'is-on' : undefined}
            style={{ '--i': k } as CSSProperties}
            onClick={() => pick(k)}
          >
            <span className="sk-logo">{it.logo}</span>
            {k === on && (
              <i key={cycle} className="sk-bar" style={{ animationPlayState: inView ? 'running' : 'paused' }} onAnimationEnd={next} />
            )}
          </button>
        ))}
      </div>
      <div className="sk-say" role="tabpanel" aria-live="polite">
        <p key={`${on}:${cycle}`} className="sk-line">
          {items[on].line}{' '}
          <a href={items[on].to} aria-label={`More on ${items[on].name}`}>
            →
          </a>
        </p>
      </div>
    </section>
  )
}
