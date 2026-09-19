import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { App } from './App'
import { AuthContext } from './features/auth/auth-context'
import type { AuthState } from './features/auth/auth-context'
import { signInWithGoogle, signOut } from './services/auth'

vi.mock('./services/auth', () => ({ signOut: vi.fn(async () => undefined), signInWithGoogle: vi.fn() }))
vi.mock('./lib/supabase', () => ({ supabaseConfigurationError: null }))

const user = { id: 'user-1', email: 'pessoa@example.test', aud: 'authenticated',
  app_metadata: {}, created_at: '2026-01-01', user_metadata: { full_name: 'Pessoa Teste' } } as User
const baseState: AuthState = { session: null, user: null, profile: null, loading: false, error: null }

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

function mount(path: string, state: AuthState) {
  return render(<MemoryRouter initialEntries={[path]}>
    <AuthContext.Provider value={state}><App /><Location /></AuthContext.Provider>
  </MemoryRouter>)
}

beforeEach(() => { vi.clearAllMocks(); localStorage.clear() })
afterEach(cleanup)

test('private route waits for the session and never flashes login', () => {
  mount('/contas', { ...baseState, loading: true })
  expect(screen.getByText('Preparando sua sessão…')).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Entre na sua conta' })).toBeNull()
  expect(screen.getByTestId('location').textContent).toBe('/contas')
})

test('anonymous users go to login from every private route', async () => {
  for (const path of ['/', '/despesas', '/receitas', '/transferencias', '/cartoes', '/faturas', '/contas', '/categorias']) {
    const view = mount(path, baseState)
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/login'))
    expect(screen.getByRole('heading', { name: 'Entre na sua conta' })).toBeTruthy()
    view.unmount()
  }
})

test('Google login disables its button while the redirect is in progress', async () => {
  vi.mocked(signInWithGoogle).mockReturnValueOnce(new Promise(() => undefined))
  mount('/login', baseState)
  const button = screen.getByRole('button', { name: 'Entrar com Google' })
  fireEvent.click(button)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Redirecionando…' }).hasAttribute('disabled')).toBe(true))
  expect(signInWithGoogle).toHaveBeenCalledTimes(1)
})

test('Google login returns to the private route originally requested', async () => {
  vi.mocked(signInWithGoogle).mockResolvedValueOnce({ url: 'https://example.test/oauth', provider: 'google' })
  mount('/despesas', baseState)
  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/login'))
  fireEvent.click(screen.getByRole('button', { name: 'Entrar com Google' }))
  await waitFor(() => expect(signInWithGoogle).toHaveBeenCalledWith('/despesas'))
})

test('login errors show a friendly message and allow retry', async () => {
  vi.mocked(signInWithGoogle).mockRejectedValueOnce(new Error('internal provider detail'))
  mount('/login', baseState)
  fireEvent.click(screen.getByRole('button', { name: 'Entrar com Google' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Não foi possível realizar o login'))
  expect(screen.queryByText('internal provider detail')).toBeNull()
  expect(screen.getByRole('button', { name: 'Entrar com Google' }).hasAttribute('disabled')).toBe(false)
})

test('signed-in users skip login and can navigate each placeholder', async () => {
  const state = { ...baseState, user }
  const view = mount('/login', state)
  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'))
  expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy()
  expect(screen.getByTitle('Pessoa Teste')).toBeTruthy()
  view.unmount()

  mount('/', state)
  for (const [label, path] of [
    ['Despesas', '/despesas'], ['Receitas', '/receitas'], ['Transferências', '/transferencias'], ['Cartões', '/cartoes'],
    ['Faturas', '/faturas'], ['Contas', '/contas'], ['Categorias', '/categorias'],
  ]) {
    fireEvent.click(screen.getByRole('link', { name: label }))
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe(path))
    expect(await screen.findByRole('heading', { name: label, level: 1 })).toBeTruthy()
    expect(screen.getByRole('link', { name: label }).getAttribute('aria-current')).toBe('page')
  }
})

test('logout invokes Supabase and the guard returns to login when the session closes', async () => {
  const state = { ...baseState, user }
  const view = mount('/contas', state)
  fireEvent.click(screen.getByRole('button', { name: 'Sair da conta' }))
  await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
  view.rerender(<MemoryRouter initialEntries={['/contas']}>
    <AuthContext.Provider value={baseState}><App /><Location /></AuthContext.Provider>
  </MemoryRouter>)
  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/login'))
})
