import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAdminApplications } from '../../hooks/useAdminApplications'
import { searchText } from '../../lib/applications'
import { formatDateTime, formatPhone } from '../../lib/format'
import { ADMIN_FILTERS, STATUS_LABEL } from '../../lib/status'
import { Alert, Button, EmptyState, PageHead, StatusBadge } from '../../components/ui'
import Icon from '../../components/Icon'
import Pager, { PAGE_SIZE } from '../../components/Pager'

// Search, status filter, sort and page are kept in the URL so the view survives refresh and can be shared.
export default function Applications() {
  const { loading, error, applications, reload } = useAdminApplications()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const q = params.get('q') || ''
  const status = params.get('status') || ''
  const sort = params.get('sort') === 'oldest' ? 'oldest' : 'newest'
  const page = Math.max(1, Number(params.get('page')) || 1)

  const update = (changes) => {
    const next = new URLSearchParams(params)
    Object.entries({ page: '', ...changes }).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setParams(next, { replace: true })
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    const list = applications.filter((a) => (!status || a.status === status) && (!term || searchText(a).includes(term)))
    const when = (a) => new Date(a.request?.requested_at || a.created_at).getTime()
    return list.sort((a, b) => (sort === 'oldest' ? when(a) - when(b) : when(b) - when(a)))
  }, [applications, q, status, sort])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const filtering = q || status

  return (
    <>
      <PageHead title="Applications">Search and filter every submitted application.</PageHead>
      {error && <Alert>We could not load applications. <Button tone="ghost" size="sm" onClick={reload}>Try again</Button></Alert>}
      <div className="card card--flush">
        <div className="toolbar">
          <div className="search">
            <label className="sr-only" htmlFor="search">Search applications</label>
            <Icon name="search" />
            <input id="search" className="input" type="search" placeholder="Search by name, reference, phone or email" value={q} onChange={(e) => update({ q: e.target.value })} />
          </div>
          <label className="sr-only" htmlFor="status">Filter by status</label>
          <select id="status" className="select" value={status} onChange={(e) => update({ status: e.target.value })}>
            <option value="">All statuses</option>
            {ADMIN_FILTERS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <label className="sr-only" htmlFor="sort">Sort order</label>
          <select id="sort" className="select" value={sort} onChange={(e) => update({ sort: e.target.value === 'oldest' ? 'oldest' : '' })}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>

        {loading ? <div className="skeleton" style={{ height: 240, margin: '1rem' }} />
          : filtered.length === 0 ? (
            filtering
              ? <EmptyState icon="search" title="No applications match" action={<Button tone="outline" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>}>Try a different search or status.</EmptyState>
              : <EmptyState title="No applications yet">Applications appear here as soon as applicants submit them.</EmptyState>
          ) : (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th scope="col">Applicant</th><th scope="col">Phone</th><th scope="col">Status</th><th scope="col">Submitted</th><th scope="col">Last updated</th></tr></thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.id} className="is-link" onClick={() => navigate(`/admin/applications/${a.id}`)}>
                        <td className="cell-title"><Link className="cell-main" to={`/admin/applications/${a.id}`} onClick={(e) => e.stopPropagation()}>{a.full_name}</Link><span className="cell-sub num">{a.applicant_ref}</span></td>
                        <td data-label="Phone" className="num">{formatPhone(a.phone_number)}</td>
                        <td data-label="Status"><StatusBadge status={a.status} /></td>
                        <td data-label="Submitted">{formatDateTime(a.request?.requested_at)}</td>
                        <td data-label="Last updated">{formatDateTime(a.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager page={current} total={filtered.length} onPage={(p) => update({ page: p > 1 ? String(p) : '' })} />
            </>
          )}
      </div>
    </>
  )
}
