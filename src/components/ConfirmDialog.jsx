import { useEffect, useRef } from 'react'
import { Button } from './ui'

// Modal confirmation built on the native <dialog> element (focus trap, Escape to close, backdrop).
// While `busy`, closing is blocked and the confirm button is disabled, so an action cannot be sent twice.
export default function ConfirmDialog({ open, title, children, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'dark', busy = false, confirmDisabled = false, onConfirm, onCancel }) {
  const ref = useRef(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="dialog-title"
      onCancel={(e) => { e.preventDefault(); if (!busy) onCancel() }}
      onClick={(e) => { if (e.target === ref.current && !busy) onCancel() }}>
      {open && (
        <form method="dialog" onSubmit={(e) => { e.preventDefault(); if (!busy && !confirmDisabled) onConfirm() }}>
          <div className="dialog__body">
            <h2 id="dialog-title">{title}</h2>
            {children}
          </div>
          <div className="dialog__foot">
            <Button tone="outline" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
            <Button type="submit" tone={tone} busy={busy} disabled={confirmDisabled}>{confirmLabel}</Button>
          </div>
        </form>
      )}
    </dialog>
  )
}
