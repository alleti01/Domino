import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { REPO_URL } from '../config'
import { href, navigate, type Route } from '../lib/router'
import type { SiteData } from '../types'
import { allRuns, fmtAgo, isExample, shortRun } from './derive'
import { DIcon, type DIconName } from './icons'
import { VERDICT_SHORT } from './ui'
import { RUN_STATUS, VERDICT } from '../lib/labels'
import { LogoMark } from '../components/LogoMark'

export interface Crumb {
  label: string
  href?: string
}

type NavKey = 'overview' | 'live' | 'investigations' | 'runs' | 'docs' | 'changelog' | 'results' | 'nemotron' | 'zetaris' | 'meterless'

function activeNav(route: Route): NavKey | null {
  switch (route.name) {
    case 'overview':
      return 'overview'
    case 'live':
      return 'live'
    case 'docs':
      return 'docs'
    case 'changelog':
      return 'changelog'
    case 'cases-index':
    case 'case':
      return 'investigations'
    case 'runs':
      return 'runs'
    case 'results':
      return 'results'
    case 'under-the-hood':
      return route.section === 'zetaris' ? 'zetaris' : route.section === 'meterless' ? 'meterless' : 'nemotron'
    default:
      return null
  }
}

const NAV: { group?: string; items: { key: NavKey; label: string; href: string; icon: DIconName }[] }[] = [
  {
    items: [
      { key: 'overview', label: 'Overview', href: href.overview, icon: 'overview' },
      { key: 'live', label: 'Live check', href: href.live(), icon: 'play' },
      { key: 'investigations', label: 'Investigations', href: href.cases, icon: 'investigations' },
      { key: 'runs', label: 'Runs', href: href.runs, icon: 'runs' },
    ],
  },
  { group: 'Evaluation', items: [{ key: 'results', label: 'Results', href: href.results, icon: 'results' }] },
  {
    group: 'Platform',
    items: [
      { key: 'nemotron', label: 'Model calls', href: href.underTheHoodAt('nemotron'), icon: 'model' },
      { key: 'zetaris', label: 'Semantic layer', href: href.underTheHoodAt('zetaris'), icon: 'data' },
      { key: 'meterless', label: 'World Model', href: href.underTheHoodAt('meterless'), icon: 'memory' },
    ],
  },
  {
    group: 'Resources',
    items: [
      { key: 'docs', label: 'Docs', href: href.docs(), icon: 'book' },
      { key: 'changelog', label: 'Changelog', href: href.changelog, icon: 'timeline' },
    ],
  },
]

/** Projects Domino watches. One today (the example systems); more are added from the command line. */
interface Project {
  id: string
  name: string
  detail: string
}

function ProjectSwitcher({ site }: { site: SiteData | null }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const runs = site ? site.cases.reduce((n, c) => n + c.runs.length, 0) : 0
  // Projects come from the command line; until one is connected there are none.
  const connected = !!site && site.cases.length > 0
  const projects: Project[] = connected
    ? [{ id: 'project', name: site!.cases.some((c) => isExample(c.kind)) ? 'Example systems' : 'This repository', detail: `${site!.cases.length} changes · ${runs} runs` }]
    : []
  const current: Project = projects[0] ?? { id: 'none', name: 'No project', detail: site ? 'Add one with npx' : 'Loading…' }

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="dx-proj" ref={ref}>
      <button type="button" className="dx-proj-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={`dx-proj-avatar${connected ? '' : ' is-empty'}`} aria-hidden="true">
          {connected ? current.name.charAt(0) : <DIcon name="plus" size={13} />}
        </span>
        <span className="dx-proj-text">
          <span className="dx-proj-name">{current.name}</span>
          <span className="dx-proj-detail">{current.detail}</span>
        </span>
        <DIcon name="chevron-down" size={12} className="dx-dd-chev" />
      </button>
      {open && (
        <div className="dx-proj-menu" role="menu">
          <div className="dx-proj-menu-label">Projects</div>
          {projects.length === 0 && <div className="dx-proj-empty">No projects connected yet</div>}
          {projects.map((p) => (
            <button key={p.id} type="button" role="menuitemradio" aria-checked={p.id === current.id} className="dx-proj-item" onClick={() => setOpen(false)}>
              <span className="dx-proj-avatar is-sm" aria-hidden="true">
                {p.name.charAt(0)}
              </span>
              <span className="dx-proj-text">
                <span className="dx-proj-name">{p.name}</span>
                <span className="dx-proj-detail">{p.detail}</span>
              </span>
              {p.id === current.id && <DIcon name="check" size={13} className="dx-proj-check" />}
            </button>
          ))}
          <div className="dx-proj-sep" />
          <a
            role="menuitem"
            className="dx-proj-item is-add"
            href={href.docs('cli')}
            onClick={() => setOpen(false)}
          >
            <span className="dx-proj-plus" aria-hidden="true">
              <DIcon name="plus" size={13} />
            </span>
            <span className="dx-proj-text">
              <span className="dx-proj-name">Add project</span>
              <span className="dx-proj-detail">Connect a repository with npx</span>
            </span>
          </a>
        </div>
      )}
    </div>
  )
}

const RECENT = 6

/** The latest runs, newest first: what changed, its result, and when. */
function RecentRuns({ site, route, onNavigate }: { site: SiteData | null; route: Route; onNavigate: () => void }) {
  if (!site) return null
  const rows = allRuns(site).slice(0, RECENT)
  if (rows.length === 0) return null
  const currentRun = route.name === 'case' ? route.runId : null
  return (
    <div className="dx-recent">
      <div className="dx-recent-h">
        <span>Recent runs</span>
        <a href={href.runs} onClick={onNavigate}>
          All
        </a>
      </div>
      <ol>
        {rows.map(({ caseEntry, run, inv }) => {
          const tone = run.verdict ? VERDICT[run.verdict].tone : RUN_STATUS[run.status].tone
          const label = run.verdict ? VERDICT_SHORT[run.verdict] : RUN_STATUS[run.status].label
          return (
            <li key={run.runId}>
              <a
                href={href.case(caseEntry.id, { runId: run.runId })}
                aria-current={currentRun === run.runId ? 'page' : undefined}
                onClick={onNavigate}
                title={`${inv?.change?.title ?? caseEntry.label} · ${label}`}
              >
                <span className={`dx-dot tone-${tone}${run.status === 'running' ? ' is-pulse' : ''}`} aria-hidden="true" />
                <span className="dx-recent-text">
                  <span className="dx-recent-title">{inv?.change?.title ?? caseEntry.label}</span>
                  <span className="dx-recent-meta">
                    {caseEntry.label.replace(/^.*· /, '')} · {fmtAgo(run.startedAt ? Date.parse(run.startedAt) : null)}
                  </span>
                </span>
              </a>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function Sidebar({ route, site, onNavigate }: { route: Route; site: SiteData | null; onNavigate: () => void }) {
  const active = activeNav(route)
  const runningNow = site ? allRuns(site).filter((r) => r.run.status === 'running').length : 0
  const counts: Partial<Record<NavKey, number>> = site
    ? { investigations: site.cases.length, runs: site.cases.reduce((n, c) => n + c.runs.length, 0) }
    : {}
  return (
    <aside className="dx-side" aria-label="Console navigation">
      <a className="dx-brand" href={href.home} aria-label="Domino home">
        <LogoMark className="dx-brand-mark" size={22} />
        <span className="dx-brand-name">Domino</span>
      </a>
      <ProjectSwitcher site={site} />
      <button
        type="button"
        className="dx-side-search"
        onClick={() => window.dispatchEvent(new Event('dx-open-cmdk'))}
        aria-label="Search investigations, runs and pages"
      >
        <DIcon name="search" size={14} />
        <span>Search</span>
        <kbd className="dx-kbd">⌘K</kbd>
      </button>
      <nav className="dx-nav" onClick={onNavigate}>
        {NAV.map((g, i) => (
          <div key={i}>
            {g.group && <div className="dx-nav-group">{g.group}</div>}
            {g.items
              .filter((it) => it.key !== 'live' || runningNow > 0 || active === 'live')
              .map((it) => (
                <a key={it.key} href={it.href} aria-current={active === it.key ? 'page' : undefined}>
                  <DIcon name={it.icon} />
                  {it.label}
                  {it.key === 'live' && runningNow > 0 ? (
                    <span className="dx-nav-live">
                      <span className="dx-dot tone-ok is-pulse" aria-hidden="true" />
                      {runningNow}
                    </span>
                  ) : (
                    !!counts[it.key] && <span className="dx-nav-count">{counts[it.key]}</span>
                  )}
                </a>
              ))}
          </div>
        ))}
      </nav>
      <RecentRuns site={site} route={route} onNavigate={onNavigate} />
      <div className="dx-side-foot">
        <div className="dx-side-links">
          <a href={href.home}>
            <DIcon name="globe" size={14} /> Website
          </a>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            <DIcon name="github" size={14} /> GitHub
          </a>
        </div>
      </div>
    </aside>
  )
}

// ---------- Command palette ----------

interface CmdItem {
  group: string
  label: string
  hint?: string
  to: string
  icon: DIconName
  keywords: string
}

function CommandPalette({ site, onClose }: { site: SiteData | null; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const items = useMemo<CmdItem[]>(() => {
    const running = site ? allRuns(site).some((r) => r.run.status === 'running') : false
    const pages: CmdItem[] = NAV.flatMap((g) => g.items)
      .filter((it) => it.key !== 'live' || running)
      .map((it) => ({
      group: 'Pages',
      label: it.label,
      to: it.href,
      icon: it.icon,
      keywords: it.label,
    }))
    if (!site) return pages
    const cases: CmdItem[] = site.cases.map((c) => {
      const inv = c.runs[0]?.load.ok ? c.runs[0].load.investigation : null
      return {
        group: 'Investigations',
        label: inv?.change?.title ?? c.label,
        hint: c.label,
        to: href.case(c.id),
        icon: 'investigations',
        keywords: [c.id, c.label, inv?.change?.title, inv?.change?.changeId].join(' '),
      }
    })
    const runs: CmdItem[] = allRuns(site).map(({ caseEntry, run }) => ({
      group: 'Runs',
      label: run.runId,
      hint: caseEntry.label,
      to: href.case(caseEntry.id, { runId: run.runId }),
      icon: 'runs',
      keywords: `${run.runId} ${shortRun(run.runId)} ${caseEntry.label}`,
    }))
    return [...pages, ...cases, ...runs]
  }, [site])

  const shown = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const hits = terms.length ? items.filter((it) => terms.every((t) => it.keywords.toLowerCase().includes(t))) : items.filter((it) => it.group !== 'Runs')
    return hits.slice(0, 40)
  }, [items, q])

  useEffect(() => inputRef.current?.focus(), [])
  useEffect(() => setSel(0), [q])
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const go = (it: CmdItem | undefined) => {
    if (!it) return
    onClose()
    navigate(it.to)
  }

  let lastGroup = ''
  return (
    <>
      <div className="dx-cmdk-scrim" onClick={onClose} />
      <div className="dx-cmdk" role="dialog" aria-modal="true" aria-label="Search">
        <div className="dx-cmdk-in">
          <DIcon name="search" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search investigations, run IDs, pages…"
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="dx-cmdk-list"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSel((s) => Math.min(s + 1, shown.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSel((s) => Math.max(s - 1, 0))
              } else if (e.key === 'Enter') go(shown[sel])
              else if (e.key === 'Escape') onClose()
            }}
          />
          <kbd className="dx-kbd">esc</kbd>
        </div>
        <div className="dx-cmdk-list" id="dx-cmdk-list" role="listbox" ref={listRef}>
          {shown.length === 0 && <div className="dx-cmdk-empty">No matches for “{q}”</div>}
          {shown.map((it, i) => {
            const head = it.group !== lastGroup ? <div className="dx-cmdk-group">{it.group}</div> : null
            lastGroup = it.group
            return (
              <div key={`${it.group}:${it.to}`}>
                {head}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === sel}
                  className="dx-cmdk-item"
                  onMouseMove={() => setSel(i)}
                  onClick={() => go(it)}
                >
                  <DIcon name={it.icon} size={14} />
                  <span>{it.label}</span>
                  {it.hint && <span className="dx-faint">{it.hint}</span>}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ---------- Frame ----------

export function Console({
  route,
  site,
  crumbs,
  mainRef,
  drawer,
  full,
  children,
}: {
  route: Route
  site: SiteData | null
  crumbs: Crumb[]
  mainRef: React.RefObject<HTMLElement | null>
  drawer?: ReactNode
  /** Page fills the whole content area (no max width, to the bottom of the screen). */
  full?: boolean
  children: ReactNode
}) {
  const [navOpen, setNavOpen] = useState(false)
  const [cmdk, setCmdk] = useState(false)

  useEffect(() => {
    const open = () => setCmdk(true)
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdk((v) => !v)
      } else if (e.key === '/' && !(e.target as HTMLElement).closest('input,textarea,select')) {
        e.preventDefault()
        setCmdk(true)
      }
    }
    window.addEventListener('dx-open-cmdk', open)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('dx-open-cmdk', open)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div className={`dx${navOpen ? ' is-nav-open' : ''}`}>
      <button type="button" className="skip-link" onClick={() => mainRef.current?.focus()}>
        Skip to content
      </button>
      <Sidebar route={route} site={site} onNavigate={() => setNavOpen(false)} />
      {navOpen && <div className="dx-scrim" style={{ zIndex: 44 }} onClick={() => setNavOpen(false)} />}
      <div className="dx-main">
        <header className="dx-top">
          <button type="button" className="dx-btn dx-btn-ghost dx-btn-icon dx-menu-btn" aria-label="Open navigation" onClick={() => setNavOpen(true)}>
            <DIcon name="menu" />
          </button>
          <nav className="dx-crumbs" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={i} className="dx-row" style={{ gap: 6, minWidth: 0 }}>
                {i > 0 && <span className="dx-crumb-sep">/</span>}
                {c.href && i < crumbs.length - 1 ? <a href={c.href}>{c.label}</a> : <span aria-current="page">{c.label}</span>}
              </span>
            ))}
          </nav>
          <div className="dx-top-right">
            <button type="button" className="dx-btn dx-btn-sm dx-hide-sm" onClick={() => setCmdk(true)}>
              <DIcon name="search" size={14} /> Search <kbd className="dx-kbd">⌘K</kbd>
            </button>
          </div>
        </header>
        <main id="main" ref={mainRef} tabIndex={-1} className={`dx-content${full ? ' is-full' : ''}`}>
          {children}
        </main>
      </div>
      {drawer}
      {cmdk && <CommandPalette site={site} onClose={() => setCmdk(false)} />}
    </div>
  )
}
