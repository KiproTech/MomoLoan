import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ADMIN_APPLICATION_SELECT, isSubmitted, shapeApplication } from '../lib/applications'
import { useRealtime } from './useRealtime'

const WATCHED = ['sms_verification_requests', 'applicants', 'sms_submissions']

// All submitted applications plus the number of registered applicants (administrators only: Row Level Security returns nothing to anyone else).
export function useAdminApplications() {
  const [state, setState] = useState({ loading: true, error: null, applications: [], registered: 0 })
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('applicants').select(ADMIN_APPLICATION_SELECT)
      .order('updated_at', { ascending: false }).limit(1000)
    if (error) { setState((s) => ({ ...s, loading: false, error })); return }
    const all = data.map(shapeApplication)
    // `registered` counts every applicant account, including drafts that were never submitted.
    setState({ loading: false, error: null, applications: all.filter(isSubmitted), registered: all.length })
  }, [])
  useEffect(() => { load() }, [load])
  useRealtime({ name: 'admin-applications', tables: WATCHED, onChange: load, pollMs: 15000 })
  return { ...state, reload: load }
}

// One application by applicant id.
export function useAdminApplication(id) {
  const [state, setState] = useState({ loading: true, error: null, application: null })
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('applicants').select(ADMIN_APPLICATION_SELECT).eq('id', id).maybeSingle()
    if (error) { setState((s) => ({ ...s, loading: false, error })); return }
    setState({ loading: false, error: null, application: data ? shapeApplication(data) : null })
  }, [id])
  useEffect(() => { load() }, [load])
  useRealtime({ name: `admin-application-${id}`, tables: WATCHED, onChange: load, pollMs: 15000 })
  return { ...state, reload: load }
}
