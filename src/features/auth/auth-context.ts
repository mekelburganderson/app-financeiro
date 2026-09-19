import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { Profile } from '../../services/profile'

export interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  error: string | null
}

export const AuthContext = createContext<AuthState | null>(null)
