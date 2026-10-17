import { useState } from 'react'
import { supabase, errorMessage } from '../../lib/supabase'
import { useToast } from '../../context/ToastContext'
import { formatDate, formatDateTime, formatPhone } from '../../lib/format'
import { Alert, Button, Tracker } from '../../components/ui'
import Icon from '../../components/Icon'

const last4 = (phone) => String(phone || '').slice(-4)

function Result({ tone = 'info', icon, title, children }) {
  return (
    <>
      <div className={`result-icon result-icon--${tone}`}><Icon name={icon} size={24} /></div>
      <h2>{title}</h2>
      <div style={{ marginTop: '.6rem' }}>{children}</div>
    </>
  )
}

// Submitting (or re-submitting) an application: the database creates the request for administrators.
function useSubmitApplication(onDone) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => {
    if (busy) return
    setBusy(true); setError('')
    const { error: err } = await supabase.rpc('request_sms_verification')
    setBusy(false)
    if (err) setError(errorMessage(err)); else toast('Application submitted', 'We will notify you when the next step is ready.', 'success')
    onDone() // always reload: the server is the source of truth for the status
  }
  return { busy, error, submit }
}

/* ---------- Draft: review before submitting ---------- */
export function ReviewStage({ app, onEdit, onSubmitted }) {
  const { busy, error, submit } = useSubmitApplication(onSubmitted)
  const [confirmed, setConfirmed] = useState(false)
  const [missing, setMissing] = useState(false)
  const go = () => { if (!confirmed) { setMissing(true); document.getElementById('confirm-details')?.focus(); return } submit() }
  return (
    <div className="card card--highlight">
      <h2>Review your application</h2>
      <p className="card__lead">Check your details carefully. You cannot change them once you submit.</p>
      <Alert>{error}</Alert>
      <dl className="kv">
        <dt>Full name</dt><dd>{app.full_name}</dd>
        <dt>Date of birth</dt><dd>{formatDate(app.date_of_birth)}</dd>
        <dt>Phone number</dt><dd className="num">{formatPhone(app.phone_number)}</dd>
        <dt>Email address</dt><dd>{app.email}</dd>
        <dt>District</dt><dd>{app.district}, {app.country}</dd>
        <dt>Residential address</dt><dd>{app.address}</dd>
        {app.occupation && <><dt>Occupation</dt><dd>{app.occupation}</dd></>}
      </dl>
      <div className="field" style={{ marginTop: '1.5rem' }}>
        <label className="check" htmlFor="confirm-details">
          <input id="confirm-details" type="checkbox" checked={confirmed} aria-invalid={missing && !confirmed ? true : undefined}
            onChange={(e) => { setConfirmed(e.target.checked); setMissing(false) }} />
          <span>I confirm that the details above are correct.</span>
        </label>
        {missing && !confirmed && <div className="field-error" role="alert">Confirm that your details are correct before submitting.</div>}
      </div>
      <div className="btn-row">
        <Button onClick={go} busy={busy}>Submit application</Button>
        <Button tone="outline" onClick={onEdit} disabled={busy}>Edit details</Button>
      </div>
    </div>
  )
}

/* ---------- Pending Review ---------- */
export function PendingStage({ app }) {
  return (
    <div className="card card--highlight">
      <Tracker status={app.status} />
      <Result icon="check" title="Application submitted">
        <p>Your application is with our team for review. When the verification SMS has been sent to your registered phone number ending in <strong>{last4(app.phone_number)}</strong>, you will be notified here and asked to submit it.</p>
        <p className="muted small" style={{ margin: 0 }}>Submitted {formatDateTime(app.details_confirmed_at || app.request?.requested_at)}. This page updates automatically.</p>
      </Result>
    </div>
  )
}

/* ---------- Awaiting SMS Verification ---------- */
export function VerificationStage({ app, onSubmitted }) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState('')
  const request = app.request
  // If an administrator asked for a resubmission, show the reason they gave.
  const resubmit = [...app.events].reverse().find((e) => e.request_id === request.id && e.from_status === 'pending_admin_validation' && e.to_status === 'sms_sent')

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setError('')
    if (!text.trim()) { setFieldError('Paste the complete SMS message before submitting.'); document.getElementById('sms-text')?.focus(); return }
    setFieldError(''); setBusy(true)
    const { error: err } = await supabase.rpc('submit_sms_verification', { p_request_id: request.id, p_message: text })
    setBusy(false)
    if (err) setError(errorMessage(err)); else toast('Verification submitted', 'Your message has been sent for review.', 'success')
    onSubmitted()
  }

  return (
    <div className="card card--highlight">
      <Tracker status={app.status} />
      <h2>SMS Verification Required</h2>
      {resubmit?.note && <div style={{ marginTop: '1rem' }}><Alert tone="warn" title="Resubmission requested.">{resubmit.note}</Alert></div>}
      <p style={{ marginTop: '.75rem' }}>A verification message has been sent to your registered phone number ending in <strong>{last4(request.phone_number)}</strong>.</p>
      <p>Please open the SMS on your phone, copy the complete message, and paste it into the field below. Then submit it for verification.</p>
      <Alert>{error}</Alert>
      <form className="form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="sms-text">SMS message</label>
          <textarea id="sms-text" className="textarea" placeholder="Paste the complete SMS message here" value={text}
            onChange={(e) => { setText(e.target.value); setFieldError('') }}
            aria-invalid={fieldError ? true : undefined} aria-describedby={fieldError ? 'sms-text-err' : undefined} />
          {fieldError && <div className="field-error" id="sms-text-err" role="alert">{fieldError}</div>}
        </div>
        <div><Button type="submit" busy={busy}>Submit for Verification</Button></div>
      </form>
    </div>
  )
}

/* ---------- Verification Submitted ---------- */
export function SubmittedStage({ app }) {
  const submission = app.request?.submission
  return (
    <div className="card card--highlight">
      <Tracker status={app.status} />
      <Result icon="clock" title="Verification submitted">
        <p>Your message was submitted on {formatDateTime(submission?.submitted_at || app.request?.submitted_at)} and is being reviewed. You will be notified of the outcome, and your application status will update here.</p>
        {submission && (
          <div className="message-card">
            <div className="message-card__meta"><strong>Message you submitted</strong></div>
            <div className="bubble">{submission.submitted_message}</div>
          </div>
        )}
      </Result>
    </div>
  )
}

/* ---------- Approved ---------- */
export function ApprovedStage({ app }) {
  return (
    <div className="card card--ok">
      <Tracker status={app.status} />
      <Result tone="ok" icon="check" title="Application approved">
        <p style={{ margin: 0 }}>Your phone number is verified and your application was approved on {formatDateTime(app.approved_at)}.</p>
      </Result>
    </div>
  )
}

/* ---------- Rejected (or a legacy expired verification) ---------- */
export function RetryStage({ app, onEdit, onResubmitted }) {
  const { busy, error, submit } = useSubmitApplication(onResubmitted)
  const expired = app.status === 'expired'
  const reason = app.request?.decision?.reason
  return (
    <div className="card card--bad">
      <Tracker status={app.status} />
      <Result tone="bad" icon="alert" title={expired ? 'Verification expired' : 'Application rejected'}>
        {expired
          ? <p>Your verification was not completed in time.</p>
          : <p>Your application was not approved{app.request?.decision?.decided_at ? ` on ${formatDateTime(app.request.decision.decided_at)}` : ''}.</p>}
        {reason && <Alert tone="warn" title="Reason:">{reason}</Alert>}
        <p>You can update your details if needed and submit your application again.</p>
        <Alert>{error}</Alert>
        <div className="btn-row" style={{ marginTop: '.5rem' }}>
          <Button onClick={submit} busy={busy}>Submit application again</Button>
          <Button tone="outline" onClick={onEdit} disabled={busy}>Update details</Button>
        </div>
      </Result>
    </div>
  )
}
