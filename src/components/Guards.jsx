import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Loading } from './ui'

// Sign-in and registration pages: a signed-in applicant goes to their dashboard instead.
// NOTE: the landing page "/" is deliberately NOT guarded. It always shows the public site.
export function GuestOnly({ children }) {
  const { user, loading } = useAuth()
  const { state } = useLocation()
  if (loading) return <Loading text="Loading..." />
  // Return to the page the visitor originally asked for, but only to applicant pages (never an open redirect).
  const back = /^\/(dashboard|application|history|profile)$/.test(state?.from || '') ? state.from : '/dashboard'
  return user ? <Navigate to={back} replace /> : children
}

// Applicant area. Without a valid applicant session the visitor goes to sign in and comes back afterwards.
export function RequireApplicant({ children }) {
  const { user, loading, signedOutByUser } = useAuth()
  const location = useLocation()
  if (loading) return <Loading text="Checking your session..." />
  // Remember the requested page for after sign-in, unless the user has just signed out on purpose.
  if (!user) return <Navigate to="/login" replace state={signedOutByUser ? undefined : { from: location.pathname }} />
  return children
}

// Administrator area. This only decides what to RENDER: the data itself is protected by Row Level Security
// and every administrator action is re-checked inside the database, so bypassing this component gains nothing.
// An administrator login lives in its own browser session (see lib/supabase.js), separate from applicants.
export function RequireAdmin({ children }) {
  const { user, isAdmin, loading, signedOutByUser } = useAuth()
  const location = useLocation()
  if (loading) return <Loading text="Checking your session..." />
  if (!user || !isAdmin) return <Navigate to="/admin/login" replace state={signedOutByUser ? undefined : { from: location.pathname }} />
  return children
}
