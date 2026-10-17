import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const ToastContext = createContext(() => {})
// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext(ToastContext)

// toast(title, body?, tone?)  tone: 'info' (default) | 'success' | 'error'
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const push = useCallback((title, body, tone = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t.slice(-3), { id, title, body, tone }])
    setTimeout(() => dismiss(id), 6000)
  }, [dismiss])
  const value = useMemo(() => push, [push])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="region" aria-label="Notifications" aria-live="polite">
        {toasts.map((t) => (
          <div className={`toast toast--${t.tone}`} key={t.id} role={t.tone === 'error' ? 'alert' : 'status'}>
            <div className="toast__text"><strong>{t.title}</strong>{t.body && <span>{t.body}</span>}</div>
            <button type="button" className="toast__close" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">&times;</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
