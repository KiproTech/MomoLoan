import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import Icon from './Icon'
import Logo from './Logo'

export const Brand = ({ to = '/', sub }) => (
  <Link to={to} className="brand" aria-label="MoMo Loan home">
    <Logo height={40} />
    <span>MoMo Loan{sub && <small>{sub}</small>}</span>
  </Link>
)

// Shared header for the public site and the applicant portal.
//   links:   [{ to, label, end?, hash? }]  hash links point at sections of the landing page
//   extras:  always visible on the right (e.g. the notification bell)
//   actions: buttons shown on the right on wide screens and inside the menu on narrow screens
export default function SiteHeader({ brandTo = '/', links, extras, actions }) {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const ref = useRef(null)
  const close = () => setOpen(false)

  useEffect(() => {
    if (!open) return
    const outside = (e) => { if (!ref.current?.contains(e.target)) close() }
    const esc = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', esc) }
  }, [open])
  // Close the menu when the page changes.
  useEffect(() => { const t = setTimeout(close, 0); return () => clearTimeout(t) }, [pathname])

  return (
    <header className="site-header" ref={ref}>
      <div className="site-header__inner">
        <Brand to={brandTo} />
        <nav className={`menu ${open ? 'menu--open' : ''}`} id="site-menu" aria-label="Main">
          <ul className="menu__links">
            {links.map((l) => (
              <li key={l.to + (l.hash || '')}>
                {l.hash
                  ? <Link to={{ pathname: l.to, hash: l.hash }} onClick={close}>{l.label}</Link>
                  : <NavLink to={l.to} end={l.end} onClick={close}>{l.label}</NavLink>}
              </li>
            ))}
          </ul>
          {actions && <div className="menu__actions" onClick={(e) => { if (e.target.closest('a')) close() }}>{actions}</div>}
        </nav>
        <span className="grow" />
        {extras}
        {actions && <div className="header-actions">{actions}</div>}
        <button type="button" className="icon-btn nav-toggle" aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen(!open)}>
          <Icon name={open ? 'x' : 'menu'} size={22} />
          <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
        </button>
      </div>
    </header>
  )
}
