export function formatDateTime(value) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-UG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
export function formatDate(value) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-UG', { dateStyle: 'medium' }).format(new Date(value))
}
// +256772123456 -> +256 772 123 456
export function formatPhone(p) {
  const m = /^\+256(\d{3})(\d{3})(\d{3})$/.exec(p || '')
  return m ? `+256 ${m[1]} ${m[2]} ${m[3]}` : p || '-'
}
export function timeAgo(value) {
  const s = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return formatDate(value)
}
export const firstName = (full) => String(full || '').trim().split(/\s+/)[0] || ''
