import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const rpc = vi.fn(async () => ({ data: {}, error: null }))
vi.mock('../lib/supabase', async (orig) => ({
  ...(await orig()),
  supabase: { rpc: (...a) => rpc(...a) },
  isSupabaseConfigured: true,
}))
let hookState
vi.mock('../hooks/useApplicantData', () => ({ useApplicantData: () => hookState }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../context/ToastContext', () => ({ useToast: () => vi.fn() }))

import Application from '../pages/applicant/Application'

const now = new Date().toISOString()
const make = (status, extra = {}) => ({
  id: 'a1', applicant_ref: 'ML-001000', full_name: 'Amina Nakato', date_of_birth: '1995-04-12', phone_number: '+256772123456',
  email: 'a@x.ug', country: 'Uganda', district: 'Kampala', address: 'Ntinda', status, created_at: now, details_confirmed_at: now,
  request: status === 'pending_registration' ? null : { id: 'r1', status, attempt_no: 1, phone_number: '+256772123456', requested_at: now, sms_sent_at: now, submissions: [], submission: null, decision: null },
  attempts: 1, events: [], ...extra,
})
const base = { loading: false, error: null, reload: vi.fn() }
const show = (application) => { hookState = { ...base, application }; return render(<MemoryRouter><Application /></MemoryRouter>) }

beforeEach(() => { rpc.mockClear(); base.reload.mockClear() })

describe('applicant journey follows the server status', () => {
  it('draft: shows the review screen and submits only after confirmation', async () => {
    show(make('pending_registration'))
    expect(screen.getByRole('heading', { name: 'Review your application' })).toBeTruthy()
    expect(screen.getAllByText('+256 772 123 456').length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: 'Submit application' }))
    expect(screen.getByRole('alert').textContent).toMatch(/Confirm that your details are correct/)
    expect(rpc).not.toHaveBeenCalled()
    await userEvent.click(screen.getByLabelText('I confirm that the details above are correct.'))
    await userEvent.click(screen.getByRole('button', { name: 'Submit application' }))
    expect(rpc).toHaveBeenCalledWith('request_sms_verification')
    await waitFor(() => expect(base.reload).toHaveBeenCalled())
  })

  it('draft: Edit details opens the pre-filled form', async () => {
    show(make('pending_registration'))
    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }))
    expect(screen.getByLabelText(/Full name/).value).toBe('Amina Nakato')
    expect(screen.getByLabelText(/Phone number/).value).toBe('772123456')
  })

  it('Pending Review: confirmation with the last four digits and NO verification form', () => {
    show(make('pending_admin_action'))
    expect(screen.getByRole('heading', { name: 'Application submitted' })).toBeTruthy()
    expect(screen.getAllByText('Pending Review').length).toBeGreaterThan(0)
    expect(screen.getByText('3456')).toBeTruthy()
    expect(screen.queryByPlaceholderText('Paste the complete SMS message here')).toBeNull()
    expect(screen.queryByText('SMS Verification Required')).toBeNull()
  })

  it('Awaiting SMS Verification: shows the instructions, validates, then submits the pasted text', async () => {
    show(make('sms_sent'))
    expect(screen.getByRole('heading', { name: 'SMS Verification Required' })).toBeTruthy()
    expect(screen.getByText(/A verification message has been sent to your registered phone number ending in/)).toBeTruthy()
    expect(screen.getByText('3456')).toBeTruthy()
    expect(screen.getAllByText('Awaiting SMS Verification').length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: 'Submit for Verification' }))
    expect(screen.getByRole('alert').textContent).toMatch(/Paste the complete SMS message/)
    expect(rpc).not.toHaveBeenCalled()
    const box = screen.getByPlaceholderText('Paste the complete SMS message here')
    await userEvent.click(box)
    await userEvent.paste('MoMo: your code is 482913')
    await userEvent.click(screen.getByRole('button', { name: 'Submit for Verification' }))
    expect(rpc).toHaveBeenCalledWith('submit_sms_verification', { p_request_id: 'r1', p_message: 'MoMo: your code is 482913' })
  })

  it('whitespace-only input is rejected without calling the server', async () => {
    show(make('sms_sent'))
    await userEvent.click(screen.getByPlaceholderText('Paste the complete SMS message here'))
    await userEvent.paste('   ')
    await userEvent.click(screen.getByRole('button', { name: 'Submit for Verification' }))
    expect(rpc).not.toHaveBeenCalled()
  })

  it('a requested resubmission shows the administrator reason above the form', () => {
    show(make('sms_sent', { events: [{ id: 1, request_id: 'r1', from_status: 'pending_admin_validation', to_status: 'sms_sent', note: 'The pasted text was cut off', actor_role: 'admin', created_at: now }] }))
    expect(screen.getByRole('status').textContent).toMatch(/The pasted text was cut off/)
    expect(screen.getByPlaceholderText('Paste the complete SMS message here')).toBeTruthy()
  })

  it('Verification Submitted: shows the submitted text and no form', () => {
    const app = make('pending_admin_validation')
    app.request.submission = { submitted_message: 'MoMo: your code is 482913', submitted_at: now, submission_no: 1 }
    show(app)
    expect(screen.getByRole('heading', { name: 'Verification submitted' })).toBeTruthy()
    expect(screen.getByText('MoMo: your code is 482913')).toBeTruthy()
    expect(screen.queryByPlaceholderText('Paste the complete SMS message here')).toBeNull()
  })

  it('Approved: states what was approved and makes no loan claim', () => {
    show(make('approved', { approved_at: now }))
    expect(screen.getByRole('heading', { name: 'Application approved' })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/loan (amount|has been (approved|disbursed))/i)
  })

  it('Rejected: shows the reason and allows submitting again', async () => {
    const app = make('rejected')
    app.request.decision = { decision: 'rejected', reason: 'Message does not match', decided_at: now }
    show(app)
    expect(screen.getByText(/Message does not match/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Submit application again' }))
    expect(rpc).toHaveBeenCalledWith('request_sms_verification')
  })

  it('applicant screens never mention internal or demo wording', () => {
    for (const s of ['pending_registration', 'pending_admin_action', 'sms_sent', 'pending_admin_validation', 'approved', 'rejected']) {
      const { unmount } = show(make(s))
      expect(document.body.textContent).not.toMatch(/demonstration|simulat|interview|administrator console/i)
      unmount()
    }
  })

  it('applicant timeline uses friendly wording and hides internal notes', () => {
    const { container } = show(make('sms_sent', { events: [{ id: 1, request_id: 'r1', from_status: null, to_status: 'pending_admin_action', note: 'internal note', actor_role: 'applicant', created_at: now }] }))
    const timeline = within(container.querySelector('.timeline'))
    expect(timeline.getByText('Application submitted')).toBeTruthy()
    expect(timeline.queryByText('internal note')).toBeNull()
  })
})
