import { useEffect, useRef, useState } from 'react'
import { timeAgo } from '../lib/format'
import Icon from './Icon'

export default function NotificationBell({ items, unread, markRead, markAllRead, onSelect }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  return (
    <div className="bell" ref={ref}>
      <button type="button" className="icon-btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="bell" size={20} />
        <span className="sr-only">Notifications{unread ? `, ${unread} unread` : ''}</span>
        {unread > 0 && <span className="bell__count" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="panel" role="region" aria-label="Notifications">
          <div className="panel__head">
            <strong>Notifications</strong>
            {unread > 0 && <button type="button" className="btn btn--ghost btn--sm" onClick={markAllRead}>Mark all as read</button>}
          </div>
          {items.length === 0 ? <div className="panel__empty">You have no notifications.</div> : (
            <ul className="panel__list">
              {items.map((n) => (
                <li key={n.id}>
                  <button type="button" className={`notif ${n.read_at ? '' : 'notif--unread'}`}
                    onClick={() => { markRead(n.id); setOpen(false); onSelect?.(n) }}>
                    <div className="notif__title">{n.title}</div>
                    <div className="notif__body">{n.body}</div>
                    <div className="notif__time">{timeAgo(n.created_at)}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
