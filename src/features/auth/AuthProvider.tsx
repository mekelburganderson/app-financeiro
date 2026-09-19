import { useEffect, useState } from 'react'
import type { PropsWithChildren } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { getProfile } from '../../services/profile'
import type { Profile } from '../../services/profile'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(supabase !== null)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    if (!supabase) return

    let active = true
    let receivedAuthEvent = false
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      receivedAuthEvent = true
      setSession(nextSession)
      setLoading(false)
      setError(null)
    })

    void supabase.auth.getSession().then(
      ({ data: current, error: sessionError }) => {
        if (!active || receivedAuthEvent) return
        setSession(current.session)
        setError(sessionError?.message ?? null)
        setLoading(false)
      },
      () => {
        if (!active || receivedAuthEvent) return
        setError('Não foi possível recuperar a sessão. Atualize a página para tentar novamente.')
        setLoading(false)
      },
    )

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    let active = true
    void getProfile(userId).then(
      (nextProfile) => { if (active) setProfile(nextProfile) },
      () => { if (active) setProfile(null) },
    )
    return () => { active = false }
  }, [userId])

  const currentProfile = profile?.id === userId ? profile : null

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile: currentProfile, loading, error }}>
      {children}
    </AuthContext.Provider>
  )
}
