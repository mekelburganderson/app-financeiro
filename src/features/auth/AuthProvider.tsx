import { useEffect, useState } from 'react'
import type { PropsWithChildren } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(supabase !== null)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, error }}>
      {children}
    </AuthContext.Provider>
  )
}
