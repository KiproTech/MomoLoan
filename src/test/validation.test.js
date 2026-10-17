import { describe, expect, it } from 'vitest'
import { normalizeUgPhone, validateAccount, validateDetails } from '../lib/validation'

describe('Ugandan phone validation (+256)', () => {
  it.each([
    ['0772123456', '+256772123456'], ['772123456', '+256772123456'], ['+256 772 123 456', '+256772123456'],
    ['256782111222', '+256782111222'], ['0392 000 111', '+256392000111'],
  ])('accepts %s', (input, out) => expect(normalizeUgPhone(input)).toBe(out))
  it.each(['', '12345', '+254712345678', '0272123456', '07721234567', 'abc'])('rejects %s', (input) => expect(normalizeUgPhone(input)).toBeNull())
})

describe('details validation', () => {
  const ok = { full_name: 'Amina Nakato', date_of_birth: '1995-04-12', phone_number: '0772123456', district: 'Kampala', address: 'Ntinda' }
  it('accepts valid details', () => expect(validateDetails(ok)).toEqual({}))
  it('requires all fields', () => expect(Object.keys(validateDetails({})).sort()).toEqual(['address', 'date_of_birth', 'district', 'full_name', 'phone_number']))
  it('rejects applicants under 18', () => expect(validateDetails({ ...ok, date_of_birth: new Date().toISOString().slice(0, 10) }).date_of_birth).toMatch(/18/))
  it('validates account fields', () => {
    expect(Object.keys(validateAccount({ email: 'x', password: 'short', confirm: 'nope' }))).toEqual(['email', 'password', 'confirm'])
    expect(validateAccount({ email: 'a@b.ug', password: 'longenough', confirm: 'longenough' })).toEqual({})
  })
})

import { errorMessage } from '../lib/supabase'
import { STATUS_LABEL } from '../lib/status'

describe('user-facing error messages', () => {
  it('shows the messages our database functions raise on purpose', () => {
    expect(errorMessage({ code: '22023', message: 'Paste the complete SMS message before submitting' })).toBe('Paste the complete SMS message before submitting')
  })
  it('replaces internal status codes with their labels', () => {
    expect(errorMessage({ code: '55000', message: 'This application is pending_admin_validation and cannot be approved' })).toBe('This application is awaiting a decision and cannot be approved')
  })
  it('never leaks unexpected database or SQL details', () => {
    expect(errorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "uq_one_open_request_per_applicant"' })).toBe('Something went wrong. Please try again.')
    expect(errorMessage({ message: 'relation "public.x" does not exist' })).not.toMatch(/relation/)
  })
  it('maps authentication errors to plain wording', () => {
    expect(errorMessage({ message: 'Invalid login credentials' })).toBe('Incorrect email or password.')
  })
  it('uses the status vocabulary requested for the interface', () => {
    expect(STATUS_LABEL.pending_admin_action).toBe('Pending Review')
    expect(STATUS_LABEL.sms_sent).toBe('Awaiting SMS Verification')
    expect(STATUS_LABEL.pending_admin_validation).toBe('Verification Submitted')
  })
})

import { vi } from 'vitest'

// The client module reads its settings when first loaded, so give it valid-looking values for this test only
// (nothing is sent over the network), whatever the local .env contains.
vi.stubEnv('VITE_SUPABASE_URL', 'https://example-project.supabase.co')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'a'.repeat(40))
vi.resetModules()
const { getClient, portalFor } = await import('../lib/supabase')

describe('separate administrator and applicant sessions', () => {
  it('chooses the portal from the address', () => {
    expect(portalFor('/admin')).toBe('admin')
    expect(portalFor('/admin/login')).toBe('admin')
    expect(portalFor('/admin/applications/123')).toBe('admin')
    expect(portalFor('/')).toBe('applicant')
    expect(portalFor('/login')).toBe('applicant')
    expect(portalFor('/application')).toBe('applicant')
    expect(portalFor('/administrators-guide')).toBe('applicant')
  })
  it('uses a different client and storage key per portal, so one tab cannot overwrite the other login', () => {
    const admin = getClient('admin'); const applicant = getClient('applicant')
    expect(admin).not.toBe(applicant)
    expect(admin.auth.storageKey).toBe('momo-loan-admin-auth')
    expect(applicant.auth.storageKey).toBe('momo-loan-applicant-auth')
    expect(getClient('admin')).toBe(admin)
  })
})
