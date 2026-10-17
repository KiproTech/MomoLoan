import { Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useNotifications } from '../hooks/useNotifications'
import { SiteFooter, SkipLink } from './PublicLayout'
import SiteHeader from './SiteHeader'
import NotificationBell from './NotificationBell'
import { Button } from './ui'

const LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/application', label: 'My application' },
  { to: '/history', label: 'History' },
  { to: '/profile', label: 'Profile' },
]

// Frame for signed-in applicants. Contains no administrator navigation.
export default function ApplicantLayout() {
  const { user, signOut } = useAuth()
  const toast = useToast()
  const notes = useNotifications(user.id, (n) => toast(n.title, n.body))
  return (
    <>
      <SkipLink />
      <SiteHeader brandTo="/dashboard" links={LINKS} extras={<NotificationBell {...notes} />}
        actions={<Button tone="outline" size="sm" onClick={signOut}>Sign out</Button>} />
      <div id="main" tabIndex={-1} className="page">
        <Outlet context={{ notes }} />
      </div>
      <SiteFooter />
    </>
  )
}
