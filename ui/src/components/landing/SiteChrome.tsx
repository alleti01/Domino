import { HACKATHON, REPO_URL } from '../../config'
import { href } from '../../lib/router'

const LINKS: [string, string][] = [
  ['how', 'How it works'],
  ['cases', 'Cases'],
  ['proof', 'Proof'],
  ['demo', 'Demo'],
]

function Logo() {
  return (
    <a className="brand" href={href.home} aria-label="Domino home page">
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
      </span>
      Domino
    </a>
  )
}

/** Top navigation for the landing and Try it yourself pages. */
export function SiteNav() {
  return (
    <header className="site-nav-wrap">
      <nav className="site-nav" aria-label="Main">
        <Logo />
        <ul className="site-nav-links">
          {LINKS.map(([section, label]) => (
            <li key={section}>
              <a href={href.landing(section)}>{label}</a>
            </li>
          ))}
          <li>
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              GitHub<span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          </li>
        </ul>
        <a className="button button-primary site-nav-cta" href={href.cases}>
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
        <p className="small muted">{HACKATHON}</p>
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
        <p className="small muted">
          Incidents named on this site are public postmortems. Domino recreates their mechanisms in isolated simulations; it
          does not claim it would have prevented them.
        </p>
      </div>
    </footer>
  )
}
