import { Link, useOutletContext } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useApplicantData } from '../../hooks/useApplicantData'
import { firstName, formatDateTime, formatPhone, timeAgo } from '../../lib/format'
import { STATUS_LABEL, nextStep } from '../../lib/status'
import { Alert, Button, EmptyState, PageHead, PageSkeleton, StatusBadge, Tracker } from '../../components/ui'

export default function Dashboard() {
  const { user, profile } = useAuth()
  const { notes } = useOutletContext()
  const d = useApplicantData(user.id)

  if (d.loading) return <PageSkeleton />
  if (d.error) {
    return (
      <main className="container container--narrow">
        <Alert>We could not load your dashboard. Check your connection and try again.</Alert>
        <Button tone="outline" onClick={d.reload}>Try again</Button>
      </main>
    )
  }

  const app = d.application
  const step = nextStep(app?.status)
  const name = firstName(app?.full_name || profile?.full_name)
  const recent = notes.items.slice(0, 4)

  return (
    <main className="container fade-in">
      <PageHead title={name ? `Welcome, ${name}` : 'Welcome'} actions={app && <StatusBadge status={app.status} />}>
        {app ? `Reference ${app.applicant_ref}` : 'Your application has not been started yet.'}
      </PageHead>

      <section className={`card ${step.tone === 'warn' ? 'card--highlight' : step.tone === 'success' ? 'card--ok' : step.tone === 'error' ? 'card--bad' : ''}`} aria-labelledby="next-title">
        {app && app.status !== 'pending_registration' && <Tracker status={app.status} />}
        <div className="row row--between" style={{ alignItems: 'flex-start' }}>
          <div className="grow" style={{ minWidth: 220 }}>
            <h2 id="next-title">{step.title}</h2>
            <p style={{ margin: '.4rem 0 0' }}>{step.text}</p>
          </div>
          <Link className={`btn ${step.tone === 'warn' ? 'btn--primary' : 'btn--dark'}`} to="/application">{step.cta}</Link>
        </div>
      </section>

      <div className="layout-2" style={{ marginTop: '1.25rem' }}>
        <section className="card" aria-labelledby="summary-title">
          <div className="card__head"><h2 id="summary-title">Application summary</h2><Link to="/history">View history</Link></div>
          {app ? (
            <dl className="kv">
              <dt>Status</dt><dd>{STATUS_LABEL[app.status]}</dd>
              <dt>Registered phone</dt><dd className="num">{formatPhone(app.phone_number)}</dd>
              <dt>Attempts</dt><dd>{app.attempts || 'Not submitted yet'}</dd>
              <dt>Last update</dt><dd>{formatDateTime(app.updated_at)}</dd>
            </dl>
          ) : <EmptyState icon="inbox" title="No application yet" action={<Link className="btn btn--primary" to="/application">Add my details</Link>}>Add your details to start an application.</EmptyState>}
        </section>

        <section className="card" aria-labelledby="notes-title">
          <div className="card__head"><h2 id="notes-title">Recent notifications</h2></div>
          {recent.length === 0 ? <EmptyState icon="bell" title="No notifications">You will see updates about your application here.</EmptyState> : (
            <ul className="notes">
              {recent.map((n) => (
                <li key={n.id} className={n.read_at ? '' : 'is-unread'}>
                  <strong>{n.title}</strong>
                  <span>{n.body}</span>
                  <time className="muted small">{timeAgo(n.created_at)}</time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
