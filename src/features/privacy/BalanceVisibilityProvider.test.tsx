import { afterEach, beforeEach, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import { AuthContext } from '../auth/auth-context'
import type { AuthState } from '../auth/auth-context'
import { BalanceVisibilityProvider } from './BalanceVisibilityProvider'
import { BalanceVisibilityToggle } from './BalanceVisibilityToggle'
import { useBalanceVisibility } from './balance-visibility-context'

const auth = (id: string): AuthState => ({ user: { id } as User, session: null, profile: null, loading: false, error: null })

function State() {
  const { hidden } = useBalanceVisibility()
  return <output>{hidden ? 'oculto' : 'visível'}</output>
}

function page(id: string) {
  return <AuthContext.Provider value={auth(id)}><BalanceVisibilityProvider><BalanceVisibilityToggle/><State/></BalanceVisibilityProvider></AuthContext.Provider>
}

beforeEach(() => localStorage.clear())
afterEach(cleanup)

test('persiste a preferência somente para o usuário autenticado', () => {
  localStorage.setItem('app-financeiro:balances-hidden:user-1', 'true')
  const view = render(page('user-1'))
  expect(screen.getByText('oculto')).toBeTruthy()

  view.rerender(page('user-2'))
  expect(screen.getByText('visível')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Ocultar saldos e limites' }))
  expect(localStorage.getItem('app-financeiro:balances-hidden:user-2')).toBe('true')
  expect(localStorage.getItem('app-financeiro:balances-hidden:user-1')).toBe('true')
})

test('o mesmo controle alterna entre ocultar e mostrar', () => {
  render(page('user-1'))
  fireEvent.click(screen.getByRole('button', { name: 'Ocultar saldos e limites' }))
  expect(screen.getByText('oculto')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar saldos e limites' }))
  expect(screen.getByText('visível')).toBeTruthy()
})
