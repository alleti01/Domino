import { useEffect, useRef, useState } from 'react'
import { PREVIEW_STATES, type PreviewState } from '../data/useSite'
import { trapTab } from '../lib/focus'
import { href, type Route } from '../lib/router'
import { Icon, type IconName } from './Icon'
import { LogoMark } from './LogoMark'

const NAV: { label: string; href: string; icon: IconName; active: (r: Route) => boolean }[] = [
  { label: 'Investigations', href: href.cases, icon: 'list', active: (r) => r.name === 'cases-index' || r.name === 'case' },
  { label: 'Results', href: href.results, icon: 'bar-chart', active: (r) => r.name === 'results' },
  { label: 'System proof', href: href.underTheHood, icon: 'cpu', active: (r) => r.name === 'under-the-hood' },
]

function Brand() {
  return (
    <a className="brand" href={href.cases} aria-label="Domino investigations">
      <LogoMark className="brand-mark" size={19} />
      Domino
    </a>
  )
}

function NavLinks({ route, onNavigate, className }: { route: Route; onNavigate?: () => void; className: string }) {
  return (
    <ul className={className}>
      {NAV.map((n) => (
        <li key={n.label}>
          <a href={n.href} aria-current={n.active(route) ? 'page' : undefined} onClick={onNavigate}>
            <Icon name={n.icon} size={15} />
            {n.label}
          </a>
        </li>
      ))}
    </ul>
  )
}

function SiteLink() {
  return (
    <a className="site-link" href={href.home}>
      <span aria-hidden="true">←</span> Main site
    </a>
  )
}

/** Development only: forces loading, empty, error and in-progress states for review. */
function DevPreview({ preview, onPreview }: { preview: PreviewState; onPreview: (p: PreviewState) => void }) {
  if (!import.meta.env.DEV) return null
  return (
    <details className="dev-preview">
      <summary>Dev</summary>
      <div className="dev-preview-pop">
        <label htmlFor="preview-state">Preview UI state (development only)</label>
        <select id="preview-state" value={preview} onChange={(e) => onPreview(e.target.value as PreviewState)}>
          {PREVIEW_STATES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </details>
  )
}

/**
 * Global navigation only: where you are in the dashboard, not which case.
 * One slim bar across the top so the content gets the full width; on narrow
 * screens its links move into a drawer.
 */
export function Shell({ route, preview, onPreview }: { route: Route; preview: PreviewState; onPreview: (p: PreviewState) => void }) {
  // The drawer belongs to the page it was opened on; navigating anywhere closes it.
  const routeKey = JSON.stringify(route)
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === routeKey
  const setOpen = (next: boolean | ((o: boolean) => boolean)) =>
    setOpenOn((typeof next === 'function' ? next(open) : next) ? routeKey : null)
  const drawer = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const first = drawer.current?.querySelector<HTMLElement>('a, button, select')
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenOn(null)
        toggle.current?.focus()
      } else if (drawer.current) trapTab(e, drawer.current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <header className="topnav">
        <Brand />
        <nav aria-label="Dashboard" className="topnav-nav">
          <NavLinks route={route} className="topnav-tabs" />
        </nav>
        <div className="topnav-end">
          <DevPreview preview={preview} onPreview={onPreview} />
          <SiteLink />
        </div>
        <button
          ref={toggle}
          type="button"
          className="topnav-menu"
          aria-expanded={open}
          aria-controls="nav-drawer"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="topnav-menu-icon" aria-hidden="true" />
          Menu
        </button>
      </header>

      {open && (
        <div className="drawer-layer">
          <button type="button" className="drawer-backdrop" aria-label="Close menu" tabIndex={-1} onClick={() => setOpen(false)} />
          <div id="nav-drawer" ref={drawer} className="drawer" role="dialog" aria-modal="true" aria-label="Dashboard menu">
            <div className="drawer-head">
              <Brand />
              <button
                type="button"
                className="icon-button"
                aria-label="Close menu"
                onClick={() => {
                  setOpen(false)
                  toggle.current?.focus()
                }}
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <nav aria-label="Dashboard">
              <NavLinks route={route} className="drawer-nav" onNavigate={() => setOpen(false)} />
            </nav>
            <div className="drawer-foot">
              <SiteLink />
              <DevPreview preview={preview} onPreview={onPreview} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
