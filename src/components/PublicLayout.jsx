import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import SiteHeader, { Brand } from './SiteHeader'
import Logo from './Logo'

export { Brand }

export const SkipLink = () => <a className="skip-link" href="#main">Skip to main content</a>

const YEAR = new Date().getFullYear()

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <Logo height={36} />
          <div><strong>MoMo Loan</strong><span>Apply, verify and track your loan application online.</span></div>
        </div>
        <ul className="site-footer__links" aria-label="Footer">
          <li><Link to="/register">Apply for a loan</Link></li>
          <li><Link to="/login">Sign in</Link></li>
          <li><Link to={{ pathname: '/', hash: 'faq' }}>FAQ</Link></li>
          <li><Link to={{ pathname: '/', hash: 'help' }}>Help</Link></li>
        </ul>
      </div>
      <div className="site-footer__legal">&copy; {YEAR} MoMo Loan</div>
    </footer>
  )
}

const LINKS = [
  { to: '/', hash: 'how', label: 'How it works' },
  { to: '/', hash: 'benefits', label: 'Benefits' },
  { to: '/', hash: 'eligibility', label: 'Eligibility' },
  { to: '/', hash: 'faq', label: 'FAQ' },
  { to: '/', hash: 'help', label: 'Help' },
]

// Frame for the landing, sign-in and registration pages. Applicant actions only.
// A visitor who is already signed in sees "My dashboard" instead of the sign-in buttons.
export default function PublicLayout() {
  const { user } = useAuth()
  const actions = user
    ? <Link className="btn btn--primary btn--sm" to="/dashboard">My dashboard</Link>
    : <><Link className="btn btn--outline btn--sm" to="/login">Sign in</Link><Link className="btn btn--primary btn--sm" to="/register">Create account</Link></>
  return (
    <>
      <SkipLink />
      <SiteHeader links={LINKS} actions={actions} />
      <div id="main" tabIndex={-1} className="page">
        <Outlet />
      </div>
      <SiteFooter />
    </>
  )
}
