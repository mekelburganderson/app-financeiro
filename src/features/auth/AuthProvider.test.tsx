import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Session, User } from '@supabase/supabase-js'
import { useAuth } from '../../hooks/useAuth'
import { AuthProvider } from './AuthProvider'

const authMock = vi.hoisted(() => ({
  getSession: vi.fn(),
  callbacks: [] as Array<(event: string, session: Session | null) => void>,
  unsubscribe: vi.fn(),
}))
const profileMock = vi.hoisted(() => ({ getProfile: vi.fn() }))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: authMock.getSession,
      onAuthStateChange: (callback: (event: string, session: Session | null) => void) => {
        authMock.callbacks.push(callback)
        return { data: { subscription: { unsubscribe: authMock.unsubscribe } } }
      },
    },
  },
}))
vi.mock('../../services/profile', () => ({
  getProfile: profileMock.getProfile,
}))

const user = { id: 'user-1', email: 'pessoa@example.test', user_metadata: {} } as User
const session = { user, access_token: 'test-token' } as Session

function StateProbe() {
  const { user: currentUser, profile, loading } = useAuth()
  return <output>{loading ? 'Recuperando' : currentUser ? `${currentUser.id}: ${profile?.full_name ?? 'profile pendente'}` : 'Sem sessão'}</output>
}

beforeEach(() => {
  vi.clearAllMocks()
  authMock.callbacks.length = 0
  profileMock.getProfile.mockResolvedValue({ id: 'user-1', full_name: 'Pessoa Teste', avatar_url: null })
})
afterEach(cleanup)

test('recovers a persisted session before rendering anonymous state, including after refresh', async () => {
  let finish!: (value: unknown) => void
  authMock.getSession.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
  const first = render(<AuthProvider><StateProbe /></AuthProvider>)
  expect(screen.getByText('Recuperando')).toBeTruthy()
  expect(screen.queryByText('Sem sessão')).toBeNull()
  await act(async () => finish({ data: { session }, error: null }))
  await waitFor(() => expect(screen.getByText('user-1: Pessoa Teste')).toBeTruthy())
  first.unmount()

  authMock.getSession.mockResolvedValueOnce({ data: { session }, error: null })
  render(<AuthProvider><StateProbe /></AuthProvider>)
  expect(screen.getByText('Recuperando')).toBeTruthy()
  await waitFor(() => expect(screen.getByText('user-1: Pessoa Teste')).toBeTruthy())
  expect(authMock.getSession).toHaveBeenCalledTimes(2)
})

test('responds to auth state changes and clears the session on logout', async () => {
  authMock.getSession.mockResolvedValue({ data: { session }, error: null })
  render(<AuthProvider><StateProbe /></AuthProvider>)
  await waitFor(() => expect(screen.getByText('user-1: Pessoa Teste')).toBeTruthy())
  await act(async () => authMock.callbacks.at(-1)?.('SIGNED_OUT', null))
  await waitFor(() => expect(screen.getByText('Sem sessão')).toBeTruthy())
})

test('keeps the signed-in session usable while the profile is not available yet', async () => {
  profileMock.getProfile.mockResolvedValueOnce(null)
  authMock.getSession.mockResolvedValueOnce({ data: { session }, error: null })
  render(<AuthProvider><StateProbe /></AuthProvider>)
  await waitFor(() => expect(screen.getByText('user-1: profile pendente')).toBeTruthy())
})
