import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Icon from '../../components/Icon'

const STEPS = [
  ['Create your account', 'Enter your personal details and register with your email address.'],
  ['Submit your application', 'Review your details, then submit them for review.'],
  ['Verify your phone number', 'You receive an SMS on your registered number. Paste the complete message into your application.'],
  ['Receive your decision', 'We review your submission. Your application status always shows where you are.'],
]

const BENEFITS = [
  ['phone', 'Apply from your phone', 'Complete the whole application online, on any phone, tablet or computer.'],
  ['clock', 'See every step', 'A progress tracker and activity history show exactly where your application stands.'],
  ['bell', 'Clear notifications', 'You are told in your dashboard when something needs your attention.'],
  ['check', 'Reasons you can act on', 'If an application is rejected or needs a resubmission, you see the reason and can try again.'],
  ['lock', 'Your information stays private', 'You can see only your own application. Staff access is restricted and recorded.'],
]

const ELIGIBILITY = [
  ['Age', 'You must be 18 years or older.'],
  ['Residence', 'You must live in Uganda and have a valid Ugandan phone number.'],
  ['Your phone', 'Keep your registered phone with you. You will need to copy an SMS from it.'],
]

const FAQ = [
  ['Who can apply?', 'Anyone aged 18 or older who lives in Uganda and has a Ugandan phone number they can access. See the eligibility section above.'],
  ['Why do I need to verify my phone number?', 'Verification confirms that the number on your application belongs to you. After your application is submitted we send an SMS to that number. You copy the complete message and paste it into your application.'],
  ['Does the application send the SMS automatically?', 'No. The SMS is sent by a member of our team. When it has been sent, your dashboard tells you, and the verification form appears.'],
  ['How will I know what is happening with my application?', 'Your dashboard and the application page show the current status, a progress tracker and a history of every step. Notifications appear when action is needed.'],
  ['What if my application is rejected?', 'You will see the reason. You can update your details if needed and submit your application again.'],
  ['Can I change my details after submitting?', 'Details can be edited before you submit and again if an application is rejected. While an application is under review they are locked so the review stays accurate.'],
  ['Is my personal information safe?', 'Each applicant can see only their own information. Staff accounts are restricted, and actions on applications are recorded.'],
]

// Optional support details, shown only if the site owner configured them in .env (never invented here).
const SUPPORT_EMAIL = (import.meta.env.VITE_SUPPORT_EMAIL || '').trim()
const SUPPORT_PHONE = (import.meta.env.VITE_SUPPORT_PHONE || '').trim()

export default function Landing() {
  const { user } = useAuth()
  const { hash } = useLocation()

  // Scroll to a section when arriving from a link like /#faq (also works after a refresh).
  useEffect(() => {
    if (!hash) { window.scrollTo(0, 0); return }
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    return () => clearTimeout(t)
  }, [hash])

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero__inner">
          <div className="fade-in">
            <h1 id="hero-title">Apply for a MoMo Loan</h1>
            <p className="hero__lead">Create an account, submit your details and verify your phone number by SMS. You can follow the status of your application at every step.</p>
            <div className="hero__actions">
              {user ? (
                <Link className="btn btn--primary" to="/dashboard">Go to my dashboard</Link>
              ) : (
                <>
                  <Link className="btn btn--primary" to="/register">Apply for a Loan</Link>
                  <Link className="btn btn--outline" to="/login">Sign In</Link>
                </>
              )}
            </div>
            {!user && <p className="hero__note">New here? <Link to="/register">Create Account</Link> to get started.</p>}
          </div>
          <div className="process on-blue fade-in" id="how">
            <h2>How your application works</h2>
            <ol>
              {STEPS.map(([title, text]) => <li key={title}><div><strong>{title}</strong><span>{text}</span></div></li>)}
            </ol>
          </div>
        </div>
      </section>

      <section className="section section--tint" id="benefits" aria-labelledby="benefits-title">
        <div className="section__inner">
          <h2 id="benefits-title">Why apply with MoMo Loan</h2>
          <ul className="cards">
            {BENEFITS.map(([icon, title, text]) => (
              <li key={title} className="feature"><span className="feature__icon"><Icon name={icon} size={20} /></span><h3>{title}</h3><p>{text}</p></li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section" id="eligibility" aria-labelledby="req-title">
        <div className="section__inner">
          <h2 id="req-title">Before you start</h2>
          <p className="section__lead">Check that you meet these requirements.</p>
          <ul className="cards cards--3">
            {ELIGIBILITY.map(([title, text]) => <li key={title} className="feature"><h3>{title}</h3><p>{text}</p></li>)}
          </ul>
        </div>
      </section>

      <section className="section section--tint" id="faq" aria-labelledby="faq-title">
        <div className="section__inner section__inner--narrow">
          <h2 id="faq-title">Frequently asked questions</h2>
          <div className="faq">
            {FAQ.map(([q, a]) => (
              <details key={q}><summary>{q}</summary><p>{a}</p></details>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="help" aria-labelledby="help-title">
        <div className="section__inner section__inner--narrow">
          <div className="cta">
            <div>
              <h2 id="help-title">Need help?</h2>
              <p>Sign in to see your application status, the next step and your full history. {(SUPPORT_EMAIL || SUPPORT_PHONE) ? 'You can also contact us:' : ''}</p>
              {(SUPPORT_EMAIL || SUPPORT_PHONE) && (
                <ul className="contact">
                  {SUPPORT_EMAIL && <li>Email: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></li>}
                  {SUPPORT_PHONE && <li>Phone: <a href={`tel:${SUPPORT_PHONE.replace(/\s+/g, '')}`}>{SUPPORT_PHONE}</a></li>}
                </ul>
              )}
            </div>
            <div className="cta__actions">
              {user ? <Link className="btn btn--primary" to="/dashboard">Go to my dashboard</Link> : (
                <><Link className="btn btn--primary" to="/register">Create Account</Link><Link className="btn btn--outline" to="/login">Sign In</Link></>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
