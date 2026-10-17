import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useNotifications } from '../hooks/useNotifications'
import Icon from './Icon'
import Logo from './Logo'
import NotificationBell from './NotificationBell'
import { SkipLink } from './PublicLayout'
import { Button } from './ui'

const NAV = [
  { to: '/admin', label: 'Overview', icon: 'grid', end: true },
  { to: '/admin/applications', label: 'Applications', icon: 'list' },
  { to: '/admin/activity', label: 'Activity log', icon: 'clock' },
  { to: '/admin/account', label: 'Account', icon: 'user' },
]

// Administrator console frame: sidebar on desktop, slide-over menu on small screens.
export default function AdminLayout() {
  const { user, signOut } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const notes = useNotifications(user.id, (n) => toast(n.title, n.body))

  return (
    <div className="admin">
      <SkipLink />
      {open && <button type="button" className="scrim" aria-label="Close menu" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'is-open' : ''}`} aria-label="Administrator navigation">
        <div className="brand">
          <Logo height={40} />
          <span>MoMo Loan<small>Administration</small></span>
        </div>
        <nav aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)}><Icon name={n.icon} />{n.label}</NavLink>
          ))}
        </nav>
        <div className="sidebar__foot">Signed in as<br />{user.email}</div>
      </aside>
      <div className="admin__main">
        <header className="admin-top">
          <button type="button" className="icon-btn admin-top__menu" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}><Icon name="menu" size={22} /></button>
          <span className="grow" />
          <NotificationBell {...notes} onSelect={(n) => { if (n.applicant_id) navigate(`/admin/applications/${n.applicant_id}`) }} />
          <Button tone="outline" size="sm" onClick={signOut}>Sign out</Button>
        </header>
        <main id="main" tabIndex={-1} className="admin-content" style={{ outline: 'none' }}><Outlet /></main>
      </div>
    </div>
  )
}
