// Helpers that turn the nested rows returned by Supabase into one flat application object.

const one = (x) => (Array.isArray(x) ? x[0] : x) || null

// Select string for administrator queries. Row Level Security limits it to administrators.
export const ADMIN_APPLICATION_SELECT =
  '*, sms_verification_requests(*, sms_submissions(*), verification_decisions(*), request_events(*))'

export function shapeRequest(r) {
  const submissions = [...(r.sms_submissions || [])].sort((a, b) => b.submission_no - a.submission_no)
  return { ...r, submissions, submission: submissions[0] || null, decision: one(r.verification_decisions) }
}

// applicants row (+ nested requests) -> { ...applicant, request, attempts, events }
// `request` is the latest verification attempt with its submissions (newest first) and decision.
export function shapeApplication(row) {
  const requests = [...(row.sms_verification_requests || [])].sort((a, b) => b.attempt_no - a.attempt_no)
  const latest = requests[0] || null
  const applicant = { ...row }
  delete applicant.sms_verification_requests
  return {
    ...applicant,
    request: latest && shapeRequest(latest),
    requests: requests.map(shapeRequest), // every attempt, newest first (used by the applicant history page)
    attempts: requests.length,
    events: requests.flatMap((r) => r.request_events || []).sort((a, b) => a.id - b.id),
  }
}

// An application is "submitted" once it has at least one verification request.
export const isSubmitted = (app) => app.attempts > 0

export function searchText(app) {
  return [app.full_name, app.applicant_ref, app.phone_number, app.email].join(' ').toLowerCase()
}

export function countByStatus(apps) {
  const c = { total: apps.length }
  apps.forEach((a) => { c[a.status] = (c[a.status] || 0) + 1 })
  return c
}
