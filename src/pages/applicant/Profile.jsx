import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useApplicantData } from '../../hooks/useApplicantData'
import { formatDate, formatPhone } from '../../lib/format'
import { Alert, Button, PageHead, PageSkeleton } from '../../components/ui'
import ChangePassword from '../../components/ChangePassword'

export default function Profile() {
  const { user, signOut } = useAuth()
  const d = useApplicantData(user.id)
  if (d.loading) return <PageSkeleton />
  const app = d.application
  // Details can be edited only before submission and after a rejection (the database enforces this too).
  const editable = !app || ['pending_registration', 'rejected', 'expired'].includes(app.status)

  return (
    <main className="container container--narrow fade-in">
      <PageHead title="Profile">Your account and the details on your application.</PageHead>
      {d.error && <Alert>We could not load your details. Try refreshing the page.</Alert>}

      <section className="card" aria-labelledby="details-title">
        <div className="card__head">
          <h2 id="details-title">Personal details</h2>
          {editable
            ? <Link className="btn btn--outline btn--sm" to="/application" state={{ edit: true }}>Edit details</Link>
            : <span className="muted small">Locked while your application is under review</span>}
        </div>
        {app ? (
          <dl className="kv">
            <dt>Full name</dt><dd>{app.full_name}</dd>
            <dt>Date of birth</dt><dd>{formatDate(app.date_of_birth)}</dd>
            <dt>Phone number</dt><dd className="num">{formatPhone(app.phone_number)}</dd>
            <dt>Email address</dt><dd>{app.email || user.email}</dd>
            <dt>District</dt><dd>{app.district}, {app.country}</dd>
            <dt>Address</dt><dd>{app.address}</dd>
            {app.occupation && <><dt>Occupation</dt><dd>{app.occupation}</dd></>}
            <dt>Reference</dt><dd className="num">{app.applicant_ref}</dd>
          </dl>
        ) : <p className="muted" style={{ margin: 0 }}>You have not added your details yet. <Link to="/application">Add my details</Link></p>}
      </section>

      <section className="card" aria-labelledby="password-title">
        <h2 id="password-title" style={{ marginBottom: '1rem' }}>Change password</h2>
        <ChangePassword />
      </section>

      <section className="card" aria-labelledby="signout-title">
        <div className="row row--between">
          <div><h2 id="signout-title">Sign out</h2><p className="muted" style={{ margin: '.25rem 0 0' }}>Signed in as {user.email}. This ends the session on this browser only.</p></div>
          <Button tone="outline" onClick={signOut}>Sign out</Button>
        </div>
      </section>
    </main>
  )
}
