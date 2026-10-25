import { Fragment, type CSSProperties } from 'react'
import type { Showcase } from '../../lib/showcase'
import { chainTiles } from '../../lib/showcase'
import { VERDICT } from '../../lib/labels'
import { href } from '../../lib/router'
import { useInView } from '../../hooks/useInView'
import { TourSection } from './Tour'

/** Identifiers wrap after _ . - / rather than mid-word. */
function breakable(text: string) {
  return text.split(/(?<=[_./-])/).map((part, i) => (
    <Fragment key={i}>
      {i > 0 && <wbr />}
      {part}
    </Fragment>
  ))
}

/**
 * The core idea: one change, a chain of components spread across separate
 * systems. Each column is a component from the real run; the domino above it
 * falls in turn when the chain scrolls into view.
 */
export function ChainStory({ show, placeholder }: { show: Showcase | null; placeholder: boolean }) {
  const [ref, inView] = useInView<HTMLOListElement>(0.3)
  const tiles = show ? chainTiles(show.inv) : []
  const sources = new Set(tiles.flatMap((t) => t.sources))
  const verdict = show?.inv.verdict ? VERDICT[show.inv.verdict.verdict] : null

  return (
    <TourSection
      id="idea"
      number="01"
      kicker="The idea"
      title="A change can be fine on its own"
      titleTail="and still break something two systems away."
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
        <>
          <p className="chain-source">
            From a live run: <a href={href.case(show!.caseEntry.id)}>{show!.caseEntry.label}</a>
          </p>
          <ol ref={ref} className={`chain-cols${inView ? ' in-view' : ''}`} aria-label={`Causal chain in the ${show!.caseEntry.label} case`}>
            {tiles.map((t, i) => (
              <li key={t.id} className="chain-col" style={{ '--i': i } as CSSProperties}>
                <span className="domino" aria-hidden="true" />
                <p className="chain-col-link">
                  {t.link ? (
                    <>
                      <span className="chain-col-relation">{t.link.relation.replace(/_/g, ' ')}</span>
                      <span className={`chain-col-status ${t.link.status}`}>
                        {t.link.status}
                        {t.link.fromGraph && ' · from the graph'}
                      </span>
                    </>
                  ) : (
                    <span className="chain-col-relation">the change</span>
                  )}
                </p>
                <p className="chain-col-kind">{t.kind}</p>
                <p className="chain-col-label">{breakable(t.label)}</p>
                <p className="chain-col-source">{t.sources.join(' · ') || 'no source row'}</p>
              </li>
            ))}
            {verdict && (
              <li className={`chain-col chain-col-verdict tone-${verdict.tone}`} style={{ '--i': tiles.length } as CSSProperties}>
                <span className="domino" aria-hidden="true" />
                <p className="chain-col-link">
                  <span className="chain-col-relation">tested</span>
                </p>
                <p className="chain-col-kind">verdict</p>
                <p className="chain-col-label">{verdict.label}</p>
                <p className="chain-col-source">decided by the judge</p>
              </li>
            )}
          </ol>
        </>
      )}
    </TourSection>
  )
}
