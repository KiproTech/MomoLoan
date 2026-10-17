import { createClient } from '@supabase/supabase-js'
import { STATUS_PHRASE } from './status'

const url = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

// True only when real values replaced the .env placeholders.
export const isSupabaseConfigured =
  /^https?:\/\//.test(url) && !url.includes('YOUR_') && anonKey.length > 20 && !anonKey.includes('YOUR_')

// Only the PUBLIC anon/publishable key is ever used in the browser.
// All privileged work happens in SECURITY DEFINER database functions (see supabase/*.sql).
//
// Two portals, two sessions: Supabase keeps its login in localStorage, which every tab of a browser shares.
// With a single client, signing in as an applicant in a second tab would replace the administrator's session
// in the first. So the administrator area (/admin/*) and the applicant portal each get their own client with
// their own storage key. An administrator and an applicant can then be signed in side by side, in different tabs
// of the same browser, and signing out of one never affects the other.
export const portalFor = (pathname = '') => (pathname === '/admin' || pathname.startsWith('/admin/') ? 'admin' : 'applicant')

const STORAGE_KEY = { admin: 'momo-loan-admin-auth', applicant: 'momo-loan-applicant-auth' }
const clients = {}

export function getClient(portal) {
  if (!isSupabaseConfigured) return null
  clients[portal] ||= createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: STORAGE_KEY[portal] },
  })
  return clients[portal]
}

// `supabase` forwards every call to the client of the portal the page is currently in. The choice is made at
// call time from the address, so existing code keeps using `supabase.from(...)`, `supabase.rpc(...)` unchanged.
export const supabase = isSupabaseConfigured
  ? new Proxy({}, {
    get(_target, prop) {
      const client = getClient(portalFor(window.location.pathname))
      const value = client[prop]
      return typeof value === 'function' ? value.bind(client) : value
    },
  })
  : null

// SQLSTATE codes raised on purpose by our own database functions. Their messages are written for
// people, so they can be shown as-is. Anything else (constraint names, SQL text, stack details) is
// replaced with a generic message so internals are never leaked to the interface.
const FRIENDLY_CODES = new Set(['22023', '28000', '42501', '55000', 'P0002', 'check_violation'])

// "...is sms_sent..." -> "...is awaiting SMS verification..."
const humanizeStatuses = (msg) =>
  msg.replace(/\b(pending_registration|pending_admin_action|sms_sent|pending_admin_validation|approved|rejected|expired)\b/g,
    (s) => STATUS_PHRASE[s])

export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback
  if (error.userMessage) return error.userMessage // raised by our own code with wording written for people
  const msg = String(error.message || '')
  if (/Invalid login credentials/i.test(msg)) return 'Incorrect email or password.'
  if (/User already registered/i.test(msg)) return 'An account with this email already exists. Try signing in.'
  if (/Email not confirmed/i.test(msg)) return 'Confirm your email address using the link we sent, then sign in.'
  if (/password.*(weak|short|least)|weak password/i.test(msg)) return 'Choose a stronger password of at least 8 characters.'
  if (/should be different|same as the old/i.test(String(error.message || ''))) return 'Choose a password you have not used before.'
  if (/rate limit|only request this after|too many/i.test(msg)) return 'Too many attempts. Wait a moment and try again.'
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Cannot reach the service. Check your internet connection and try again.'
  if (/permission denied|row-level security/i.test(msg)) return 'You do not have permission to do that.'
  if (error.code === '42501' && msg) return humanizeStatuses(msg)
  if (FRIENDLY_CODES.has(error.code) && msg) return humanizeStatuses(msg)
  return fallback
}
