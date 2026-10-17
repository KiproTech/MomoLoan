import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAdminApplication } from '../../hooks/useAdminApplications'
import { supabase, errorMessage } from '../../lib/supabase'
import { useToast } from '../../context/ToastContext'
import { formatDate, formatDateTime, formatPhone } from '../../lib/format'
import { Alert, Button, EmptyState, Loading, StatusBadge, Timeline, Tracker } from '../../components/ui'
import ConfirmDialog from '../../components/ConfirmDialog'
import Icon from '../../components/Icon'

const MIN_REASON = 5

export default function ApplicationDetail() {
  const { id } = useParams()
  const { loading, error, application: app, reload } = useAdminApplication(id)
  const toast = useToast()
  const [dialog, setDialog] = useState(null) // 'mark' | 'approve' | 'resubmit' | 'reject'
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  if (loading) return <Loading text="Loading application..." />
  if (error) return <><BackLink /><Alert>We could not load this application. <Button tone="ghost" size="sm" onClick={reload}>Try again</Button></Alert></>
  if (!app) return <><BackLink /><div className="card"><EmptyState title="Application not found">It may have been removed, or you may not have access to it.</EmptyState></div></>

  const req = app.request
  const open = (name) => { setActionError(''); setReason(''); setDialog(name) }
  const close = () => { if (!busy) setDialog(null) }

  // One guarded path for every administrator action. `busy` blocks a second click while a call is running,
  // and the database refuses a repeat anyway because the status has already moved on.
  const run = async (fn, args, successTitle, successBody) => {
    if (busy) return
    setBusy(true); setActionError('')
    const { error: err } = await supabase.rpc(fn, args)
    setBusy(false)
    await reload() // always refresh: another administrator may have acted first
    if (err) { setActionError(errorMessage(err)); return }
    setDialog(null)
    toast(successTitle, successBody, 'success')
  }

  const reasonOk = reason.trim().length >= MIN_REASON
  const reasonField = (label, placeholder) => (
    <div className="field" style={{ marginTop: '.75rem' }}>
      <label htmlFor="reason">{label}</label>
      <textarea id="reason" className="textarea" style={{ minHeight: 96 }} value={reason} placeholder={placeholder} onChange={(e) => setReason(e.target.value)} />
      <div className="hint">The applicant will see this reason. At least {MIN_REASON} characters.</div>
    </div>
  )

  return (
    <>
      <BackLink />
      <div className="page-head">
        <div className="row row--between">
          <div>
            <h1>{app.full_name}</h1>
            <p className="num">{app.applicant_ref} &middot; {formatPhone(app.phone_number)}{req?.attempt_no > 1 ? ` \u00b7 Attempt ${req.attempt_no}` : ''}</p>
          </div>
          <StatusBadge status={app.status} />
        </div>
      </div>

      <div className="layout-2">
        <div>
          <div className="card card--highlight">
            <Tracker status={app.status} />
            <NextAction app={app} onMark={() => open('mark')} onApprove={() => open('approve')} onResubmit={() => open('resubmit')} onReject={() => open('reject')} />
          </div>

          {req?.submissions.length > 0 && (
            <section className="card" aria-labelledby="msg-title">
              <div className="card__head"><h2 id="msg-title">Submitted message</h2>
                <span className="muted small">Submission {req.submission.submission_no} &middot; {formatDateTime(req.submission.submitted_at)}</span></div>
              <div className="message-card"><div className="bubble" style={{ whiteSpace: 'pre-wrap' }}>{req.submission.submitted_message}</div></div>
              {req.submissions.length > 1 && (
                <details style={{ marginTop: '1rem' }}>
                  <summary>Earlier submissions ({req.submissions.length - 1})</summary>
                  {req.submissions.slice(1).map((s) => (
                    <div key={s.id} style={{ marginTop: '.75rem' }}>
                      <div className="muted small">Submission {s.submission_no} &middot; {formatDateTime(s.submitted_at)}</div>
                      <div className="message-card"><div className="bubble" style={{ whiteSpace: 'pre-wrap' }}>{s.submitted_message}</div></div>
                    </div>
                  ))}
                </details>
              )}
            </section>
          )}

          {req?.decision && (
            <section className={`card ${req.decision.decision === 'approved' ? 'card--ok' : 'card--bad'}`} aria-labelledby="decision-title">
              <h2 id="decision-title" style={{ marginBottom: '.5rem' }}>Decision</h2>
              <dl className="kv kv--compact">
                <dt>Outcome</dt><dd>{req.decision.decision === 'approved' ? 'Approved' : 'Rejected'}</dd>
                <dt>Decided</dt><dd>{formatDateTime(req.decision.decided_at)}</dd>
                {req.decision.reason && <><dt>Reason given</dt><dd>{req.decision.reason}</dd></>}
              </dl>
            </section>
          )}
        </div>

        <div>
          <section className="card" aria-labelledby="details-title">
            <h2 id="details-title" style={{ marginBottom: '.5rem' }}>Applicant details</h2>
            <dl className="kv kv--compact">
              <dt>Phone number</dt><dd className="num">{formatPhone(app.phone_number)}</dd>
              <dt>Email</dt><dd>{app.email}</dd>
              <dt>Date of birth</dt><dd>{formatDate(app.date_of_birth)}</dd>
              <dt>Address</dt><dd>{app.address}, {app.district}, {app.country}</dd>
              {app.occupation && <><dt>Occupation</dt><dd>{app.occupation}</dd></>}
              <dt>Submitted</dt><dd>{formatDateTime(req?.requested_at)}</dd>
              {req?.sms_sent_at && <><dt>SMS marked as sent</dt><dd>{formatDateTime(req.sms_sent_at)}</dd></>}
              {req?.decided_at && <><dt>Decided</dt><dd>{formatDateTime(req.decided_at)}</dd></>}
            </dl>
          </section>
          <section className="card" aria-labelledby="history-title">
            <h2 id="history-title" style={{ marginBottom: '1rem' }}>History</h2>
            <Timeline events={app.events} audience="admin" />
          </section>
        </div>
      </div>

      <ConfirmDialog open={dialog === 'mark'} title="Mark SMS as sent?" confirmLabel="Mark SMS as Sent" busy={busy} onCancel={close}
        onConfirm={() => run('admin_mark_sms_sent', { p_request_id: req.id }, 'SMS marked as sent', 'The applicant has been notified.')}>
        <p>Confirm that you have already sent the verification SMS to <strong className="num">{formatPhone(app.phone_number)}</strong>.</p>
        <p className="muted small">This records the time and notifies the applicant. It does not send an SMS.</p>
        <Alert>{actionError}</Alert>
      </ConfirmDialog>

      <ConfirmDialog open={dialog === 'approve'} title="Approve this application?" confirmLabel="Approve" busy={busy} onCancel={close}
        onConfirm={() => run('admin_approve_verification', { p_request_id: req.id }, 'Application approved', 'The applicant has been notified.')}>
        <p>The applicant will be told that their phone number is verified and their application is approved. This cannot be undone.</p>
        <Alert>{actionError}</Alert>
      </ConfirmDialog>

      <ConfirmDialog open={dialog === 'resubmit'} title="Request a resubmission" confirmLabel="Request resubmission" busy={busy} confirmDisabled={!reasonOk} onCancel={close}
        onConfirm={() => run('admin_request_resubmission', { p_request_id: req.id, p_reason: reason.trim() }, 'Resubmission requested', 'The applicant has been notified.')}>
        <p>The application returns to Awaiting SMS Verification and the applicant can submit the message again.</p>
        {reasonField('What should the applicant correct?', 'e.g. The pasted text was cut off. Please paste the complete SMS.')}
        <Alert>{actionError}</Alert>
      </ConfirmDialog>

      <ConfirmDialog open={dialog === 'reject'} title="Reject this application?" confirmLabel="Reject application" tone="danger-solid" busy={busy} confirmDisabled={!reasonOk} onCancel={close}
        onConfirm={() => run('admin_reject_verification', { p_request_id: req.id, p_reason: reason.trim() }, 'Application rejected', 'The applicant has been notified.')}>
        <p>The applicant will be told the application was rejected. They can update their details and submit again.</p>
        {reasonField('Reason for rejection', 'e.g. The message does not match the SMS that was sent.')}
        <Alert>{actionError}</Alert>
      </ConfirmDialog>
    </>
  )
}

const BackLink = () => <Link className="back-link" to="/admin/applications"><Icon name="back" />All applications</Link>

// The one card that tells the administrator what to do next for the current status.
function NextAction({ app, onMark, onApprove, onResubmit, onReject }) {
  switch (app.status) {
    case 'pending_admin_action':
      return (
        <>
          <h2>Send the verification SMS</h2>
          <p style={{ marginTop: '.5rem' }}>Review the applicant&apos;s details, then send the verification SMS to <strong className="num">{formatPhone(app.phone_number)}</strong> using your own process outside this application. When it has been sent, mark it here.</p>
          <div className="btn-row" style={{ marginTop: 0 }}><Button tone="dark" onClick={onMark}>Mark SMS as Sent</Button></div>
        </>
      )
    case 'sms_sent':
      return (
        <>
          <h2>Waiting for the applicant</h2>
          <p style={{ margin: '.5rem 0 0' }}>The SMS was marked as sent on {formatDateTime(app.request?.sms_sent_at)}. The applicant has been asked to paste the complete message they received.</p>
        </>
      )
    case 'pending_admin_validation':
      return (
        <>
          <h2>Review the submitted message</h2>
          <p style={{ marginTop: '.5rem' }}>Check the message below against the SMS you sent, then approve it, ask for a resubmission, or reject the application.</p>
          <div className="btn-row" style={{ marginTop: 0 }}>
            <Button tone="dark" onClick={onApprove}>Approve</Button>
            <Button tone="outline" onClick={onResubmit}>Request resubmission</Button>
            <Button tone="danger" onClick={onReject}>Reject</Button>
          </div>
        </>
      )
    case 'approved':
      return <><h2>Application approved</h2><p style={{ margin: '.5rem 0 0' }}>Approved on {formatDateTime(app.approved_at)}. No further action is needed.</p></>
    case 'rejected':
      return <><h2>Application rejected</h2><p style={{ margin: '.5rem 0 0' }}>The applicant can update their details and submit again.</p></>
    default:
      return <><h2>No action available</h2><p style={{ margin: '.5rem 0 0' }}>The applicant is updating their details and has not submitted again yet.</p></>
  }
}
