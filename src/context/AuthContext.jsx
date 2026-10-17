import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { portalFor, supabase } from '../lib/supabase'
import { normalizeUgPhone } from '../lib/validation'

const AuthContext = createContext(null)
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)

const EXPIRED_KEY = (portal) => `momo-loan-${portal}-session-ended`
const failure = (userMessage) => Object.assign(new Error(userMessage), { userMessage })

// One provider per portal (see PortalAuth in App.jsx). `portal` is "applicant" or "admin" and decides which
// Supabase client, and therefore which stored login, this provider works with.
export function AuthProvider({ portal = portalFor(window.location.pathname), children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [initialised, setInitialised] = useState(false)
  const [pending, setPending] = useState(false) // a sign-in is running its role check
  const [signedOutByUser, setSignedOutByUser] = useState(false) // true after a deliberate sign-out
  const signingOut = useRef(false) // true while WE are ending the session, so it is not reported as "expired"

  // 1. Track the Supabase session (restored from storage on refresh and direct navigation).
  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setInitialised(true)
    })
    // Do not call Supabase inside this callback (can deadlock); just store the session.
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // SIGNED_OUT that we did not ask for = refresh token expired or revoked, or signed out in another tab
      // of the same portal. Remember it so the sign-in page can explain what happened.
      if (event === 'SIGNED_OUT' && !signingOut.current) {
        try { sessionStorage.setItem(EXPIRED_KEY(portal), '1') } catch { /* storage unavailable: ignore */ }
      }
      setSession(s)
      if (!s) setProfile(null)
    })
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [portal])

  // 2. Load the role from public.profiles. The browser can only read it (RLS: own row), and every
  //    administrator action is re-checked inside the database, so this value only drives the UI.
  const userId = session?.user?.id
  useEffect(() => {
    if (!userId) return
    let active = true
    supabase.from('profiles').select('id, email, full_name, role').eq('id', userId).maybeSingle()
      .then(({ data }) => { if (active) setProfile(data || { id: userId, role: 'applicant' }) })
    return () => { active = false }
  }, [userId])

  // A login that belongs to the other portal (an administrator account in the applicant portal, or a
  // non-administrator in the administrator portal) is ended locally, so it can never linger in this portal.
  const isAdmin = profile?.role === 'admin'
  const wrongPortal = !!profile && profile.id === userId && (portal === 'admin' ? !isAdmin : isAdmin)
  useEffect(() => {
    if (!wrongPortal) return
    signingOut.current = true
    supabase.auth.signOut({ scope: 'local' }).finally(() => { signingOut.current = false })
  }, [wrongPortal])

  // "Loading" lasts until the role of the CURRENT user is known, so a guard never makes a decision
  // with a half-loaded identity (no flash of the wrong page after sign-in or on refresh).
  // While a sign-in is still checking the role, the new session is hidden (user null, not loading): the form
  // stays on screen, so a refusal ("cannot be used on this page") can be shown instead of vanishing with it.
  const loading = !pending && (!initialised || (!!userId && profile?.id !== userId))
  const usable = !wrongPortal && !pending

  const signIn = useCallback(async (email, password) => {
    setPending(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
      sessionStorage.removeItem(EXPIRED_KEY(portal))
      setSignedOutByUser(false)
      const { data: p } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
      const admin = p?.role === 'admin'
      if (portal === 'admin' ? !admin : admin) {
        signingOut.current = true
        try { await supabase.auth.signOut({ scope: 'local' }) } finally { signingOut.current = false }
        throw failure(portal === 'admin' ? 'This account does not have administrator access.' : 'These credentials cannot be used on this page.')
      }
    } finally {
      setPending(false)
    }
  }, [portal])

  // Registration: account + personal details in one step. The details travel as sign-up metadata and a
  // database trigger stores them as a draft application (never approved, never an administrator).
  const signUp = useCallback(async (account, details) => {
    const { data, error } = await supabase.auth.signUp({
      email: account.email.trim(),
      password: account.password,
      options: {
        data: {
          full_name: details.full_name.trim(),
          date_of_birth: details.date_of_birth,
          phone_number: normalizeUgPhone(details.phone_number),
          district: details.district.trim(),
          address: details.address.trim(),
          occupation: (details.occupation || '').trim(),
        },
      },
    })
    if (error) throw error
    // No session means the project requires e-mail confirmation first.
    return { needsEmailConfirmation: !data.session }
  }, [])

  // Local scope: ends only THIS browser's session for this portal. The default ("global") would revoke every
  // session of the account on the server, which is exactly what must not happen here.
  const signOut = useCallback(async () => {
    setSignedOutByUser(true)
    signingOut.current = true
    try { await supabase.auth.signOut({ scope: 'local' }) } finally { signingOut.current = false }
  }, [])

  // True if the previous session ended without the user asking for it (expiry, revocation, other tab).
  // Read-only; the flag is cleared by the next successful sign-in.
  const takeSessionEnded = useCallback(() => sessionStorage.getItem(EXPIRED_KEY(portal)) === '1', [portal])

  const value = useMemo(() => ({
    portal, signedOutByUser, session: usable ? session : null, user: usable ? session?.user ?? null : null, profile, loading,
    isAdmin: usable && isAdmin,
    signIn, signUp, signOut, takeSessionEnded,
  }), [portal, signedOutByUser, session, usable, profile, loading, isAdmin, signIn, signUp, signOut, takeSessionEnded])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
