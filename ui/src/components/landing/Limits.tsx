import { VERDICT_MEANING } from '../../content'
import { VERDICT } from '../../lib/labels'
import { TourSection } from './Tour'

const NOTES = [
  'A passing test is not a promise the change is fine in production. Domino says exactly what it tested.',
  'Every case is a small synthetic world that recreates a failure mechanism seen in real public incidents. We do not claim Domino would have stopped those incidents.',
  'The AI explains and proposes. Only a rule-based judge, reading the experiment results, decides the verdict, and a second model checks the explanation against the evidence.',
]

/** The three verdicts, defined, and the limits stated up front as footnotes. */
export function Limits() {
  return (
    <TourSection
      id="limits"
      number="06"
      kicker="Honest by design"
      title="What Domino will"
      titleTail="and won't tell you."
      lede="Every investigation ends in exactly one of three verdicts."
    >
      <dl className="verdict-defs">
        {VERDICT_MEANING.map(([key, meaning]) => {
          const v = VERDICT[key]
          return (
            <div key={key} className={`verdict-def tone-${v.tone}`}>
              <dt>
                <span className="verdict-def-mark" aria-hidden="true" />
                {v.label}
              </dt>
              <dd>{meaning}</dd>
            </div>
          )
        })}
      </dl>
      <ol className="footnotes">
        {NOTES.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ol>
    </TourSection>
  )
}
