import { VERDICT_MEANING } from '../../content'
import { VERDICT } from '../../lib/labels'
import { Icon } from '../Icon'
import { TourSection } from './Tour'

const NOTES = [
  'A passing test is not a promise the change is fine in production. Domino says exactly what it tested.',
  'The Cloudflare and CrowdStrike cases recreate the mechanism of real public incidents in isolated simulations. We do not claim Domino would have stopped them.',
  'The AI explains and proposes. Only a rule-based judge, reading the experiment results, decides the verdict.',
]

/** What the verdicts mean, and the limits Domino states up front. */
export function Limits() {
  return (
    <TourSection
      id="limits"
      kicker="Honest by design"
      title="What Domino will and won't tell you."
      lede="Every investigation ends in exactly one of three verdicts."
    >
      <ul className="limits-verdicts">
        {VERDICT_MEANING.map(([key, meaning]) => {
          const v = VERDICT[key]
          return (
            <li key={key} className={`limits-card tone-${v.tone}`}>
              <span className={`limits-label tone-text-${v.tone}`}>
                <Icon name={v.icon} size={16} /> {v.label}
              </span>
              <span>{meaning}</span>
            </li>
          )
        })}
      </ul>
      <ul className="limits-notes">
        {NOTES.map((n) => (
          <li key={n}>
            <Icon name="info" size={16} />
            <span>{n}</span>
          </li>
        ))}
      </ul>
    </TourSection>
  )
}
