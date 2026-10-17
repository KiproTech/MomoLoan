import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const rpc = vi.fn(async () => ({ data: {}, error: null }))
vi.mock('../lib/supabase', async (orig) => ({ ...(await orig()), supabase: { rpc: (...a) => rpc(...a) }, isSupabaseConfigured: true }))
let detail
vi.mock('../hooks/useAdminApplications', () => ({ useAdminApplication: () => detail, useAdminApplications: () => detail }))
vi.mock('../context/ToastContext', () => ({ useToast: () => vi.fn() }))

import ApplicationDetail from '../pages/admin/ApplicationDetail'
import Overview from '../pages/admin/Overview'

const now = new Date().toISOString()
const make = (status, request = {}) => ({
  id: 'a1', applicant_ref: 'ML-001000', full_name: 'Amina Nakato', date_of_birth: '1995-04-12', phone_number: '+256772123456',
  email: 'a@x.ug', country: 'Uganda', district: 'Kampala', address: 'Ntinda', status, created_at: now, updated_at: now, attempts: 1, events: [],
  request: { id: 'r1', attempt_no: 1, requested_at: now, submissions: [], submission: null, decision: null, ...request },
})
const reload = vi.fn(async () => {})
const page = (application) => {
  detail = { loading: false, error: null, application, reload }
  return render(<MemoryRouter initialEntries={['/admin/applications/a1']}><Routes><Route path="/admin/applications/:id" element={<ApplicationDetail />} /></Routes></MemoryRouter>)
}
beforeEach(() => { rpc.mockClear(); reload.mockClear() })
// The confirmation dialog that is currently open (closed ones render no content).
const openDialog = () => within(document.querySelector('dialog[open]'))
const confirmIn = (name) => openDialog().getByRole('button', { name, hidden: true })

describe('administrator application page', () => {
  it('Pending Review: Mark SMS as Sent needs confirmation and only records the state', async () => {
    page(make('pending_admin_action'))
    expect(screen.getByText('Pending Review')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Mark SMS as Sent' }))
    expect(openDialog().getByText(/It does not send an SMS/)).toBeTruthy()
    expect(rpc).not.toHaveBeenCalled()                       // nothing happens before confirming
    await userEvent.click(confirmIn('Mark SMS as Sent'))
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('admin_mark_sms_sent', { p_request_id: 'r1' })
    await waitFor(() => expect(reload).toHaveBeenCalled())
  })

  it('cancelling the confirmation does nothing', async () => {
    page(make('pending_admin_action'))
    await userEvent.click(screen.getByRole('button', { name: 'Mark SMS as Sent' }))
    await userEvent.click(confirmIn('Cancel'))
    expect(rpc).not.toHaveBeenCalled()
  })

  it('double-clicking confirm sends the action only once', async () => {
    let release
    rpc.mockImplementationOnce(() => new Promise((res) => { release = () => res({ data: {}, error: null }) }))
    page(make('pending_admin_action'))
    await userEvent.click(screen.getByRole('button', { name: 'Mark SMS as Sent' }))
    const confirm = confirmIn('Mark SMS as Sent')
    await userEvent.click(confirm)
    await userEvent.click(confirm)
    expect(rpc).toHaveBeenCalledTimes(1)
    release()
  })

  it('Awaiting SMS Verification: no review controls are offered', () => {
    page(make('sms_sent', { sms_sent_at: now }))
    expect(screen.getByRole('heading', { name: 'Waiting for the applicant' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mark SMS as Sent' })).toBeNull()
  })

  const submitted = () => make('pending_admin_validation', {
    submission: { id: 's1', submission_no: 1, submitted_message: 'MoMo: your code is 482913', submitted_at: now },
    submissions: [{ id: 's1', submission_no: 1, submitted_message: 'MoMo: your code is 482913', submitted_at: now }],
  })

  it('Verification Submitted: shows the message and approves after confirmation', async () => {
    page(submitted())
    expect(screen.getByText('MoMo: your code is 482913')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(rpc).not.toHaveBeenCalled()
    await userEvent.click(confirmIn('Approve'))
    expect(rpc).toHaveBeenCalledWith('admin_approve_verification', { p_request_id: 'r1' })
  })

  it('rejection requires a reason of at least five characters', async () => {
    page(submitted())
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }))
    const confirm = confirmIn('Reject application')
    expect(confirm.disabled).toBe(true)
    await userEvent.type(screen.getByLabelText('Reason for rejection'), 'abc')
    expect(confirm.disabled).toBe(true)
    await userEvent.type(screen.getByLabelText('Reason for rejection'), 'defg')
    expect(confirm.disabled).toBe(false)
    await userEvent.click(confirm)
    expect(rpc).toHaveBeenCalledWith('admin_reject_verification', { p_request_id: 'r1', p_reason: 'abcdefg' })
  })

  it('resubmission can be requested with a reason', async () => {
    page(submitted())
    await userEvent.click(screen.getByRole('button', { name: 'Request resubmission' }))
    await userEvent.type(screen.getByLabelText('What should the applicant correct?'), 'Text was cut off')
    await userEvent.click(confirmIn('Request resubmission'))
    expect(rpc).toHaveBeenCalledWith('admin_request_resubmission', { p_request_id: 'r1', p_reason: 'Text was cut off' })
  })

  it('a database refusal is shown in the dialog and the page is refreshed', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '55000', message: 'This application is sms_sent, so the SMS cannot be marked as sent again' } })
    page(make('pending_admin_action'))
    await userEvent.click(screen.getByRole('button', { name: 'Mark SMS as Sent' }))
    await userEvent.click(confirmIn('Mark SMS as Sent'))
    expect(await openDialog().findByText(/is awaiting SMS verification, so the SMS cannot be marked as sent again/)).toBeTruthy()
    expect(reload).toHaveBeenCalled()
  })
})

describe('administrator overview', () => {
  it('shows only counts derived from the records', () => {
    const apps = [make('pending_admin_action'), make('pending_admin_action'), make('sms_sent'), make('approved'), make('rejected')]
    detail = { loading: false, error: null, applications: apps, reload }
    render(<MemoryRouter><Overview /></MemoryRouter>)
    const stat = (label) => screen.getAllByText(label).find((el) => el.classList.contains('stat__label')).closest('a').querySelector('.stat__n').textContent
    expect(stat('Total applications')).toBe('5')
    expect(stat('Pending Review')).toBe('2')
    expect(stat('Awaiting SMS Verification')).toBe('1')
    expect(stat('Verification Submitted')).toBe('0')
    expect(stat('Approved')).toBe('1')
    expect(stat('Rejected')).toBe('1')
  })
})
