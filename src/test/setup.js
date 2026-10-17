import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => cleanup())

// jsdom does not implement the modal <dialog> API used by ConfirmDialog.
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal ||= function showModal() { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close ||= function close() { this.removeAttribute('open') }
}
