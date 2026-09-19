import { beforeEach, expect, test, vi } from 'vitest'
import { signInWithGoogle, signOut } from './auth'

const authMock = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(async () => ({ data: { url: 'https://example.test/oauth' }, error: null })),
  signOut: vi.fn(async () => ({ error: null })),
}))

vi.mock('../lib/supabase', () => ({
  getSupabaseClient: () => ({ auth: authMock }),
}))

beforeEach(() => vi.clearAllMocks())

test('Google OAuth returns to the current application origin', async () => {
  await signInWithGoogle()
  expect(authMock.signInWithOAuth).toHaveBeenCalledWith({
    provider: 'google', options: { redirectTo: `${window.location.origin}/` },
  })
})

test.each([
  '/despesas', '/receitas', '/faturas', '/contas', '/cartoes', '/categorias', '/transferencias',
  '/despesas?month=2026-09#resumo',
])('Google OAuth preserves the internal route %s', async (returnPath) => {
  await signInWithGoogle(returnPath)
  expect(authMock.signInWithOAuth).toHaveBeenCalledWith({
    provider: 'google', options: { redirectTo: `${window.location.origin}${returnPath}` },
  })
})

test.each([
  '//malicious.example/path',
  'https://malicious.example/path',
  '/\\malicious.example/path',
  '/\t/malicious.example/path',
  '/\n/malicious.example/path',
  '/\r/malicious.example/path',
  '/\\[invalid-host',
  'javascript:alert(1)',
])('Google OAuth rejects unsafe or malformed return address %j', async (returnPath) => {
  await signInWithGoogle(returnPath)
  expect(authMock.signInWithOAuth).toHaveBeenCalledWith({
    provider: 'google', options: { redirectTo: `${window.location.origin}/` },
  })
})

test('logout closes the Supabase session', async () => {
  await signOut()
  expect(authMock.signOut).toHaveBeenCalledWith()
})
