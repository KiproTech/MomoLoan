import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useApplicantData } from '../../hooks/useApplicantData'
import { formatDate, formatPhone } from '../../lib/format'
import { Alert, Button, PageHead, PageSkeleton, StatusBadge, Timeline } from '../../components/ui'
import DetailsForm from './DetailsForm'
import { ApprovedStage, PendingStage, RetryStage, ReviewStage, SubmittedStage, VerificationStage } from './stages'

// ONE page drives the whole applicant journey. The screen shown is decided by the status the SERVER returns,
// and the database refuses any action that does not fit that status, so a stage cannot be skipped by editing
// the URL or React state.
export default function Application() {
  const { user } = useAuth()
  const d = useApplicantData(user.id)
  const location = useLocation()
  const [editing, setEditing] = useState(!!location.state?.edit) // arrives true from the profile page's "Edit details"

  if (d.loading) return <PageSkeleton />
  if (d.error) {
    return (
      <main className="container container--narrow">
        <Alert>We could not load your application. Check your connection and try again.</Alert>
        <Button tone="outline" onClick={d.reload}>Try again</Button>
      </main>
    )
  }

  const app = d.application
  const done = () => { setEditing(false); d.reload() }

  if (!app || editing) {
    return <DetailsForm applicant={app} onSaved={done} onCancel={app ? () => setEditing(false) : undefined} />
  }

  const stage = (() => {
    switch (app.status) {
      case 'pending_registration': return <ReviewStage app={app} onEdit={() => setEditing(true)} onSubmitted={d.reload} />
      case 'pending_admin_action': return <PendingStage app={app} />
      case 'sms_sent': return <VerificationStage app={app} onSubmitted={d.reload} />
      case 'pending_admin_validation': return <SubmittedStage app={app} />
      case 'approved': return <ApprovedStage app={app} />
      case 'rejected':
      case 'expired': return <RetryStage app={app} onEdit={() => setEditing(true)} onResubmitted={d.reload} />
      default: return <Alert>This application has an unknown status. Contact support.</Alert>
    }
  })()

  return (
    <main className="container fade-in">
      <PageHead title="My application" actions={<StatusBadge status={app.status} />}>Reference {app.applicant_ref}</PageHead>
      <div className="layout-2">
        <div>{stage}</div>
        <div>
          <section className="card" aria-labelledby="summary-title">
            <h2 id="summary-title" style={{ marginBottom: '.5rem' }}>Application summary</h2>
            <dl className="kv kv--compact">
              <dt>Applicant</dt><dd>{app.full_name}</dd>
              <dt>Registered phone</dt><dd className="num">{formatPhone(app.phone_number)}</dd>
              <dt>Location</dt><dd>{app.district}, {app.country}</dd>
              <dt>Account created</dt><dd>{formatDate(app.created_at)}</dd>
            </dl>
          </section>
          {app.events.length > 0 && (
            <section className="card" aria-labelledby="activity-title">
              <h2 id="activity-title" style={{ marginBottom: '1rem' }}>Activity</h2>
              <Timeline events={app.events} audience="applicant" />
            </section>
          )}
        </div>
      </div>
    </main>
  )
}
