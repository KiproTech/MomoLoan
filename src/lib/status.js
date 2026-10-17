// One vocabulary for statuses across the whole app. The keys match the database values.
export const STATUS = {
  PENDING_REGISTRATION: 'pending_registration',
  PENDING_ADMIN_ACTION: 'pending_admin_action',
  SMS_SENT: 'sms_sent',
  PENDING_ADMIN_VALIDATION: 'pending_admin_validation',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
}

export const STATUS_LABEL = {
  pending_registration: 'Draft',
  pending_admin_action: 'Pending Review',
  sms_sent: 'Awaiting SMS Verification',
  pending_admin_validation: 'Verification Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
  expired: 'Expired',
}

// Wording for a status inside a sentence, e.g. "This application is awaiting SMS verification".
export const STATUS_PHRASE = {
  pending_registration: 'a draft',
  pending_admin_action: 'pending review',
  sms_sent: 'awaiting SMS verification',
  pending_admin_validation: 'awaiting a decision',
  approved: 'approved',
  rejected: 'rejected',
  expired: 'expired',
}

// Visual tone per status (see .badge--* in index.css).
export const STATUS_TONE = {
  pending_registration: 'neutral',
  pending_admin_action: 'warn',
  sms_sent: 'info',
  pending_admin_validation: 'warn',
  approved: 'ok',
  rejected: 'bad',
  expired: 'neutral',
}

// Statuses an administrator can filter by (drafts never appear in the admin queue).
export const ADMIN_FILTERS = [
  STATUS.PENDING_ADMIN_ACTION,
  STATUS.SMS_SENT,
  STATUS.PENDING_ADMIN_VALIDATION,
  STATUS.APPROVED,
  STATUS.REJECTED,
  STATUS.EXPIRED,
]

// Steps shown in the progress tracker.
export const STEPS = [
  { key: 'submitted', label: 'Application submitted' },
  { key: 'sent', label: 'SMS sent' },
  { key: 'verified', label: 'Verification submitted' },
  { key: 'decision', label: 'Decision' },
]

// How many steps are complete for a given status.
export function stepsDone(status) {
  switch (status) {
    case 'pending_admin_action': return 1
    case 'sms_sent': return 2
    case 'pending_admin_validation': return 3
    case 'approved':
    case 'rejected': return 4
    default: return 0
  }
}

// Wording for a status change in the activity timeline (from/to are the request statuses).
export function eventLabel(e, audience = 'applicant') {
  if (e.to_status === 'sms_sent') {
    if (e.from_status === 'pending_admin_validation') return 'Resubmission requested'
    return audience === 'admin' ? 'SMS marked as sent' : 'SMS sent to your registered number'
  }
  return {
    pending_admin_action: 'Application submitted',
    pending_admin_validation: 'Verification submitted',
    approved: 'Application approved',
    rejected: 'Application rejected',
    expired: 'Verification expired',
  }[e.to_status] || STATUS_LABEL[e.to_status] || e.to_status
}

// What the applicant should do next, per status. `cta` links to the application page.
export function nextStep(status) {
  switch (status) {
    case 'pending_registration':
      return { tone: 'info', title: 'Review and submit your application', text: 'Check your details, then submit them for review.', cta: 'Review application' }
    case 'pending_admin_action':
      return { tone: 'info', title: 'Your application is with our team', text: 'You will be notified here when the verification SMS has been sent to your registered phone number.', cta: 'View status' }
    case 'sms_sent':
      return { tone: 'warn', title: 'Action required: submit your SMS', text: 'A verification SMS has been sent to your registered phone number. Copy the complete message, paste it into your application and submit it.', cta: 'Verify now' }
    case 'pending_admin_validation':
      return { tone: 'info', title: 'Your verification is being reviewed', text: 'You have submitted your SMS message. You will be notified of the outcome.', cta: 'View status' }
    case 'approved':
      return { tone: 'success', title: 'Your application has been approved', text: 'Your phone number is verified. No further action is needed.', cta: 'View details' }
    case 'rejected':
      return { tone: 'error', title: 'Your application was not approved', text: 'See the reason and submit your application again if you wish.', cta: 'See next steps' }
    case 'expired':
      return { tone: 'warn', title: 'Your verification expired', text: 'Submit your application again to start a new verification.', cta: 'Continue' }
    default:
      return { tone: 'info', title: 'Complete your details', text: 'Add your personal details to start your application.', cta: 'Add my details' }
  }
}
