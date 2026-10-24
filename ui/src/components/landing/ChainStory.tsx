import type { CSSProperties } from 'react'
import type { Showcase } from '../../lib/showcase'
import { chainTiles } from '../../lib/showcase'
import { VERDICT } from '../../lib/labels'
import { href } from '../../lib/router'
import { useInView } from '../../hooks/useInView'
import { Icon } from '../Icon'
import { TourSection } from './Tour'

/** The core idea as a row of dominoes: each tile is a component, each from a different system. */
export function ChainStory({ show, placeholder }: { show: Showcase | null; placeholder: boolean }) {
  const [ref, inView] = useInView<HTMLOListElement>()
  const tiles = show ? chainTiles(show.inv) : []
  const sources = new Set(tiles.flatMap((t) => t.sources))
  const verdict = show?.inv.verdict ? VERDICT[show.inv.verdict.verdict] : null

  return (
    <TourSection
      id="idea"
      kicker="The idea"
      title="A change can be fine on its own and still break something two systems away."
      lede={
        <>
          No single system holds this chain. Domino joins {sources.size > 0 ? sources.size : 'several'} independent
          sources through the Zetaris semantic layer to find it, then tests whether the last domino really falls.
        </>
      }
      placeholder={placeholder}
      link={show ? { href: href.case(show.caseEntry.id, { section: 'chain' }), label: 'See this chain in the full report' } : undefined}
    >
      {tiles.length === 0 ? (
        <p className="tour-empty">The chain appears here once a run has traced one.</p>
      ) : (
        <ol ref={ref} className={`domino-row${inView ? ' in-view' : ''}`} aria-label={`Causal chain in the ${show!.caseEntry.label} case`}>
          {tiles.map((t, i) => (
            <li key={t.id} className="domino-step" style={{ '--i': i } as CSSProperties}>
              {t.link && (
                <span className={`domino-link ${t.link.status}`}>
                  <span className="domino-link-line" aria-hidden="true" />
                  <span className="domino-link-text">
                    {t.link.relation.replace(/_/g, ' ')}
                    <span className="domino-link-status">
                      {t.link.status}
                      {t.link.fromGraph && ', from the graph'}
                    </span>
                  </span>
                </span>
              )}
              <span className="domino-tile">
                <span className="domino-kind">{t.kind}</span>
                <span className="domino-label">{t.label}</span>
                <span className="domino-sources">{t.sources.join(' · ') || 'no source row'}</span>
              </span>
            </li>
          ))}
          {verdict && (
            <li className="domino-step" style={{ '--i': tiles.length } as CSSProperties}>
              <span className="domino-link observed">
                <span className="domino-link-line" aria-hidden="true" />
                <span className="domino-link-text">tested</span>
              </span>
              <span className={`domino-tile domino-verdict tone-${verdict.tone}`}>
                <Icon name={verdict.icon} size={18} />
                <span className="domino-label">{verdict.label}</span>
              </span>
            </li>
          )}
        </ol>
      )}
    </TourSection>
  )
}
