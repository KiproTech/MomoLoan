import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { errorMessage } from '../../lib/supabase'
import { Alert, Button, Field } from '../../components/ui'
import Logo from '../../components/Logo'

// Dedicated administrator sign-in at /admin/login. It is not linked from any public page.
// The role is read from public.profiles (read-only for browsers) after sign-in; non-administrators are
// signed straight back out. All administrator data and actions are separately enforced by RLS and RPC checks.
// This portal keeps its own login, separate from the applicant portal, so both can be open in one browser.
export default function AdminLogin() {
  const { user, isAdmin, loading, signIn, takeSessionEnded } = useAuth()
  const navigate = useNavigate()
  const { state } = useLocation()
  const [ended] = useState(takeSessionEnded)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (user && !loading && isAdmin) return <Navigate to="/admin" replace />

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) { setError('Enter your email address and password.'); return }
    setBusy(true)
    try {
      // signIn checks the role in the database and ends the login again if this is not an administrator.
      await signIn(email, password)
      navigate(/^\/admin(\/|$)/.test(state?.from || '') ? state.from : '/admin', { replace: true })
    } catch (err) {
      setError(errorMessage(err)); setBusy(false)
    }
  }

  return (
    <main className="auth auth--admin">
      <div className="auth__card">
        <div className="card">
          <div className="auth__brand"><Logo height={44} /><strong>MoMo Loan Administration</strong></div>
          <h1 className="auth__title">Administrator sign in</h1>
          <p className="auth__sub">Use your administrator account to continue.</p>
          {ended && !error && <Alert tone="info">Your session has ended. Sign in again to continue.</Alert>}
          <Alert>{error}</Alert>
          <form className="form" onSubmit={submit} noValidate>
            <Field id="admin-email" label="Email address" required>
              <input id="admin-email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field id="admin-password" label="Password" required>
              <input id="admin-password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button type="submit" tone="dark" busy={busy} block>Sign in</Button>
          </form>
        </div>
      </div>
    </main>
  )
}
