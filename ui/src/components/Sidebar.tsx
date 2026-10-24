import type { CaseEntry } from '../types'
import { PREVIEW_STATES, type PreviewState } from '../data/useSite'
import { VERDICT } from '../lib/labels'
import { href, type Route } from '../lib/router'
import { Icon } from './Icon'

export function Sidebar({
  cases,
  route,
  preview,
  onPreview,
}: {
  cases: CaseEntry[]
  route: Route
  preview: PreviewState
  onPreview: (p: PreviewState) => void
}) {
  const activeCase = route.name === 'case' ? route.caseId : null
  return (
    <aside className="sidebar">
      <a className="brand" href={href.home} aria-label="Domino home page">
        <span className="brand-mark" aria-hidden="true">
          <span />
          <span />
        </span>
        Domino
      </a>
      <p className="brand-tag">Pre-deployment failure investigation</p>

      <nav aria-label="Dashboard">
        <ul className="nav-list">
          <li>
            <a href={href.cases} aria-current={route.name === 'cases-index' ? 'page' : undefined}>
              <span className="nav-case">
                <Icon name="list" size={14} /> Overview
              </span>
            </a>
          </li>
        </ul>
        <h2 className="nav-heading">Cases</h2>
        {cases.length === 0 ? (
          <p className="small muted">No cases loaded.</p>
        ) : (
          <ul className="nav-list">
            {cases.map((c) => {
              const latest = c.runs[0]
              const v = latest?.verdict ? VERDICT[latest.verdict] : null
              const running = latest?.status === 'running'
              return (
                <li key={c.id}>
                  <a
                    href={href.case(c.id, { view: route.name === 'case' ? route.view : 'investigation' })}
                    aria-current={activeCase === c.id ? 'page' : undefined}
                  >
                    <span className="nav-case">{c.label}</span>
                    <span className={`nav-verdict tone-text-${v ? v.tone : 'muted'}`}>
                      <Icon name={v ? v.icon : 'clock'} size={13} />
                      {v ? v.label : running ? 'Running' : 'No runs yet'}
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        )}

        <h2 className="nav-heading">Evidence</h2>
        <ul className="nav-list">
          <li>
            <a href={href.results} aria-current={route.name === 'results' ? 'page' : undefined}>
              <span className="nav-case">
                <Icon name="bar-chart" size={14} /> Results
              </span>
            </a>
          </li>
          <li>
            <a href={href.underTheHood} aria-current={route.name === 'under-the-hood' ? 'page' : undefined}>
              <span className="nav-case">
                <Icon name="cpu" size={14} /> Under the hood
              </span>
            </a>
          </li>
        </ul>
      </nav>

      <a className="sidebar-back small" href={href.home}>
        ← Back to the Domino home page
      </a>

      {import.meta.env.DEV && (
        <div className="preview-control">
          <label htmlFor="preview-state">Preview UI state</label>
          <select id="preview-state" value={preview} onChange={(e) => onPreview(e.target.value as PreviewState)}>
            {PREVIEW_STATES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <p className="small muted">Dev builds only.</p>
        </div>
      )}
    </aside>
  )
}
