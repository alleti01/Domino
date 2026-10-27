import { href } from '../lib/router'
import { Icon } from './Icon'

export function LoadingView() {
  return (
    <div className="page" role="status" aria-live="polite">
      <span className="visually-hidden">Loading investigations…</span>
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-row" />
      <div className="skeleton skeleton-row" />
      <div className="skeleton skeleton-row" />
    </div>
  )
}

export function EmptyView() {
  return (
    <div className="page state-view">
      <span className="state-icon">
        <Icon name="list" size={20} />
      </span>
      <h1>No investigations yet</h1>
      <p>
        Investigations appear here once the agent has saved its runs to the repository. The dashboard reads them directly, so
        no keys or database access are needed.
      </p>
    </div>
  )
}

export function ErrorView({ message }: { message: string }) {
  return (
    <div className="page state-view" role="alert">
      <span className="state-icon tone-fail">
        <Icon name="alert" size={20} />
      </span>
      <h1>Couldn't load the investigations</h1>
      <p>The saved runs could not be read, so nothing is shown rather than a partial picture.</p>
      <details className="side-details">
        <summary>Technical detail</summary>
        <code className="error-detail">{message}</code>
      </details>
      <button type="button" className="button" onClick={() => window.location.reload()}>
        Try again
      </button>
    </div>
  )
}

/** One run's file is broken; the rest of the site still works. */
export function RunErrorView({ runId, message }: { runId: string; message: string }) {
  return (
    <div className="state-inline" role="alert">
      <h2>
        <Icon name="alert" size={18} />
        This run couldn't be read
      </h2>
      <p className="muted">
        Run <code>{runId}</code> is listed, but its saved trace has a problem. Other runs and cases still work.
      </p>
      <code className="error-detail">{message}</code>
    </div>
  )
}

export function NotFoundView({ what }: { what: string }) {
  return (
    <div className="page state-view">
      <h1>{what} not found</h1>
      <p>
        The link may be out of date. <a href={href.cases}>Go to the investigations</a>.
      </p>
    </div>
  )
}
