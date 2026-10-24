import { HACKATHON, REPO_URL } from '../../config'
import { href } from '../../lib/router'
import { scrollToSection } from '../../lib/scroll'
import { useNavState } from '../../hooks/useNavState'

// Everything except GitHub scrolls within the landing page.
const NAV: { label: string; to: string; section?: string; external?: boolean }[] = [
  { label: 'How it works', to: href.landing('how'), section: 'how' },
  { label: 'Cases', to: href.landing('cases'), section: 'cases' },
  { label: 'Proof', to: href.landing('proof'), section: 'proof' },
  { label: 'Demo', to: href.landing('demo'), section: 'demo' },
  { label: 'GitHub', to: REPO_URL, external: true },
]

function Logo() {
  return (
    <a className="brand site-brand" href={href.home} aria-label="Domino home page">
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
      </span>
      Domino
    </a>
  )
}

/** Thin strip above the nav: what this site is, and where the write-up lives. */
export function AnnouncementBar() {
  return (
    <div className="announce">
      <p>
        <span className="announce-label">Hackathon 2026</span>
        <span>Domino is our entry for Track 1: Solving Fragmented Intelligence.</span>
      </p>
      <a className="announce-button" href={`${REPO_URL}#readme`} target="_blank" rel="noreferrer">
        Read the README<span className="visually-hidden"> (opens in a new tab)</span>
      </a>
    </div>
  )
}

/** Floating pill navigation for the landing and Try it yourself pages. */
export function SiteNav() {
  const { hidden, theme } = useNavState()
  return (
    <header className={`site-nav-wrap${hidden ? ' is-hidden' : ''} nav-${theme}`}>
      <nav className="site-nav" aria-label="Main">
        <Logo />
        <ul className="site-nav-links">
          {NAV.map((item) => (
            <li key={item.label}>
              {item.external ? (
                <a href={item.to} target="_blank" rel="noreferrer">
                  {item.label}
                  <span className="visually-hidden"> (opens in a new tab)</span>
                </a>
              ) : (
                <a
                  href={item.to}
                  onClick={(e) => {
                    // Same link clicked again: the URL won't change, so scroll ourselves.
                    if (item.section && window.location.hash === item.to) {
                      e.preventDefault()
                      scrollToSection(item.section, { smooth: true })
                    }
                  }}
                >
                  {item.label}
                </a>
              )}
            </li>
          ))}
        </ul>
        <a className="btn btn-light site-nav-cta" href={href.cases}>
          Open the dashboard
        </a>
      </nav>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <Logo />
        <p className="small">{HACKATHON}</p>
        <ul className="site-footer-links small">
          <li>
            <a href={href.try}>Try it yourself</a>
          </li>
          <li>
            <a href={href.cases}>Dashboard</a>
          </li>
          <li>
            <a href={href.results}>Results</a>
          </li>
          <li>
            <a href={href.underTheHood}>Under the hood</a>
          </li>
          <li>
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              GitHub<span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          </li>
        </ul>
        <p className="small site-footer-note">
          Incidents named on this site are public postmortems. Domino recreates their mechanisms in isolated simulations; it
          does not claim it would have prevented them.
        </p>
      </div>
    </footer>
  )
}
