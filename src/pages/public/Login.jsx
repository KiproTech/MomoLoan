import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { errorMessage } from '../../lib/supabase'
import { Alert, Button, Field } from '../../components/ui'
import AuthCard from './AuthCard'

// Applicant sign-in. Redirection after a successful sign-in is handled by the GuestOnly route guard.
export default function Login() {
  const { signIn, takeSessionEnded } = useAuth()
  const [ended] = useState(takeSessionEnded)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) { setError('Enter your email address and password.'); return }
    setBusy(true)
    try { await signIn(email, password) } catch (err) { setError(errorMessage(err)); setBusy(false) }
  }

  return (
    <AuthCard title="Sign in" subtitle="Sign in to continue your loan application."
      footer={<>New to MoMo Loan? <Link to="/register">Create an account</Link></>}>
      {ended && !error && <Alert tone="info">Your session has ended. Sign in again to continue.</Alert>}
      <Alert>{error}</Alert>
      <form className="form" onSubmit={submit} noValidate>
        <Field id="email" label="Email address" required>
          <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field id="password" label="Password" required>
          <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" busy={busy} block>Sign in</Button>
      </form>
    </AuthCard>
  )
}
