import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { nextStep } from '../lib/status'

let hookState
vi.mock('../hooks/useApplicantData', () => ({ useApplicantData: () => hookState }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', email: 'a@x.ug' }, profile: { full_name: 'Amina' }, signOut: vi.fn() }) }))
vi.mock('../context/ToastContext', () => ({ useToast: () => vi.fn() }))
vi.mock('../lib/supabase', async (orig) => ({ ...(await orig()), supabase: {}, isSupabaseConfigured: true }))

import Dashboard from '../pages/applicant/Dashboard'
import History from '../pages/applicant/History'
import Profile from '../pages/applicant/Profile'
import { Outlet } from 'react-router-dom'

const now = new Date().toISOString()
const base = { loading: false, error: null, reload: vi.fn() }
const app = (status, extra = {}) => ({
  id: 'a1', applicant_ref: 'ML-001000', full_name: 'Amina Nakato', date_of_birth: '1995-04-12', phone_number: '+256772123456',
  email: 'a@x.ug', country: 'Uganda', district: 'Kampala', address: 'Ntinda', status, created_at: now, updated_at: now, attempts: 1, events: [],
  request: null, requests: [], ...extra,
})
const notes = (items = []) => ({ items, unread: 0 })
const view = (el, application, items) => {
  hookState = { ...base, application }
  const Shell = () => <Outlet context={{ notes: notes(items) }} />
  return render(<MemoryRouter><Routes><Route element={<Shell />}><Route path="/" element={el} /></Route></Routes></MemoryRouter>)
}

describe('next-step guidance', () => {
  it('asks for action only when the applicant has something to do', () => {
    expect(nextStep('sms_sent').tone).toBe('warn')
    expect(nextStep('sms_sent').title).toMatch(/Action required/)
    expect(nextStep('pending_admin_action').title).not.toMatch(/Action required/)
    expect(nextStep('approved').tone).toBe('success')
    expect(nextStep('rejected').tone).toBe('error')
  })
})

describe('applicant dashboard', () => {
  it('greets the applicant and points to the next step', () => {
    view(<Dashboard />, app('sms_sent'))
    expect(screen.getByRole('heading', { name: 'Welcome, Amina' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /Action required/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Verify now' }).getAttribute('href')).toBe('/application')
  })
  it('shows an empty state for notifications and for a missing application', () => {
    view(<Dashboard />, null)
    expect(screen.getByText('No application yet')).toBeTruthy()
    expect(screen.getByText('No notifications')).toBeTruthy()
  })
  it('lists recent notifications', () => {
    view(<Dashboard />, app('pending_admin_action'), [{ id: '1', title: 'SMS verification required', body: 'Open your application', read_at: null, created_at: now }])
    expect(screen.getByText('SMS verification required')).toBeTruthy()
  })
  it('shows a retry when loading fails, without leaking the error', () => {
    hookState = { ...base, application: null, error: { message: 'relation "x" does not exist' } }
    render(<MemoryRouter><Routes><Route element={<Outlet context={{ notes: notes() }} />}><Route path="/" element={<Dashboard />} /></Route></Routes></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/relation/)
  })
})

describe('application history', () => {
  it('shows an empty state before anything is submitted', () => {
    view(<History />, app('pending_registration'))
    expect(screen.getByText('Nothing submitted yet')).toBeTruthy()
  })
  it('lists each attempt with its outcome and reason', () => {
    const requests = [
      { id: 'r2', attempt_no: 2, status: 'sms_sent', requested_at: now, sms_sent_at: now, submitted_at: null, decision: null },
      { id: 'r1', attempt_no: 1, status: 'rejected', requested_at: now, sms_sent_at: now, submitted_at: now, decision: { decision: 'rejected', reason: 'Message does not match', decided_at: now } },
    ]
    view(<History />, app('sms_sent', { requests }))
    expect(screen.getByRole('heading', { name: 'Attempt 2' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Attempt 1' })).toBeTruthy()
    expect(screen.getByText('Message does not match')).toBeTruthy()
  })
})

describe('profile', () => {
  it('allows editing details only when the database would allow it', () => {
    const { unmount } = view(<Profile />, app('pending_registration'))
    expect(screen.getByRole('link', { name: 'Edit details' })).toBeTruthy()
    unmount()
    view(<Profile />, app('pending_admin_validation'))
    expect(screen.queryByRole('link', { name: 'Edit details' })).toBeNull()
    expect(screen.getByText(/Locked while your application is under review/)).toBeTruthy()
  })
  it('offers password change and sign out', () => {
    view(<Profile />, app('approved'))
    expect(screen.getByRole('button', { name: 'Update password' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Sign out' }).length).toBe(1)
  })
})
