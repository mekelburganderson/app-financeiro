import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import { AuthContext } from '../features/auth/auth-context'
import type { AuthState } from '../features/auth/auth-context'
import { BalanceVisibilityProvider } from '../features/privacy/BalanceVisibilityProvider'
import { BalanceVisibilityToggle } from '../features/privacy/BalanceVisibilityToggle'
import type { AccountWithBalance } from '../features/accounts/types'
import { AccountsPage } from './AccountsPage'
import { createAccount, deactivateAccount, hasAccountMovements, listAccounts, reactivateAccount, updateAccount } from '../features/accounts/services/accounts'

vi.mock('../features/accounts/services/accounts', () => ({
  listAccounts: vi.fn(), createAccount: vi.fn(), updateAccount: vi.fn(),
  deactivateAccount: vi.fn(), reactivateAccount: vi.fn(), hasAccountMovements: vi.fn(),
}))

const user = { id: 'user-1' } as User
const state: AuthState = { user, session: null, profile: null, loading: false, error: null }
const active: AccountWithBalance = {
  id: 'account-1', user_id: user.id, name: 'Nubank', type: 'checking', initial_balance: 100,
  initial_balance_date: '2026-09-15', current_balance: 1250.5, active: true,
  created_at: '2026-09-15', updated_at: '2026-09-15',
}
const inactive: AccountWithBalance = { ...active, id: 'account-2', name: 'Reserva', type: 'savings', active: false, current_balance: -50 }

function page(authState = state) {
  return <AuthContext.Provider value={authState}><BalanceVisibilityProvider>
    <BalanceVisibilityToggle /><AccountsPage />
  </BalanceVisibilityProvider></AuthContext.Provider>
}
function mount() { return render(page()) }
async function loaded() { await waitFor(() => expect(screen.queryByText('Carregando contas…')).toBeNull()) }
function openNew() { fireEvent.click(screen.getByRole('button', { name: 'Nova conta' })) }
function fill(name = '  Minha conta  ', balance = '1.234,56') {
  fireEvent.change(screen.getByLabelText('Nome da conta *'), { target: { value: name } })
  fireEvent.change(screen.getByLabelText('Saldo inicial (R$) *'), { target: { value: balance } })
  fireEvent.change(screen.getByLabelText('Data do saldo inicial *'), { target: { value: '2026-09-15' } })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.mocked(listAccounts).mockResolvedValue([])
  vi.mocked(createAccount).mockResolvedValue()
  vi.mocked(updateAccount).mockResolvedValue()
  vi.mocked(deactivateAccount).mockResolvedValue()
  vi.mocked(reactivateAccount).mockResolvedValue()
  vi.mocked(hasAccountMovements).mockResolvedValue(false)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

test('1: renders the accounts route content', async () => {
  mount(); await loaded()
  expect(screen.getByRole('heading', { name: 'Contas', level: 1 })).toBeTruthy()
  expect(listAccounts).toHaveBeenCalledWith(user.id)
})
test('2: friendly empty state offers creation', async () => {
  mount(); await loaded()
  expect(screen.getByText('Você ainda não cadastrou nenhuma conta.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrar primeira conta' }))
  expect(screen.getByRole('dialog')).toBeTruthy()
})
test('3: lists active accounts and keeps inactive accounts reachable', async () => {
  vi.mocked(listAccounts).mockResolvedValue([active, inactive]); mount(); await loaded()
  expect(screen.getByText('Nubank')).toBeTruthy()
  expect(screen.queryByText('Reserva')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Inativas/ }))
  expect(screen.getByText('Reserva')).toBeTruthy()
  expect(screen.queryByText('Nubank')).toBeNull()
})
test('4: shows the view balance as BRL and the opening date as BR date', async () => {
  vi.mocked(listAccounts).mockResolvedValue([active]); mount(); await loaded()
  expect(screen.getByText(/R\$\s*1\.250,50/)).toBeTruthy()
  expect(screen.getByText('Saldo inicial em 15/09/2026')).toBeTruthy()
})

test('hides and reveals active and inactive balances without changing accounts', async () => {
  vi.mocked(listAccounts).mockResolvedValue([active, inactive]); mount(); await loaded()
  fireEvent.click(screen.getByRole('button', { name: /Ocultar/i }))
  expect(screen.queryByText(/R\$\s*1\.250,50/)).toBeNull()
  expect(screen.getByText('Nubank')).toBeTruthy()
  expect(screen.getByText('Saldo inicial em 15/09/2026')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: /Inativas/ }))
  expect(screen.getByText('Reserva')).toBeTruthy()
  expect(screen.queryByText(/R\$\s*-?50,00/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Mostrar/i }))
  expect(screen.getByText(/R\$\s*50,00/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /^Ativas/ }))
  expect(screen.getByText(/R\$\s*1\.250,50/)).toBeTruthy()

  expect(listAccounts).toHaveBeenCalledTimes(1)
  expect(createAccount).not.toHaveBeenCalled()
  expect(updateAccount).not.toHaveBeenCalled()
  expect(deactivateAccount).not.toHaveBeenCalled()
  expect(reactivateAccount).not.toHaveBeenCalled()
})
test('5: creates an active account with the authenticated owner and refreshes', async () => {
  mount(); await loaded(); openNew(); fill()
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
  await waitFor(() => expect(createAccount).toHaveBeenCalledWith(user.id, {
    name: 'Minha conta', type: 'checking', initial_balance: 1234.56, initial_balance_date: '2026-09-15',
  }))
  await waitFor(() => expect(screen.getByText('Conta criada com sucesso.')).toBeTruthy())
  expect(listAccounts).toHaveBeenCalledTimes(2)
})
test('6: rejects missing name, balance, and date before calling the API', async () => {
  mount(); await loaded(); openNew()
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
  expect(screen.getByRole('alert').textContent).toContain('nome')
  fill('Nome', '')
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
  expect(screen.getByRole('alert').textContent).toContain('saldo inicial válido')
  fill('Nome', '0')
  fireEvent.change(screen.getByLabelText('Data do saldo inicial *'), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
  expect(screen.getByRole('alert').textContent).toContain('data')
  expect(createAccount).not.toHaveBeenCalled()
})
test('7: accepts a negative opening balance', async () => {
  mount(); await loaded(); openNew(); fill('Caixa', '-50,25')
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
  await waitFor(() => expect(createAccount).toHaveBeenCalledWith(user.id, expect.objectContaining({ initial_balance: -50.25 })))
})
test('8: edits account fields; changed opening with movements requires confirmation', async () => {
  vi.mocked(listAccounts).mockResolvedValue([active]); vi.mocked(hasAccountMovements).mockResolvedValue(true)
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  mount(); await loaded(); fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
  fill('  Conta editada  ', '200,00')
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  await waitFor(() => expect(updateAccount).toHaveBeenCalledWith(user.id, active.id, expect.objectContaining({ name: 'Conta editada', initial_balance: 200 })))
  expect(confirm).toHaveBeenCalledTimes(1)
})
test('9: deactivation confirms and retains the record', async () => {
  vi.mocked(listAccounts).mockResolvedValue([active])
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
  mount(); await loaded(); fireEvent.click(screen.getByRole('button', { name: 'Desativar' }))
  expect(deactivateAccount).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Desativar' }))
  await waitFor(() => expect(deactivateAccount).toHaveBeenCalledWith(user.id, active.id))
  expect(confirm).toHaveBeenCalledTimes(2)
  expect(screen.getByText('Conta desativada com sucesso.')).toBeTruthy()
})
test('10: inactive accounts can be reactivated', async () => {
  vi.mocked(listAccounts).mockResolvedValue([inactive]); mount(); await loaded()
  fireEvent.click(screen.getByRole('button', { name: /Inativas/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Reativar' }))
  await waitFor(() => expect(reactivateAccount).toHaveBeenCalledWith(user.id, inactive.id))
  expect(screen.getByText('Conta reativada com sucesso.')).toBeTruthy()
})
test('11: API errors stay friendly and allow a retry', async () => {
  vi.mocked(createAccount).mockRejectedValueOnce(new Error('raw SQL and RLS error'))
  mount(); await loaded(); openNew(); fill('Conta', '10')
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Não foi possível criar a conta'))
  expect(screen.queryByText('raw SQL and RLS error')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
  await waitFor(() => expect(createAccount).toHaveBeenCalledTimes(2))
})
test('12: pending creation blocks duplicate submits', async () => {
  vi.mocked(createAccount).mockReturnValue(new Promise(() => undefined))
  mount(); await loaded(); openNew(); fill('Conta', '10')
  const submit = screen.getByRole('button', { name: 'Criar conta' })
  fireEvent.click(submit); fireEvent.click(submit)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Salvando…' }).hasAttribute('disabled')).toBe(true))
  expect(createAccount).toHaveBeenCalledTimes(1)
})

test('a changed authenticated owner never sees the previous owner\'s account while loading', async () => {
  vi.mocked(listAccounts).mockResolvedValueOnce([active]).mockReturnValueOnce(new Promise(() => undefined))
  const view = mount(); await loaded()
  expect(screen.getByText('Nubank')).toBeTruthy()
  const nextState: AuthState = { ...state, user: { id: 'user-2' } as User }
  view.rerender(page(nextState))
  expect(screen.queryByText('Nubank')).toBeNull()
  expect(screen.getByText('Carregando contas…')).toBeTruthy()
})
