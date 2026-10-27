import { HACKATHON, REPO_URL } from '../../config'
import { href } from '../../lib/router'
import { scrollToSection } from '../../lib/scroll'
import { useNavState } from '../../hooks/useNavState'
import { Arrow, ArrowLink } from './Motion'

// Everything except GitHub scrolls within the landing page.
const NAV: { label: string; to: string; section?: string; external?: boolean }[] = [
  { label: 'How it works', to: href.landing('how'), section: 'how' },
  { label: 'Cases', to: href.landing('cases'), section: 'cases' },
  { label: 'Built with', to: href.landing('built-with'), section: 'built-with' },
  { label: 'FAQ', to: href.landing('faq'), section: 'faq' },
  { label: 'GitHub', to: REPO_URL, external: true },
]

function Wordmark() {
  return (
    <a className="wordmark" href={href.home} aria-label="Domino home page">
      <span className="wordmark-tiles" aria-hidden="true">
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
      <ArrowLink className="announce-link" href={`${REPO_URL}#readme`} external>
        Read the README
      </ArrowLink>
    </div>
  )
}

/** Transparent nav: hides on the way down, returns on the way up, inverts over dark sections. */
export function SiteNav() {
  const { hidden, scrolled, theme } = useNavState()
  return (
    <header className={`site-nav${hidden ? ' is-hidden' : ''}${scrolled ? ' is-scrolled' : ''} on-${theme}`}>
      <nav className="site-nav-inner" aria-label="Main">
        <Wordmark />
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
        <a className="btn btn-ink btn-sm site-nav-cta" href={href.cases}>
          Open the dashboard
          <Arrow />
        </a>
      </nav>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <Wordmark />
          <p>{HACKATHON}</p>
        </div>
        <ul className="site-footer-links">
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
        <p className="site-footer-note">
          All cases are synthetic worlds that recreate failure mechanisms from public incidents in isolated simulations.
          Domino does not claim it would have prevented those incidents.
        </p>
      </div>
    </footer>
  )
}
