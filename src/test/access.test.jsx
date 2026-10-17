import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

let auth
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../lib/supabase', async (orig) => ({ ...(await orig()), supabase: {}, isSupabaseConfigured: true }))

import { GuestOnly, RequireAdmin, RequireApplicant } from '../components/Guards'
import PublicLayout from '../components/PublicLayout'
import Landing from '../pages/public/Landing'
import Login from '../pages/public/Login'
import Register from '../pages/public/Register'

const signedOut = { user: null, isAdmin: false, loading: false, signIn: vi.fn(), signUp: vi.fn(), takeSessionEnded: () => false }
const applicant = { user: { id: 'u', email: 'a@x.ug' }, isAdmin: false, loading: false }
const admin = { user: { id: 'x', email: 'adm@x.ug' }, isAdmin: true, loading: false }

const routes = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
        <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
      </Route>
      <Route path="/admin/login" element={<div>admin sign-in page</div>} />
      <Route path="/admin" element={<RequireAdmin><div>admin console</div></RequireAdmin>} />
      <Route path="/application" element={<RequireApplicant><div>applicant area</div></RequireApplicant>} />
      <Route path="/dashboard" element={<RequireApplicant><div>applicant dashboard</div></RequireApplicant>} />
    </Routes>
  </MemoryRouter>)

describe('public pages are for applicants only', () => {
  it.each(['/', '/login', '/register'])('%s has no administrator links, forms or wording', (path) => {
    auth = signedOut
    const { container } = routes(path)
    expect(container.querySelector('a[href*="admin"]')).toBeNull()
    expect(document.body.textContent).not.toMatch(/administrator|admin sign|review sms|demonstration|simulat|interview|no real sms/i)
  })

  it('landing offers applicant actions', () => {
    auth = signedOut
    routes('/')
    expect(screen.getAllByRole('link', { name: 'Apply for a loan' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: 'Sign in' }).length).toBeGreaterThan(0)
  })

  it('sign-in form asks only for email and password', () => {
    auth = signedOut
    routes('/login')
    expect(screen.getByLabelText(/Email address/)).toBeTruthy()
    expect(screen.getByLabelText(/Password/)).toBeTruthy()
  })
})

describe('landing page is always public', () => {
  it('shows the landing page to a signed-out visitor', () => {
    auth = signedOut; routes('/')
    expect(screen.getByRole('heading', { name: 'Apply for a MoMo Loan' })).toBeTruthy()
  })
  it('still shows the landing page to a signed-in applicant (no redirect)', () => {
    auth = applicant; routes('/')
    expect(screen.getByRole('heading', { name: 'Apply for a MoMo Loan' })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: /dashboard/i }).length).toBeGreaterThan(0)
    expect(screen.queryByText('admin console')).toBeNull()
  })
  it('never sends an administrator session to the admin console from "/"', () => {
    auth = admin; routes('/')
    expect(screen.getByRole('heading', { name: 'Apply for a MoMo Loan' })).toBeTruthy()
    expect(screen.queryByText('admin console')).toBeNull()
  })
  it('has the requested sections and buttons', () => {
    auth = signedOut; routes('/')
    for (const name of ['How it works', 'Benefits', 'Eligibility', 'FAQ', 'Help']) expect(screen.getAllByRole('link', { name }).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Frequently asked questions' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Before you start' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Need help?' })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Apply for a Loan' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: 'Sign In' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: 'Create Account' }).length).toBeGreaterThan(0)
  })
  it('invents no contact details when none are configured', () => {
    auth = signedOut; routes('/')
    expect(document.querySelector('a[href^="mailto:"], a[href^="tel:"]')).toBeNull()
  })
})

describe('route guards', () => {
  it('signed-out visitor to /admin is sent to the administrator sign-in', () => {
    auth = signedOut; routes('/admin')
    expect(screen.getByText('admin sign-in page')).toBeTruthy()
  })
  it('a session that is not an administrator never sees the admin console', () => {
    auth = applicant; routes('/admin')
    expect(screen.getByText('admin sign-in page')).toBeTruthy()
    expect(screen.queryByText('admin console')).toBeNull()
  })
  it('an administrator can open /admin', () => {
    auth = admin; routes('/admin')
    expect(screen.getByText('admin console')).toBeTruthy()
  })
  it('signed-out visitor to /application is sent to sign in', () => {
    auth = signedOut; routes('/application')
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy()
  })
  it('a signed-in applicant opening /login goes to the dashboard', () => {
    auth = applicant; routes('/login')
    expect(screen.getByText('applicant dashboard')).toBeTruthy()
  })
  it('waits while the identity is loading instead of deciding early', () => {
    auth = { user: { id: 'x' }, isAdmin: false, loading: true }; routes('/admin')
    expect(screen.queryByText('admin sign-in page')).toBeNull()
    expect(screen.getByRole('status')).toBeTruthy()
  })
})

describe('return-to-page after sign-in', () => {
  const Where = () => { const l = useLocation(); return <div>{`at ${l.pathname} from ${l.state?.from ?? 'nowhere'}`}</div> }
  const at = (path) => render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/login" element={<Where />} />
    <Route path="/profile" element={<RequireApplicant><div>profile</div></RequireApplicant>} />
  </Routes></MemoryRouter>)
  it('remembers the page a signed-out visitor asked for', () => {
    auth = signedOut; at('/profile')
    expect(screen.getByText('at /login from /profile')).toBeTruthy()
  })
  it('does not remember it after a deliberate sign-out', () => {
    auth = { ...signedOut, signedOutByUser: true }; at('/profile')
    expect(screen.getByText('at /login from nowhere')).toBeTruthy()
  })
})
