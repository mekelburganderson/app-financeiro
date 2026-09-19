import { getSupabaseClient } from '../lib/supabase'

function safeReturnUrl(returnPath: string) {
  const origin = window.location.origin
  const fallback = new URL('/', origin).toString()
  if (!returnPath.startsWith('/') || returnPath.startsWith('//')) return fallback

  try {
    const url = new URL(returnPath, origin)
    // URL parsing normalizes backslashes and control characters before resolving the host.
    return url.origin === origin ? url.toString() : fallback
  } catch {
    return fallback
  }
}

export async function signInWithGoogle(returnPath = '/') {
  const { data, error } = await getSupabaseClient().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: safeReturnUrl(returnPath) },
  })
  if (error) throw error
  return data
}

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
  const { error } = await getSupabaseClient().auth.signOut()
  if (error) throw error
}
