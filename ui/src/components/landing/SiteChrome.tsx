import { HACKATHON, REPO_URL } from '../../config'
import { href } from '../../lib/router'
import { scrollToSection } from '../../lib/scroll'
import { useNavState } from '../../hooks/useNavState'
import { LogoMark } from '../LogoMark'

const NAV: { label: string; to: string; section?: string; external?: boolean }[] = [
  { label: 'How it works', to: href.landing('how'), section: 'how' },
  { label: 'Cases', to: href.landing('cases'), section: 'cases' },
  { label: 'Results', to: href.results },
  { label: 'System proof', to: href.underTheHood },
]

function Caret() {
  return (
    <svg className="g-caret" viewBox="0 0 8 8" aria-hidden="true">
      <path d="M1 2.5 4 5.5 7 2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

export function Wordmark() {
  return (
    <a className="g-logo" href={href.home} aria-label="Domino home page">
      <LogoMark className="g-logo-mark" size={21} />
      Domino
    </a>
  )
}

/** One line above the nav, like a release note. */
export function Announcement() {
  return (
    <div className="g-announce">
      <b>New</b>
      <span>Fix testing: Domino can re-run the sandbox with its own proposed fix applied.</span>
      <a href={`${REPO_URL}#readme`} target="_blank" rel="noreferrer">
        Read more<span className="visually-hidden"> (opens in a new tab)</span>
      </a>
    </div>
  )
}

export function SiteNav() {
  const { scrolled } = useNavState()
  return (
    <header className={`g-nav${scrolled ? ' is-scrolled' : ''}`}>
      <nav className="g-wrap g-nav-inner" aria-label="Main">
        <Wordmark />
        <ul className="g-nav-links">
          {NAV.map((item) => (
            <li key={item.label}>
              <a
                href={item.to}
                onClick={(e) => {
                  if (item.section && window.location.hash === item.to) {
                    e.preventDefault()
                    scrollToSection(item.section, { smooth: true })
                  }
                }}
              >
                {item.label}
                {item.section && <Caret />}
              </a>
            </li>
          ))}
        </ul>
        <div className="g-nav-actions">
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub<span className="visually-hidden"> (opens in a new tab)</span>
          </a>
          <a className="g-btn g-btn-accent" href={href.cases}>
            Open the dashboard
          </a>
        </div>
      </nav>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="g-footer">
      <div className="g-wrap">
        <div className="g-footer-grid">
          <div>
            <Wordmark />
            <p className="g-body">Finds what a change would break before it ships, with the evidence and the runs to prove it.</p>
          </div>
          <div>
            <h3>Product</h3>
            <ul>
              <li>
                <a href={href.cases}>Dashboard</a>
              </li>
              <li>
                <a href={href.try}>Try it yourself</a>
              </li>
              <li>
                <a href={href.results}>Results</a>
              </li>
            </ul>
          </div>
          <div>
            <h3>Proof</h3>
            <ul>
              <li>
                <a href={href.underTheHoodAt('nemotron')}>Nemotron receipts</a>
              </li>
              <li>
                <a href={href.underTheHoodAt('zetaris')}>Semantic layer</a>
              </li>
              <li>
                <a href={href.underTheHoodAt('meterless')}>World Model</a>
              </li>
            </ul>
          </div>
          <div>
            <h3>Project</h3>
            <ul>
              <li>
                <a href={REPO_URL} target="_blank" rel="noreferrer">
                  GitHub<span className="visually-hidden"> (opens in a new tab)</span>
                </a>
              </li>
              <li>
                <a href={`${REPO_URL}#readme`} target="_blank" rel="noreferrer">
                  README<span className="visually-hidden"> (opens in a new tab)</span>
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="g-footer-base">
          <span>{HACKATHON}</span>
          <span>Synthetic systems only. No claim about real incidents.</span>
        </div>
      </div>
    </footer>
  )
}
