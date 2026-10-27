// The top nav. Each tab opens one shared panel under the bar: an overview link,
// the sections of one info page in labelled columns, and a card on the right
// with a drawn preview of that page, made from the recorded runs. Moving
// between tabs keeps the panel open; its height eases to the new menu, the old
// content fades out and the new one comes in from the side you moved toward,
// item by item. These pages hold what the landing page leaves out.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { REPO_URL } from '../../config'
import { DIcon, type DIconName } from '../../dash/icons'
import { href } from '../../lib/router'
import type { SiteData } from '../../types'
import { infoFacts, type InfoFacts } from './info/facts'
import { BrandTile, HubVisual, IconTile, LayersVisual, PrCheckVisual, RunsVisual, type Brand } from './info/Visuals'

interface Entry {
  key: string
  label: string
  line: string
  to: string
  tile: ReactNode
}

interface Menu {
  key: string
  label: string
  overview: { label: string; to: string }
  groups: { title: string; entries: Entry[] }[]
  visual: ReactNode
  card: { title: string; text: string; to: string }
  /** Key figures under the lists, or commands for the docs. */
  stats: [ReactNode, string][]
  foot: { text: string; label: string; to: string; external?: boolean }
}

const it = (name: DIconName) => <IconTile name={name} size={40} />
const bt = (brand: Brand) => <BrandTile brand={brand} size={40} />

function menus(fx: InfoFacts | null): Menu[] {
  const sp = (section: string) => href.info('sponsors', section)
  const me = (section: string) => href.info('method', section)
  const ab = (section: string) => href.info('about', section)
  const runs = fx ? `${fx.site.runs} recorded runs` : 'the recorded runs'

  return [
    {
      key: 'sponsors',
      label: 'Sponsors',
      overview: { label: 'How we used each sponsor', to: href.info('sponsors') },
      groups: [
        {
          title: 'Data and reasoning',
          entries: [
            { key: 'zetaris', label: 'Zetaris', line: fx ? `Joins ${fx.site.sources.length} systems · ${fx.queries} queries` : 'Joins every system into one layer', to: sp('zetaris'), tile: bt('zetaris') },
            { key: 'nemotron', label: 'NVIDIA Nemotron', line: fx ? `Investigates and reviews · ${fx.site.nemotronCalls} calls` : 'Investigates, then reviews', to: sp('nemotron'), tile: bt('nvidia') },
          ],
        },
        {
          title: 'Meterless',
          entries: [
            { key: 'nightshift', label: 'Nightshift', line: fx ? `Routes every call · ${fx.site.answeredCalls} receipts` : 'Routes every AI call, with receipts', to: sp('nightshift'), tile: bt('meterless') },
            { key: 'world-model', label: 'World Model', line: fx ? `Holds what a check finds · ${fx.memory.total} ops` : 'Holds what a check finds', to: sp('world-model'), tile: bt('meterless') },
          ],
        },
      ],
      visual: <HubVisual facts={fx} compact />,
      stats: [
        [fx?.queries ?? '–', 'Semantic-layer queries'],
        [fx?.site.nemotronCalls ?? '–', 'Nemotron calls'],
        [fx?.site.answeredCalls ?? '–', 'Nightshift receipts'],
        [fx?.memory.total ?? '–', 'World Model ops'],
      ],
      card: { title: 'Four sponsors, one check', text: 'Every check calls out to all four. Each has a single job, and leaves a record you can open.', to: href.info('sponsors') },
      foot: { text: `Figures counted from ${runs}.`, label: 'Open the proof in the console', to: href.underTheHood },
    },
    {
      key: 'method',
      label: 'Method',
      overview: { label: 'How a check works', to: href.info('method') },
      groups: [
        {
          title: 'How it works',
          entries: [
            { key: 'check', label: 'The check, end to end', line: 'Seven steps, capped on time', to: me('check'), tile: it('timeline') },
            { key: 'limits', label: 'Limits on the agent', line: 'Code decides, the model explains', to: me('limits'), tile: it('shield') },
          ],
        },
        {
          title: 'How we measured it',
          entries: [
            { key: 'measure', label: 'Five ways to run it', line: 'Against simpler versions of itself', to: me('measure'), tile: it('results') },
            { key: 'compare', label: 'Compared with other tools', line: 'Before the change ships, not after', to: me('compare'), tile: it('filter') },
            { key: 'limitations', label: 'Limitations', line: 'What a verdict doesn’t tell you', to: me('limitations'), tile: it('info') },
          ],
        },
      ],
      visual: <RunsVisual facts={fx} compact />,
      stats: [
        ['7', 'Steps in a check'],
        ['3', 'Sandbox runs per test'],
        [fx?.site.worlds ?? '–', 'Test setups'],
        ['5', 'Ways we ran it'],
      ],
      card: { title: 'One change, three runs', text: 'Without the change, with it, and with it undone. Plain code reads the result.', to: href.info('method') },
      foot: { text: 'Every check is capped on steps, model calls and time.', label: 'See the results', to: href.results },
    },
    {
      key: 'about',
      label: 'About',
      overview: { label: 'About the project', to: href.info('about') },
      groups: [
        {
          title: 'The project',
          entries: [
            { key: 'why', label: 'Why Track 1', line: 'The answer is spread across systems', to: ab('why'), tile: it('graph') },
            { key: 'team', label: 'Team', line: 'Three people, three parts', to: ab('team'), tile: it('overview') },
            { key: 'roadmap', label: 'Roadmap', line: 'What comes next', to: ab('roadmap'), tile: it('restart') },
          ],
        },
        {
          title: 'Trust',
          entries: [
            { key: 'data', label: 'Data and privacy', line: 'Synthetic systems, read-only access', to: ab('data'), tile: it('data') },
            { key: 'disclosures', label: 'Disclosures', line: 'What we built, and with what', to: ab('disclosures'), tile: it('file') },
          ],
        },
      ],
      visual: <LayersVisual facts={fx} compact />,
      stats: [
        ['6 days', '22–27 October'],
        [fx?.site.sources.length ?? '–', 'Sources joined'],
        [fx?.site.runs ?? '–', 'Recorded runs'],
        ['3', 'People'],
      ],
      card: { title: 'Scattered sources, one layer', text: 'Track 1 is about fragmented intelligence. Domino joins the systems a change touches.', to: href.info('about') },
      foot: { text: 'GenAI.Works Open Agent Hackathon 2026 · Track 1', label: 'Source on GitHub', to: REPO_URL, external: true },
    },
    {
      key: 'docs',
      label: 'Docs',
      overview: { label: 'Read the docs', to: href.docs() },
      groups: [
        {
          title: 'Get started',
          entries: [
            { key: 'intro', label: 'Introduction', line: 'What Domino does', to: href.docs('introduction'), tile: it('book') },
            { key: 'quick', label: 'Quickstart', line: 'Check your first pull request', to: href.docs('quickstart'), tile: it('play') },
          ],
        },
        {
          title: 'Reference',
          entries: [
            { key: 'reports', label: 'Reading a report', line: 'Evidence, experiments, replay', to: href.docs('reports'), tile: it('file') },
            { key: 'verdicts', label: 'Verdicts', line: 'What each answer means', to: href.docs('verdicts'), tile: it('check') },
            { key: 'cli', label: 'Command line', line: 'Every domino command', to: href.docs('cli'), tile: it('terminal') },
          ],
        },
      ],
      visual: <PrCheckVisual facts={fx} compact />,
      stats: [
        [<code key="d">domino dashboard</code>, 'Open the console'],
        [<code key="p">domino pr 42</code>, 'Check a pull request'],
        [<code key="w">domino watch</code>, 'Watch a repository'],
      ],
      card: { title: 'What a check leaves on your pull request', text: 'The verdict, the three runs behind it, and the command that produced it.', to: href.docs('quickstart') },
      foot: { text: 'Open source. Runs on your own repository.', label: 'Changelog', to: href.changelog },
    },
  ]
}

function Caret() {
  return (
    <svg className="mn-caret" viewBox="0 0 8 8" aria-hidden="true">
      <path d="M1 2.5 4 5.5 7 2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

/** A label that rolls up to a copy of itself on hover. */
function Roll({ children }: { children: string }) {
  return (
    <span className="mn-roll" data-text={children}>
      <span>{children}</span>
    </span>
  )
}

function Panel({ menu, dir, onGo }: { menu: Menu; dir: number; onGo: () => void }) {
  const c = menu.card
  let i = 0
  return (
    <div className="mn-layer" style={{ '--dir': dir } as CSSProperties}>
      <div className="mn-grid">
        <div className="mn-left">
          <a className="mn-over" href={menu.overview.to} onClick={onGo}>
            {menu.overview.label}
            <DIcon name="arrow-right" size={14} />
          </a>
          <div className="mn-cols">
            {menu.groups.map((g) => (
              <div key={g.title} className="mn-list">
                <p className="mn-heading">{g.title}</p>
                <ul>
                  {g.entries.map((x) => (
                    <li key={x.key} style={{ '--i': i++ } as CSSProperties}>
                      <a href={x.to} onClick={onGo}>
                        <span className="mn-ico">{x.tile}</span>
                        <span className="mn-txt">
                          <b>{x.label}</b>
                          <small>{x.line}</small>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <dl className="mn-stats" style={{ '--n': menu.stats.length } as CSSProperties}>
            {menu.stats.map(([v, l]) => (
              <div key={l}>
                <dd>{v}</dd>
                <dt>{l}</dt>
              </div>
            ))}
          </dl>
        </div>
        <a className="mn-card2" href={c.to} onClick={onGo}>
          <span className="mn-vis">{menu.visual}</span>
          <span className="mn-c-copy">
            <b className="mn-c-title">{c.title}</b>
            <span className="mn-c-text">{c.text}</span>
            <span className="mn-c-cta">
              Read more <DIcon name="arrow-right" size={13} />
            </span>
          </span>
        </a>
      </div>
      <div className="mn-foot">
        <span>{menu.foot.text}</span>
        <a href={menu.foot.to} onClick={onGo} {...(menu.foot.external ? { target: '_blank', rel: 'noreferrer' } : {})}>
          {menu.foot.label} <DIcon name="arrow-right" size={12} />
        </a>
      </div>
    </div>
  )
}

export function MegaNav({ site, logo }: { site: SiteData | null; logo: ReactNode }) {
  const fx = useMemo(() => (site ? infoFacts(site) : null), [site])
  const all = useMemo(() => menus(fx), [fx])
  const [open, setOpen] = useState<number | null>(null)
  const [last, setLast] = useState(0)
  const [leaving, setLeaving] = useState<{ k: number; id: number } | null>(null)
  const [dir, setDir] = useState(0)
  const [h, setH] = useState(0)
  const timer = useRef(0)
  const live = useRef<HTMLDivElement>(null)
  const nav = useRef<HTMLElement>(null)
  const triggers = useRef<(HTMLButtonElement | null)[]>([])

  const openRef = useRef<number | null>(null)
  const seq = useRef(0)
  useEffect(() => {
    openRef.current = open
  }, [open])
  const show = (k: number) => {
    clearTimeout(timer.current)
    const cur = openRef.current
    if (cur === k) return
    if (cur != null) {
      setDir(Math.sign(k - cur))
      setLeaving({ k: cur, id: ++seq.current })
    } else setDir(0)
    openRef.current = k
    setLast(k)
    setOpen(k)
  }
  const hide = useCallback((delay = 140) => {
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(null), delay)
  }, [])

  // The panel's height follows the menu inside it.
  useLayoutEffect(() => {
    const el = live.current
    if (!el) return
    const ro = new ResizeObserver(() => setH(el.offsetHeight))
    ro.observe(el)
    setH(el.offsetHeight)
    return () => ro.disconnect()
  }, [last])

  useEffect(() => {
    if (!leaving) return
    const t = setTimeout(() => setLeaving(null), 220)
    return () => clearTimeout(t)
  }, [leaving])

  useEffect(() => {
    if (open == null) return
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      triggers.current[open]?.focus()
      setOpen(null)
    }
    const away = (e: PointerEvent) => {
      if (!nav.current?.contains(e.target as Node)) setOpen(null)
    }
    addEventListener('keydown', key)
    addEventListener('pointerdown', away)
    return () => {
      removeEventListener('keydown', key)
      removeEventListener('pointerdown', away)
    }
  }, [open])

  useEffect(() => () => clearTimeout(timer.current), [])

  // Going to another page closes the menu.
  useEffect(() => {
    const shut = () => setOpen(null)
    addEventListener('hashchange', shut)
    return () => removeEventListener('hashchange', shut)
  }, [])

  const close = () => setOpen(null)

  return (
    <nav
      ref={nav}
      className={`mn${open != null ? ' is-open' : ''}`}
      aria-label="Main"
      onPointerLeave={(e) => e.pointerType === 'mouse' && hide()}
      onPointerEnter={() => clearTimeout(timer.current)}
      onBlur={(e) => {
        if (!nav.current?.contains(e.relatedTarget as Node)) hide(0)
      }}
    >
      <div className="g-wrap mn-bar">
        {logo}
        <ul className="mn-tabs">
          {all.map((m, k) => (
            <li key={m.key}>
              <button
                ref={(el) => {
                  triggers.current[k] = el
                }}
                type="button"
                className={open === k ? 'is-on' : undefined}
                aria-expanded={open === k}
                aria-controls="mn-panel"
                onPointerEnter={(e) => e.pointerType === 'mouse' && show(k)}
                onClick={() => (open === k ? setOpen(null) : show(k))}
              >
                {m.label}
                <Caret />
              </button>
            </li>
          ))}
        </ul>
        <div className="mn-actions">
          <a className="mn-gh" href={REPO_URL} target="_blank" rel="noreferrer" onPointerEnter={() => open != null && hide(0)}>
            <DIcon name="github" size={15} />
            <Roll>GitHub</Roll>
            <span className="visually-hidden"> (opens in a new tab)</span>
          </a>
          <a className="g-btn g-btn-accent mn-cta" href={href.cases} onPointerEnter={() => open != null && hide(0)}>
            <Roll>Open the dashboard</Roll>
          </a>
        </div>
      </div>

      <div id="mn-panel" className="mn-panel" aria-hidden={open == null} inert={open == null}>
        <div className="g-wrap">
          <div className="mn-card" style={{ height: h || undefined }}>
            {leaving && leaving.k !== last && (
              <div key={`out-${leaving.id}`} className="mn-out" aria-hidden="true">
                <Panel menu={all[leaving.k]} dir={0} onGo={close} />
              </div>
            )}
            <div ref={live} key={all[last].key} className="mn-in">
              <Panel menu={all[last]} dir={dir} onGo={close} />
            </div>
          </div>
        </div>
      </div>
      <div className="mn-scrim" aria-hidden="true" onPointerEnter={() => hide(60)} />
    </nav>
  )
}
