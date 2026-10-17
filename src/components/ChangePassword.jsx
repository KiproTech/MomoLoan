import { useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import { Alert, Button, Field } from './ui'

// Change the password of the signed-in account. Works for the applicant and the administrator portal alike,
// because `supabase` always talks to the login of the portal the page belongs to.
export default function ChangePassword() {
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const errs = {}
    if (password.length < 8) errs.password = 'Use at least 8 characters.'
    if (confirm !== password) errs.confirm = 'The passwords do not match.'
    setErrors(errs)
    if (Object.keys(errs).length) { document.getElementById(Object.keys(errs)[0])?.focus(); return }
    setBusy(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (err) { setError(errorMessage(err)); return }
    setPassword(''); setConfirm('')
    toast('Password updated', 'Use your new password the next time you sign in.', 'success')
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <Alert>{error}</Alert>
      <Field id="password" label="New password" required error={errors.password} hint="At least 8 characters.">
        <input id="password" className="input" type="password" autoComplete="new-password" value={password} aria-invalid={!!errors.password || undefined} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field id="confirm" label="Confirm new password" required error={errors.confirm}>
        <input id="confirm" className="input" type="password" autoComplete="new-password" value={confirm} aria-invalid={!!errors.confirm || undefined} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <div><Button type="submit" tone="dark" busy={busy}>Update password</Button></div>
    </form>
  )
}
