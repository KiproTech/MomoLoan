import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { render, screen, waitFor } from '@testing-library/react'

// A minimal stand-in for the Supabase client: one stored session and one profile row.
const h = vi.hoisted(() => {
  const state = { session: null, role: 'applicant', listener: null }
  const signOut = vi.fn(async () => { state.session = null })
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: state.session } }),
      onAuthStateChange: (cb) => { state.listener = cb; return { data: { subscription: { unsubscribe: () => {} } } } },
      signInWithPassword: async () => ({ data: { user: { id: 'u1' } }, error: null }),
      signOut,
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'u1', role: state.role }, error: null }) }) }) }),
  }
  return { state, signOut, supabase }
})
const { state, signOut } = h
vi.mock('../lib/supabase', async (orig) => ({ ...(await orig()), supabase: h.supabase, isSupabaseConfigured: true }))

import { AuthProvider, useAuth } from '../context/AuthContext'

const captured = { current: null } // the latest auth value, for the tests to call signIn / signOut on
const Probe = () => {
  const auth = useAuth()
  useEffect(() => { captured.current = auth })
  return <div>{auth.loading ? 'loading' : auth.user ? `user:${auth.isAdmin ? 'admin' : 'applicant'}` : 'signed-out'}</div>
}
const mount = (portal) => render(<AuthProvider portal={portal}><Probe /></AuthProvider>)

beforeEach(() => { signOut.mockClear(); sessionStorage.clear(); state.session = { user: { id: 'u1', email: 'x@y.ug' } } })

describe('portal-aware authentication', () => {
  it('accepts an applicant in the applicant portal', async () => {
    state.role = 'applicant'; mount('applicant')
    expect(await screen.findByText('user:applicant')).toBeTruthy()
    expect(signOut).not.toHaveBeenCalled()
  })

  it('accepts an administrator in the administrator portal', async () => {
    state.role = 'admin'; mount('admin')
    expect(await screen.findByText('user:admin')).toBeTruthy()
  })

  it('does not let an administrator account linger in the applicant portal (local sign-out only)', async () => {
    state.role = 'admin'; mount('applicant')
    expect(await screen.findByText('signed-out')).toBeTruthy()
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ scope: 'local' }))
  })

  it('does not treat a non-administrator as signed in to the administrator portal', async () => {
    state.role = 'applicant'; mount('admin')
    expect(await screen.findByText('signed-out')).toBeTruthy()
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ scope: 'local' }))
  })

  it('signs out with local scope, never the global scope that would end every session of the account', async () => {
    state.role = 'applicant'; mount('applicant'); await screen.findByText('user:applicant')
    await captured.current.signOut()
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(signOut).not.toHaveBeenCalledWith()
  })

  it('rejects a sign-in with the wrong kind of account and says why', async () => {
    state.session = null; state.role = 'applicant'; mount('admin'); await screen.findByText('signed-out')
    await expect(captured.current.signIn('a@b.ug', 'pw')).rejects.toMatchObject({ userMessage: 'This account does not have administrator access.' })
    state.role = 'admin'
    const applicantPortal = mount('applicant')
    await expect(captured.current.signIn('a@b.ug', 'pw')).rejects.toMatchObject({ userMessage: 'These credentials cannot be used on this page.' })
    applicantPortal.unmount()
  })

  it('remembers a session that ended without the user asking, per portal', async () => {
    state.role = 'applicant'; mount('applicant'); await screen.findByText('user:applicant')
    state.listener('SIGNED_OUT', null)
    expect(sessionStorage.getItem('momo-loan-applicant-session-ended')).toBe('1')
    expect(sessionStorage.getItem('momo-loan-admin-session-ended')).toBeNull()
    expect(captured.current.takeSessionEnded()).toBe(true)
  })

  it('does not report a deliberate sign-out as an expired session', async () => {
    state.role = 'applicant'; mount('applicant'); await screen.findByText('user:applicant')
    signOut.mockImplementationOnce(async () => { state.listener('SIGNED_OUT', null) })
    await captured.current.signOut()
    expect(sessionStorage.getItem('momo-loan-applicant-session-ended')).toBeNull()
  })
})
