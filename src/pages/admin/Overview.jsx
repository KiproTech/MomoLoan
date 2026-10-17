import { Link } from 'react-router-dom'
import { useAdminApplications } from '../../hooks/useAdminApplications'
import { countByStatus } from '../../lib/applications'
import { formatPhone, timeAgo } from '../../lib/format'
import { Alert, Button, EmptyState, PageHead, StatusBadge } from '../../components/ui'

const CARDS = [
  { label: 'Registered applicants', status: null, registered: true },
  { label: 'Total applications', status: null },
  { label: 'Pending Review', status: 'pending_admin_action', attention: true },
  { label: 'Awaiting SMS Verification', status: 'sms_sent' },
  { label: 'Verification Submitted', status: 'pending_admin_validation', attention: true },
  { label: 'Approved', status: 'approved' },
  { label: 'Rejected', status: 'rejected' },
]

const waitingSince = (a) => (a.status === 'pending_admin_validation' ? a.request?.submitted_at : a.request?.requested_at) || a.updated_at

export default function Overview() {
  const { loading, error, applications, registered, reload } = useAdminApplications()
  const counts = countByStatus(applications)
  const queue = applications
    .filter((a) => a.status === 'pending_admin_action' || a.status === 'pending_admin_validation')
    .sort((a, b) => new Date(waitingSince(a)) - new Date(waitingSince(b)))
    .slice(0, 8)

  return (
    <>
      <PageHead title="Overview">Applications that need an action are listed first.</PageHead>
      {error && <Alert>We could not load applications. <Button tone="ghost" size="sm" onClick={reload}>Try again</Button></Alert>}

      <section className="stats" aria-label="Application summary">
        {CARDS.map((c) => {
          const n = c.registered ? registered : c.status ? counts[c.status] || 0 : counts.total
          const to = c.registered ? '/admin/applications' : c.status ? `/admin/applications?status=${c.status}` : '/admin/applications'
          return (
            <Link key={c.label} to={to} className={`stat ${c.attention && n > 0 ? 'stat--attention' : ''}`}>
              {loading ? <span className="skeleton" style={{ display: 'block', height: 30, width: 48, marginBottom: 4 }} /> : <span className="stat__n">{n}</span>}
              <span className="stat__label">{c.label}</span>
            </Link>
          )
        })}
      </section>

      <section className="card card--flush" aria-labelledby="attention-title">
        <div className="card__head" style={{ padding: '1.1rem 1.25rem 0', marginBottom: '.5rem' }}>
          <h2 id="attention-title">Needs your attention</h2>
          <Link to="/admin/applications">View all applications</Link>
        </div>
        {loading ? <div className="skeleton" style={{ height: 120, margin: '1rem 1.25rem 1.25rem' }} />
          : queue.length === 0 ? <EmptyState icon="check" title="You are all caught up">No application is waiting for an action right now.</EmptyState>
          : (
            <ul className="attention-list">
              {queue.map((a) => (
                <li key={a.id}>
                  <Link className="attention-item" to={`/admin/applications/${a.id}`}>
                    <span className="attention-item__main"><strong>{a.full_name}</strong><span className="muted small num">{a.applicant_ref} &middot; {formatPhone(a.phone_number)}</span></span>
                    <StatusBadge status={a.status} />
                    <span className="muted small">{timeAgo(waitingSince(a))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </section>
    </>
  )
}
