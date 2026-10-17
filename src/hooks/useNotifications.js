import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRealtime } from './useRealtime'

// Database-backed notifications. RLS guarantees an applicant only receives their own and only
// administrators receive the administrator ones. `onNew` fires for notifications that arrive while the app is open.
export function useNotifications(userId, onNew) {
  const [items, setItems] = useState([])
  const seen = useRef(null)
  const onNewRef = useRef(onNew)
  useEffect(() => { onNewRef.current = onNew })

  const load = useCallback(async () => {
    const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(40)
    if (!data) return
    if (seen.current === null) seen.current = new Set(data.map((n) => n.id))
    else data.filter((n) => !seen.current.has(n.id)).forEach((n) => { seen.current.add(n.id); onNewRef.current?.(n) })
    setItems(data)
  }, [])

  useEffect(() => { seen.current = null; load() }, [load, userId])
  useRealtime({ name: 'notifications', tables: ['notifications'], onChange: load, pollMs: 10000 })

  const markRead = useCallback(async (id) => {
    setItems((list) => list.map((n) => (n.id === id ? { ...n, read_at: n.read_at || new Date().toISOString() } : n)))
    await supabase.rpc('mark_notification_read', { p_id: id })
  }, [])
  const markAllRead = useCallback(async () => {
    setItems((list) => list.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })))
    await supabase.rpc('mark_all_notifications_read')
  }, [])

  return { items, unread: items.filter((n) => !n.read_at).length, markRead, markAllRead, reload: load }
}
