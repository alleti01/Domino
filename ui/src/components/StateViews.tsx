import { href } from '../lib/router'
import { Icon } from './Icon'

export function LoadingView() {
  return (
    <div className="page" role="status" aria-live="polite">
      <span className="visually-hidden">Loading investigations…</span>
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-banner" />
      <div className="skeleton skeleton-block" />
      <div className="skeleton skeleton-block" />
    </div>
  )
}

export function EmptyView() {
  return (
    <div className="page state-view">
      <Icon name="list" size={32} />
      <h1>No investigations yet</h1>
      <p className="muted">
        Saved runs appear here once the agent has written them to <code>samples/</code>. The dashboard reads them
        straight from the repository, so no keys or database access are needed.
      </p>
    </div>
  )
}

export function ErrorView({ message }: { message: string }) {
  return (
    <div className="page state-view" role="alert">
      <span className="tone-text-fail">
        <Icon name="alert" size={32} />
      </span>
      <h1>Couldn't load investigations</h1>
      <p>
        <code className="error-detail">{message}</code>
      </p>
      <button type="button" className="button" onClick={() => window.location.reload()}>
        Try again
      </button>
    </div>
  )
}

/** One run's file is broken; the rest of the site still works. */
export function RunErrorView({ runId, message }: { runId: string; message: string }) {
  return (
    <div className="section state-inline" role="alert">
      <h2>
        <span className="tone-text-fail">
          <Icon name="alert" size={18} />
        </span>
        This run couldn't be read
      </h2>
      <p className="muted">
        Run <code>{runId}</code> is listed in the manifest, but its trace file has a problem:
      </p>
      <code className="error-detail">{message}</code>
    </div>
  )
}

export function NotFoundView({ what }: { what: string }) {
  return (
    <div className="page state-view">
      <h1>{what} not found</h1>
      <p className="muted">
        The link may be out of date. <a href={href.cases}>Go to the overview</a>.
      </p>
    </div>
  )
}
