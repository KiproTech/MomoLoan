import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// Subscribe to Postgres changes (Supabase Realtime; RLS still filters what each user receives)
// and poll as a safety net, so screens stay current even if Realtime is not enabled on the project.
export function useRealtime({ name, tables, filter, onChange, pollMs = 12000 }) {
  const cb = useRef(onChange)
  useEffect(() => { cb.current = onChange })

  useEffect(() => {
    let channel = supabase.channel(`${name}-${Math.random().toString(36).slice(2, 8)}`)
    tables.forEach((table) => {
      const spec = { event: '*', schema: 'public', table }
      if (filter && filter[table]) spec.filter = filter[table]
      channel = channel.on('postgres_changes', spec, (payload) => cb.current?.(payload, table))
    })
    channel.subscribe()
    const timer = pollMs ? setInterval(() => cb.current?.(null, 'poll'), pollMs) : null
    return () => { if (timer) clearInterval(timer); supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, tables.join(','), JSON.stringify(filter || {}), pollMs])
}
