import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { shapeApplication } from '../lib/applications'
import { useRealtime } from './useRealtime'

// Everything the applicant is allowed to see. Row Level Security returns only this user's rows, and the
// "Awaiting SMS Verification" status only exists after an administrator confirmed the SMS was sent.
export function useApplicantData(userId) {
  const [state, setState] = useState({ loading: true, error: null, application: null })

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('applicants')
        .select('*, sms_verification_requests(*, sms_submissions(*), verification_decisions(*))')
        .eq('user_id', userId).maybeSingle()
      if (error) throw error
      let application = null
      if (data) {
        const events = await supabase.from('request_events').select('*').eq('applicant_id', data.id).order('id', { ascending: true })
        if (events.error) throw events.error
        application = shapeApplication(data)
        application.events = events.data || []
      }
      setState({ loading: false, error: null, application })
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err }))
    }
  }, [userId])

  useEffect(() => { load() }, [load])
  useRealtime({
    name: 'applicant', tables: ['applicants', 'sms_verification_requests'],
    filter: { applicants: `user_id=eq.${userId}`, sms_verification_requests: `user_id=eq.${userId}` },
    onChange: load,
  })
  return { ...state, reload: load }
}
