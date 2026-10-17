import { useState } from 'react'
import { supabase, errorMessage } from '../../lib/supabase'
import { normalizeUgPhone, validateDetails } from '../../lib/validation'
import { Alert, Button, PageHead } from '../../components/ui'
import DetailsFields from '../../components/DetailsFields'

// First-time details (when sign-up did not store them) or "Update details" before submission.
export default function DetailsForm({ applicant, onSaved, onCancel }) {
  const [values, setValues] = useState(applicant
    ? { ...applicant, phone_number: applicant.phone_number.replace('+256', '') } : { country: 'Uganda' })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault(); setError('')
    const errs = validateDetails(values); setErrors(errs)
    if (Object.keys(errs).length) { document.getElementById(Object.keys(errs)[0])?.focus(); return }
    setBusy(true)
    const { error: err } = await supabase.rpc('save_registration', {
      p_full_name: values.full_name.trim(), p_date_of_birth: values.date_of_birth,
      p_phone_number: normalizeUgPhone(values.phone_number), p_district: values.district.trim(),
      p_address: values.address.trim(), p_occupation: (values.occupation || '').trim() || null,
    })
    setBusy(false)
    if (err) setError(errorMessage(err)); else onSaved()
  }

  return (
    <main className="container container--narrow">
      <PageHead title={applicant ? 'Update your details' : 'Your personal details'}>
        {applicant ? 'Make your changes, then review your application again.' : 'Enter your details to start your application.'}
      </PageHead>
      <div className="card">
        <Alert>{error}</Alert>
        <form onSubmit={submit} noValidate>
          <DetailsFields values={values} errors={errors} onChange={setValues} />
          <div className="btn-row">
            <Button type="submit" busy={busy}>Save and review</Button>
            {onCancel && <Button tone="outline" onClick={onCancel} disabled={busy}>Cancel</Button>}
          </div>
        </form>
      </div>
    </main>
  )
}
