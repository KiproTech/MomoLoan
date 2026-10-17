import { STATUS_LABEL, STATUS_TONE, STEPS, eventLabel, stepsDone } from '../lib/status'
import { formatDateTime } from '../lib/format'
import Icon from './Icon'

export const Spinner = () => <span className="spinner" aria-hidden="true" />

export const Loading = ({ text = 'Loading...' }) => (
  <div className="loading" role="status"><Spinner /> <span>{text}</span></div>
)

const ALERT_ICON = { error: 'alert', warn: 'alert', info: 'info', success: 'check' }
export const Alert = ({ tone = 'error', title, children }) =>
  (children || title) ? (
    <div className={`alert alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={ALERT_ICON[tone]} />
      <div>{title && <strong>{title}{children ? ' ' : ''}</strong>}{children}</div>
    </div>
  ) : null

export const StatusBadge = ({ status }) => (
  <span className={`badge badge--${STATUS_TONE[status] || 'neutral'}`}>{STATUS_LABEL[status] || status}</span>
)

export function Field({ id, label, error, hint, required, optional, children }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}{optional && <span className="opt"> (optional)</span>}{required && <span className="sr-only"> (required)</span>}</label>
      {children}
      {hint && !error && <div className="hint" id={`${id}-hint`}>{hint}</div>}
      {error && <div className="field-error" id={`${id}-err`} role="alert">{error}</div>}
    </div>
  )
}

// Props: tone = primary | dark | outline | ghost | danger | danger-solid, busy shows a spinner and blocks clicks.
export function Button({ busy, children, tone = 'primary', block, size, className = '', disabled, type = 'button', ...rest }) {
  const cls = ['btn', `btn--${tone}`, block && 'btn--block', size === 'sm' && 'btn--sm', className].filter(Boolean).join(' ')
  return <button type={type} className={cls} disabled={busy || disabled} aria-busy={busy || undefined} {...rest}>{busy && <Spinner />}{children}</button>
}

export function Tracker({ status }) {
  const done = stepsDone(status)
  return (
    <ol className="tracker" aria-label="Application progress">
      {STEPS.map((s, i) => {
        const rejected = i === 3 && status === 'rejected'
        const cls = i < done ? (rejected ? 'fail' : 'done') : i === done ? 'current' : ''
        return <li key={s.key} className={cls} aria-current={i === done ? 'step' : undefined}>{rejected ? 'Rejected' : s.label}</li>
      })}
    </ol>
  )
}

// Activity timeline. audience="applicant" uses second-person wording; audience="admin" also shows who acted.
export function Timeline({ events, audience = 'applicant' }) {
  if (!events?.length) return <p className="muted small" style={{ margin: 0 }}>No activity yet.</p>
  const actor = { applicant: 'Applicant', admin: 'Administrator', system: 'System' }
  return (
    <ol className="timeline">
      {[...events].reverse().map((e) => {
        const tone = e.to_status === 'rejected' ? 'is-bad' : e.to_status === 'approved' ? 'is-ok' : ''
        // Only show notes that carry a reason (rejection or resubmission); the others just repeat the title.
        const showNote = e.note && (e.to_status === 'rejected' || (e.to_status === 'sms_sent' && e.from_status === 'pending_admin_validation'))
        return (
          <li key={e.id} className={tone}>
            <div className="timeline__title">{eventLabel(e, audience)}</div>
            <div className="timeline__when">{audience === 'admin' && `${actor[e.actor_role] || e.actor_role} \u00b7 `}{formatDateTime(e.created_at)}</div>
            {showNote && <div className="timeline__note">{e.note}</div>}
          </li>
        )
      })}
    </ol>
  )
}

export function EmptyState({ icon = 'inbox', title, children, action }) {
  return (
    <div className="empty">
      <div className="empty__icon"><Icon name={icon} size={22} /></div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div className="btn-row" style={{ justifyContent: 'center' }}>{action}</div>}
    </div>
  )
}

export function PageHead({ title, children, actions }) {
  return (
    <div className="page-head">
      <div className="row row--between">
        <div><h1>{title}</h1>{children && <p>{children}</p>}</div>
        {actions}
      </div>
    </div>
  )
}

// Placeholder shown while a whole page loads (instead of a lone spinner).
export function PageSkeleton() {
  return (
    <main className="container" aria-busy="true" aria-label="Loading">
      <div className="skeleton" style={{ height: 34, width: 240, marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 18, width: 160, marginBottom: 28 }} />
      <div className="skeleton" style={{ height: 180, marginBottom: 16 }} />
      <div className="skeleton" style={{ height: 120 }} />
    </main>
  )
}
