import { Field } from './ui'
import { UG_DISTRICTS } from '../lib/validation'

// Latest selectable birth date: exactly 18 years ago.
const MAX_DOB = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 18); return d.toISOString().slice(0, 10) })()

// Personal details fields, shared by the registration wizard and the "Update details" form.
export default function DetailsFields({ values, errors, onChange }) {
  const set = (k) => (e) => onChange({ ...values, [k]: e.target.value })
  const props = (k) => ({ id: k, value: values[k] ?? '', onChange: set(k), 'aria-invalid': !!errors[k] || undefined, 'aria-describedby': errors[k] ? `${k}-err` : `${k}-hint` })
  return (
    <>
      <fieldset className="form-section">
        <legend>Personal information</legend>
        <div className="form-grid form-grid--2">
          <div className="span-2">
            <Field id="full_name" label="Full name" required error={errors.full_name} hint="As it appears on your national ID.">
              <input className="input" autoComplete="name" {...props('full_name')} />
            </Field>
          </div>
          <Field id="date_of_birth" label="Date of birth" required error={errors.date_of_birth} hint="You must be 18 or older.">
            <input className="input" type="date" max={MAX_DOB} autoComplete="bday" {...props('date_of_birth')} />
          </Field>
          <Field id="occupation" label="Occupation" optional>
            <input className="input" autoComplete="organization-title" {...props('occupation')} />
          </Field>
        </div>
      </fieldset>
      <fieldset className="form-section">
        <legend>Contact and address</legend>
        <div className="form-grid form-grid--2">
          <div className="span-2">
            <Field id="phone_number" label="Phone number" required error={errors.phone_number} hint="The number we will send your verification SMS to, for example 0772 123 456.">
              <div className="phone">
                <span className="phone__prefix" aria-hidden="true">+256</span>
                <input className="input" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="772 123 456" {...props('phone_number')} />
              </div>
            </Field>
          </div>
          <Field id="district" label="District" required error={errors.district}>
            <input className="input" list="districts" autoComplete="address-level2" {...props('district')} />
            <datalist id="districts">{UG_DISTRICTS.map((d) => <option key={d} value={d} />)}</datalist>
          </Field>
          <Field id="country" label="Country">
            <select className="select" id="country" value="Uganda" disabled onChange={() => {}}><option>Uganda</option></select>
          </Field>
          <div className="span-2">
            <Field id="address" label="Residential address" required error={errors.address} hint="Village or zone, parish and nearest landmark.">
              <input className="input" autoComplete="street-address" {...props('address')} />
            </Field>
          </div>
        </div>
      </fieldset>
    </>
  )
}
