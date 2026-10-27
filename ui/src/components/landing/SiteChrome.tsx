import { HACKATHON, REPO_URL } from '../../config'
import { href } from '../../lib/router'
import { useNavState } from '../../hooks/useNavState'
import type { SiteData } from '../../types'
import { LogoMark } from '../LogoMark'
import { MegaNav } from './MegaNav'

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
      <b>Track 1</b>
      <span>Every verdict on this site comes from a recorded live run on synthetic systems.</span>
      <a href={href.results}>See the results</a>
    </div>
  )
}

export function SiteNav({ site }: { site: SiteData | null }) {
  const { scrolled } = useNavState()
  return (
    <header className={`g-nav${scrolled ? ' is-scrolled' : ''}`}>
      <MegaNav site={site} logo={<Wordmark />} />
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
            <p className="g-body">Finds what a change would break before it ships, with the source rows and sandbox runs behind every verdict.</p>
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
                <a href={href.info('sponsors')}>Sponsors</a>
              </li>
              <li>
                <a href={href.info('method')}>Method</a>
              </li>
              <li>
                <a href={href.info('about')}>About</a>
              </li>
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
