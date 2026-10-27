// Why we built Domino. Two outages we rebuilt as test systems, each in its own
// full-width row (picture one side, story the other, flipping), then four more
// outages with the same shape in a row of cards; the card you point at opens.
// For the two rebuilds, the numbers come from the recorded runs.

import { useEffect, useRef, useState } from 'react'
import awsImg from '../../../assets/outages/aws.jpg'
import cfImg from '../../../assets/outages/cloudflare.jpg'
import csImg from '../../../assets/outages/crowdstrike.jpg'
import fbImg from '../../../assets/outages/facebook.jpg'
import fastlyImg from '../../../assets/outages/fastly.jpg'
import googleImg from '../../../assets/outages/google.jpg'
import type { CaseEntry, Investigation, SiteData } from '../../../types'
import { href } from '../../../lib/router'
import { experimentSummary } from '../../../lib/showcase'
import { plainFailure, plainUnit } from './plain'
import { Reveal } from './Reveal'

/** The newest run of the first case in a family whose latest verdict is a reproduced failure. */
function rebuild(site: SiteData, family: string): { caseEntry: CaseEntry; inv: Investigation } | null {
  for (const c of site.cases) {
    if (!c.label.startsWith(family)) continue
    const r = c.runs.find((x) => x.load.ok)
    if (r?.load.ok && r.load.investigation.verdict?.verdict === 'reproduced_failure') return { caseEntry: c, inv: r.load.investigation }
  }
  return null
}

const failureOf = (inv: Investigation) => inv.experiments.find((e) => e.outcome === 'fail')?.assertions.find((a) => !a.passed)?.name

/** A news clip from YouTube, muted and looping, with controls so it can be unmuted. */
const ytSrc = (id: string) =>
  `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&disablekb=1&fs=0&iv_load_policy=3&cc_load_policy=0&modestbranding=1&rel=0&playsinline=1&enablejsapi=1`
// 16:9 stills with no bars: a small one for the blur, the full-size one for the frame.
const ytThumb = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
const ytStill = (id: string) => `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`
const ytWatch = (id: string) => `https://www.youtube.com/watch?v=${id}`

/**
 * A clip that looks like a video file, not a YouTube player. The whole frame
 * shows (fitted, never cropped) over a blurred copy of itself; the still shows
 * at once and the muted clip fades in when ready. YouTube's own controls are
 * off; ours (play/pause) appears only while the pointer is over the clip.
 */
function Clip({ id, title, credit, live, open = true }: { id: string; title: string; credit: string; live: boolean; open?: boolean }) {
  const play = live
  const [shown, setShown] = useState(false)
  const [paused, setPaused] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)
  const send = (msg: object) => frame.current?.contentWindow?.postMessage(JSON.stringify(msg), '*')

  // Follow the player's state: show the clip only once it has played for a few
  // seconds (YouTube's title bar has faded by then); hide it while it buffers,
  // loops or is paused, so the still frame covers YouTube's overlays.
  useEffect(() => {
    if (!play) return
    let timer = 0
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || typeof e.data !== 'string') return
      let d: { event?: string; info?: unknown }
      try {
        d = JSON.parse(e.data)
      } catch {
        return
      }
      const state = d.event === 'onStateChange' ? d.info : d.event === 'infoDelivery' ? (d.info as { playerState?: number } | null)?.playerState : undefined
      if (state === undefined) return
      clearTimeout(timer)
      if (state === 1) timer = window.setTimeout(() => setShown(true), 2500)
      else setShown(false)
    }
    addEventListener('message', onMsg)
    return () => {
      removeEventListener('message', onMsg)
      clearTimeout(timer)
    }
  }, [play])

  const toggle = () => {
    send({ event: 'command', func: paused ? 'playVideo' : 'pauseVideo', args: [] })
    setPaused(!paused)
  }
  return (
    <div className="clip">
      <img className="clip-blur" src={ytThumb(id)} alt="" aria-hidden="true" />
      <div className="clip-frame">
        {play && (
          <iframe
            ref={frame}
            src={ytSrc(id)}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture"
            tabIndex={-1}
            onLoad={() => send({ event: 'listening', id })}
          />
        )}
        <img className={`clip-poster${shown && open ? ' is-hidden' : ''}`} src={ytStill(id)} alt="" decoding="async" onError={(e) => (e.currentTarget.src = ytThumb(id))} />
      </div>
      {play && open && (
        <button type="button" className="clip-btn" onClick={toggle} aria-label={paused ? 'Play clip' : 'Pause clip'}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            {paused ? <path d="M4 2.5v9l7.5-4.5z" fill="currentColor" /> : <path d="M3.5 2.5h2.5v9H3.5zM8 2.5h2.5v9H8z" fill="currentColor" />}
          </svg>
        </button>
      )}
      <a className="clip-credit" href={ytWatch(id)} target="_blank" rel="noreferrer">
        {credit} · watch with sound ↗<span className="visually-hidden"> (opens YouTube in a new tab)</span>
      </a>
    </div>
  )
}

const Report = ({ name, url }: { name: string; url: string }) => (
  <a className="g-btn g-btn-ghost" href={url} target="_blank" rel="noreferrer">
    {name}’s report ↗<span className="visually-hidden"> (opens in a new tab)</span>
  </a>
)

/* ---------- The two we rebuilt ---------- */

interface Row {
  key: string
  company: string
  date: string
  img: string
  video?: string
  vidyard?: string
  credit: string
  alt: string
  report: string
  happened: string
  caught: string
  caseId: string | null
}

/* ---------- Four more, as cards ---------- */

interface Card {
  key: string
  company: string
  date: string
  img: string
  fit: 'photo' | 'page' | 'shot'
  yt?: string
  credit?: string
  report: string
  line: string
  story: string
  domino: string
}

const MORE: Card[] = [
  {
    key: 'gc',
    company: 'Google Cloud',
    date: '12 Jun 2025',
    img: googleImg,
    fit: 'shot',
    report: 'https://status.cloud.google.com/incidents/ow5i3PPK96RduMcb1SsW',
    line: 'A policy update with blank fields.',
    story: 'A policy update with some blank fields reached code that had never seen blanks. It crashed, and logins failed across Google Cloud for over seven hours.',
    domino: 'Domino runs a data change through the code that reads it, first.',
  },
  {
    key: 'aws',
    company: 'AWS',
    date: '20 Oct 2025',
    img: awsImg,
    fit: 'page',
    yt: '7zq8KqxzA_M',
    credit: 'Video: Associated Press',
    report: 'https://aws.amazon.com/message/101925/',
    line: 'Automation wiped a database address.',
    story: 'Two copies of AWS’s DNS automation updated the same record at once and left it empty. DynamoDB went unreachable, and services that depend on it failed for most of a day.',
    domino: 'Domino would need to test the timing between two automations, which it does not do yet.',
  },
  {
    key: 'fb',
    company: 'Facebook',
    date: '4 Oct 2021',
    img: fbImg,
    fit: 'photo',
    yt: 'SLr7HoY-hLw',
    credit: 'Video: Reuters',
    report: 'https://engineering.fb.com/2021/10/05/networking-traffic/outage-details/',
    line: 'A network config change cut everything.',
    story: 'A configuration change on the backbone routers disconnected Facebook’s data centers. Facebook, Instagram and WhatsApp were down for about six hours.',
    domino: 'Domino tests a change against everything that depends on it, before it is applied.',
  },
  {
    key: 'fs',
    company: 'Fastly',
    date: '8 Jun 2021',
    img: fastlyImg,
    fit: 'photo',
    yt: '6KcIpthZsOY',
    credit: 'Video: Associated Press',
    report: 'https://www.fastly.com/blog/summary-of-june-8-outage',
    line: 'One customer setting hit a hidden bug.',
    story: 'One customer saved a valid setting. It hit a bug shipped weeks earlier, and 85% of Fastly’s network returned errors.',
    domino: 'Domino tests a change against the code already running, in a copy.',
  },
]

export function Outages({ site }: { site: SiteData }) {
  const [open, setOpen] = useState(0)
  // Start every player well before the section is on screen, so the clips are
  // already running when they come into view (no load delay on scroll or hover).
  const [warm, setWarm] = useState(false)
  const root = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = root.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setWarm(true), { rootMargin: '150% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const cf = rebuild(site, 'Database access')
  const cs = rebuild(site, 'Content rule')
  const cfx = cf ? experimentSummary(cf.inv) : null
  const cfBroke = cf ? failureOf(cf.inv) : undefined
  const csBroke = cs ? failureOf(cs.inv) : undefined

  const rows: Row[] = [
    {
      key: 'cf',
      company: 'Cloudflare',
      date: '18 Nov 2025',
      img: cfImg,
      video: 'kzq_AbiskhE',
      credit: 'Video: Eyewitness News ABC7NY',
      alt: 'News report on the Cloudflare outage',
      report: 'https://blog.cloudflare.com/18-november-2025-outage/',
      happened: 'A small database permission change doubled the size of a settings file. It went past a limit and took much of the network down for hours.',
      caught: cfx
        ? `In our rebuild, ${String(cfx.baseline)} becomes ${String(cfx.candidate)} ${plainUnit(cfx.key)}, past the limit of ${cfx.limit?.value ?? '?'}${cfBroke ? `, and ${plainFailure(cfBroke)}` : ''}.`
        : 'Domino runs the same kind of change in a copy and shows where it breaks.',
      caseId: cf?.caseEntry.id ?? null,
    },
    {
      key: 'cs',
      company: 'CrowdStrike',
      date: '19 Jul 2024',
      img: csImg,
      vidyard: 'https://play.vidyard.com/fVMadgs3g1wcXaExA94qLQ?autoplay=1&muted=1&loop=1',
      credit: 'Video: CrowdStrike’s Falcon demo',
      alt: 'CrowdStrike’s demo of the Falcon console',
      report: 'https://www.crowdstrike.com/falcon-content-update-remediation-and-guidance-hub/',
      happened: 'A routine content update passed its checks, but the program reading it couldn’t handle it. About 8.5 million Windows computers crashed.',
      caught: `In our rebuild, the update passes its check${csBroke ? `, but ${plainFailure(csBroke)}` : ' but breaks the reader'}.`,
      caseId: cs?.caseEntry.id ?? null,
    },
  ]

  return (
    <section ref={root} id="cases" className="g-section o-section" aria-labelledby="cases-title">
      <div className="g-wrap">
        <Reveal>
          <p className="g-label">Why we built it</p>
          <h2 id="cases-title" className="g-h2">
            Two outages.
            <br />
            One small change each.
          </h2>
          <p className="g-body o-lead">Each change looked fine on its own, then broke something else in the pipeline. That is exactly what Domino tests for.</p>
        </Reveal>

        <div className="o-rows">
          {rows.map((s, i) => (
            <Reveal key={s.key} delay={1} className={`o-row${i % 2 ? ' is-flip' : ''}`}>
              <article className="o-card">
                <figure className={`o-shot is-${s.key}`}>
                  {s.video ? (
                    <Clip id={s.video} title={s.alt} credit={s.credit.replace(/^Video: /, '')} live={warm} />
                  ) : s.vidyard ? (
                    <div className="clip">
                      {warm && <iframe className="clip-vy" src={s.vidyard} title={s.alt} allow="autoplay; fullscreen; picture-in-picture" style={{ backgroundImage: `url(${s.img})` }} />}
                      <span className="clip-credit">{s.credit.replace(/^Video: /, '')}</span>
                    </div>
                  ) : (
                    <img src={s.img} alt={s.alt} loading="lazy" decoding="async" />
                  )}
                </figure>
                <div className="o-body">
                  <p className="o-who">
                    <b>{s.company}</b>
                    <span>{s.date}</span>
                  </p>
                  <dl>
                    <div>
                      <dt>What happened</dt>
                      <dd>{s.happened}</dd>
                    </div>
                    <div>
                      <dt>How Domino catches it</dt>
                      <dd>
                        {s.caught} <b>Domino shows this before it ships.</b>
                      </dd>
                    </div>
                  </dl>
                  <p className="o-links">
                    {s.caseId && (
                      <a className="g-btn g-btn-accent" href={href.case(s.caseId)}>
                        See our rebuild
                      </a>
                    )}
                    <Report name={s.company} url={s.report} />
                  </p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>

        <div className="oc-head">
          <h3>It keeps happening.</h3>
          <p>Four more outages that started with one change.</p>
        </div>
        <div className="oc">
          {MORE.map((c, i) => {
            const on = i === open
            return (
              <article
                key={c.key}
                className={`oc-card${on ? ' is-on' : ''}`}
                onMouseEnter={() => setOpen(i)}
                onFocus={() => setOpen(i)}
                tabIndex={0}
                aria-label={`${c.company}, ${c.date}`}
              >
                <div className={`oc-pic is-${c.yt ? 'video' : c.fit}`}>
                  {c.yt ? (
                    <>
                      <Clip id={c.yt} title={`News report on the ${c.company} outage`} credit={(c.credit ?? '').replace(/^Video: /, '')} live={warm} open={on} />
                    </>
                  ) : (
                    <img src={c.img} alt={`From ${c.company}’s own report`} loading="lazy" decoding="async" />
                  )}
                </div>
                <div className="oc-body">
                  <p className="oc-who">
                    <b>{c.company}</b>
                    <span>{c.date}</span>
                  </p>
                  <p className="oc-line">{c.line}</p>
                  <div className="oc-more" aria-hidden={!on}>
                    <div className="oc-in">
                      <p className="oc-story">{c.story}</p>
                      <p className="oc-domino">{c.domino}</p>
                      <Report name={c.company} url={c.report} />
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
