import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errorMessage } from '../../lib/supabase'
import { formatDateTime } from '../../lib/format'
import { Alert, Button, EmptyState, PageHead } from '../../components/ui'
import Pager from '../../components/Pager'

const ACTION_LABEL = {
  verification_requested: 'Application submitted',
  sms_marked_sent: 'SMS marked as sent',
  sms_submitted: 'Verification submitted',
  resubmission_requested: 'Resubmission requested',
  verification_approved: 'Application approved',
  verification_rejected: 'Application rejected',
  verification_expired: 'Verification expired',
  admin_role_granted: 'Administrator role granted',
  sms_simulated_sent: 'SMS marked as sent (earlier version)',
}
const ACTOR = { applicant: 'Applicant', admin: 'Administrator', system: 'System' }
const PAGE = 15

export default function Activity() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from('audit_logs').select('*, applicants(full_name, applicant_ref)')
      .order('created_at', { ascending: false }).limit(300)
    if (err) setError(errorMessage(err)); else { setError(''); setRows(data) }
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <>
      <PageHead title="Activity log" actions={<Button tone="outline" size="sm" onClick={load}>Refresh</Button>}>A record of every action taken on applications.</PageHead>
      <Alert>{error}</Alert>
      <div className="card card--flush">
        {rows === null ? <div className="skeleton" style={{ height: 240, margin: '1rem' }} />
          : rows.length === 0 ? <EmptyState icon="clock" title="No activity yet">Actions on applications will be recorded here.</EmptyState>
          : (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th scope="col">Time</th><th scope="col">Action</th><th scope="col">Applicant</th><th scope="col">By</th><th scope="col">Details</th></tr></thead>
                  <tbody>
                    {rows.slice((page - 1) * PAGE, page * PAGE).map((l) => (
                      <tr key={l.id}>
                        <td className="cell-title">{formatDateTime(l.created_at)}</td>
                        <td data-label="Action">{ACTION_LABEL[l.action] || l.action}</td>
                        <td data-label="Applicant">{l.applicants ? <Link className="cell-main" to={`/admin/applications/${l.applicant_id}`}>{l.applicants.full_name}</Link> : '-'}</td>
                        <td data-label="By">{ACTOR[l.actor_role] || l.actor_role}</td>
                        <td data-label="Details" className="small">{l.details?.reason || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager page={page} total={rows.length} pageSize={PAGE} onPage={setPage} />
            </>
          )}
      </div>
    </>
  )
}
