import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useApplicantData } from '../../hooks/useApplicantData'
import { formatDateTime } from '../../lib/format'
import { Alert, Button, EmptyState, PageHead, PageSkeleton, StatusBadge, Timeline } from '../../components/ui'

// Every submission of the applicant's application ("attempt") with its status, dates and outcome.
export default function History() {
  const { user } = useAuth()
  const d = useApplicantData(user.id)
  if (d.loading) return <PageSkeleton />
  if (d.error) {
    return (
      <main className="container container--narrow">
        <Alert>We could not load your history. Check your connection and try again.</Alert>
        <Button tone="outline" onClick={d.reload}>Try again</Button>
      </main>
    )
  }
  const app = d.application
  const attempts = app?.requests || []

  return (
    <main className="container container--narrow fade-in">
      <PageHead title="Application history">Every time you submitted your application, newest first.</PageHead>
      {attempts.length === 0 ? (
        <div className="card">
          <EmptyState icon="history" title="Nothing submitted yet" action={<Link className="btn btn--primary" to="/application">{app ? 'Review application' : 'Add my details'}</Link>}>
            Your submissions and their outcomes will appear here.
          </EmptyState>
        </div>
      ) : attempts.map((r) => (
        <section className="card" key={r.id} aria-labelledby={`attempt-${r.id}`}>
          <div className="card__head">
            <h2 id={`attempt-${r.id}`}>Attempt {r.attempt_no}</h2>
            <StatusBadge status={r.status} />
          </div>
          <dl className="kv">
            <dt>Submitted</dt><dd>{formatDateTime(r.requested_at)}</dd>
            <dt>SMS sent</dt><dd>{r.sms_sent_at ? formatDateTime(r.sms_sent_at) : 'Not yet'}</dd>
            <dt>Verification submitted</dt><dd>{r.submitted_at ? formatDateTime(r.submitted_at) : 'Not yet'}</dd>
            <dt>Decision</dt><dd>{r.decision ? `${r.decision.decision === 'approved' ? 'Approved' : 'Rejected'} on ${formatDateTime(r.decision.decided_at)}` : 'Pending'}</dd>
            {r.decision?.reason && <><dt>Reason</dt><dd>{r.decision.reason}</dd></>}
          </dl>
          <details className="more">
            <summary>Activity for this attempt</summary>
            <Timeline events={app.events.filter((e) => e.request_id === r.id)} audience="applicant" />
          </details>
        </section>
      ))}
    </main>
  )
}
