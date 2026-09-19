import { getSupabaseClient } from '../lib/supabase'
import type { Tables } from '../types/database'

export type Profile = Pick<Tables<'profiles'>, 'id' | 'full_name' | 'avatar_url'>

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .select('id, full_name, avatar_url')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}
