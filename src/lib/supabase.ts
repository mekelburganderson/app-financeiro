import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

function getConfigurationError(): string | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    return 'Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.local.'
  }

  try {
    const url = new URL(supabaseUrl)
    if (!['http:', 'https:'].includes(url.protocol)) {
      return 'VITE_SUPABASE_URL precisa ser uma URL HTTP ou HTTPS válida.'
    }
  } catch {
    return 'VITE_SUPABASE_URL precisa ser uma URL HTTP ou HTTPS válida.'
  }

  return null
}

export const supabaseConfigurationError = getConfigurationError()

export const supabase =
  !supabaseConfigurationError && supabaseUrl && supabaseAnonKey
    ? createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null

export function getSupabaseClient() {
  if (!supabase) {
    throw new Error(supabaseConfigurationError ?? 'Supabase não configurado.')
  }

  return supabase
}
