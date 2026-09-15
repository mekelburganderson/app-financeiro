import { getSupabaseClient } from '../lib/supabase'

export async function signIn(email: string, password: string) {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error) throw error
  return data
}

export async function signUp(email: string, password: string, fullName?: string) {
  const { data, error } = await getSupabaseClient().auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: { full_name: fullName?.trim() || null },
      emailRedirectTo: window.location.origin,
    },
  })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await getSupabaseClient().auth.signOut({ scope: 'local' })
  if (error) throw error
}
