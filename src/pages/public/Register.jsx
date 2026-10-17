import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { errorMessage } from '../../lib/supabase'
import { validateAccount, validateDetails } from '../../lib/validation'
import { Alert, Button, Field } from '../../components/ui'
import DetailsFields from '../../components/DetailsFields'
import AuthCard from './AuthCard'

// Two steps: personal details, then account credentials. Nothing is sent until the account is created,
// and creating an account only saves a DRAFT. The application is submitted later, after a review screen.
export default function Register() {
  const { signUp } = useAuth()
  const [step, setStep] = useState(1)
  const [details, setDetails] = useState({ country: 'Uganda' })
  const [account, setAccount] = useState({ email: '', password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const heading = useRef(null)

  const focusFirst = (errs) => document.getElementById(Object.keys(errs)[0])?.focus()

  if (emailSent) {
    return (
      <AuthCard title="Check your email">
        <Alert tone="success">We sent a confirmation link to <strong>{account.email}</strong>.</Alert>
        <p>Open the link in that email, then sign in to review and submit your application. Your details have been saved.</p>
        <Link className="btn btn--dark" to="/login">Go to sign in</Link>
      </AuthCard>
    )
  }

  const next = (e) => {
    e.preventDefault()
    const errs = validateDetails(details)
    setErrors(errs)
    if (Object.keys(errs).length) { focusFirst(errs); return }
    setStep(2); setError('')
    requestAnimationFrame(() => heading.current?.focus())
  }

  const create = async (e) => {
    e.preventDefault()
    setError('')
    const errs = validateAccount(account)
    setErrors(errs)
    if (Object.keys(errs).length) { focusFirst(errs); return }
    setBusy(true)
    try {
      const { needsEmailConfirmation } = await signUp(account, details)
      if (needsEmailConfirmation) { setEmailSent(true); setBusy(false) }
      // Otherwise the session arrives through AuthContext and the GuestOnly guard opens the application.
    } catch (err) {
      setError(errorMessage(err)); setBusy(false)
    }
  }

  const acc = (k) => ({ id: k, className: 'input', value: account[k], 'aria-invalid': !!errors[k] || undefined, 'aria-describedby': errors[k] ? `${k}-err` : undefined, onChange: (e) => setAccount({ ...account, [k]: e.target.value }) })

  return (
    <AuthCard wide title="Apply for a MoMo Loan" subtitle={`Step ${step} of 2: ${step === 1 ? 'Your personal details' : 'Create your account'}`}
      footer={<>Already have an account? <Link to="/login">Sign in</Link></>}>
      <Alert>{error}</Alert>
      {step === 1 ? (
        <form onSubmit={next} noValidate>
          <DetailsFields values={details} errors={errors} onChange={setDetails} />
          <div className="btn-row"><Button type="submit">Continue</Button></div>
        </form>
      ) : (
        <form className="form" onSubmit={create} noValidate>
          <h2 ref={heading} tabIndex={-1} style={{ outline: 'none' }}>Account details</h2>
          <div className="form-grid form-grid--2">
            <div className="span-2">
              <Field id="email" label="Email address" required error={errors.email} hint="You will use this to sign in.">
                <input type="email" autoComplete="email" {...acc('email')} />
              </Field>
            </div>
            <Field id="password" label="Password" required error={errors.password} hint="At least 8 characters.">
              <input type="password" autoComplete="new-password" {...acc('password')} />
            </Field>
            <Field id="confirm" label="Confirm password" required error={errors.confirm}>
              <input type="password" autoComplete="new-password" {...acc('confirm')} />
            </Field>
          </div>
          <div className="btn-row">
            <Button tone="outline" onClick={() => { setStep(1); setErrors({}) }} disabled={busy}>Back</Button>
            <Button type="submit" busy={busy}>Create account</Button>
          </div>
        </form>
      )}
    </AuthCard>
  )
}
