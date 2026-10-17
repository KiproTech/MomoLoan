import { Button } from './ui'

export const PAGE_SIZE = 10

// "Showing 1-10 of 42" with Previous / Next. `page` is 1-based.
export default function Pager({ page, total, pageSize = PAGE_SIZE, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <nav className="pager" aria-label="Pagination">
      <span>Showing {from}&ndash;{to} of {total}</span>
      <div className="btn-group">
        <Button tone="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <Button tone="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </nav>
  )
}
