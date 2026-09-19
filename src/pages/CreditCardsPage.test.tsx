import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import { AuthContext } from '../features/auth/auth-context'
import type { AuthState } from '../features/auth/auth-context'
import { BalanceVisibilityProvider } from '../features/privacy/BalanceVisibilityProvider'
import { BalanceVisibilityToggle } from '../features/privacy/BalanceVisibilityToggle'
import type { CreditCard } from '../features/credit-cards/types'
import { CreditCardsPage } from './CreditCardsPage'
import { CreditCardServiceError, createCreditCard, creditCardHasUsage, deactivateCreditCard, listCreditCards, reactivateCreditCard, updateCreditCard } from '../features/credit-cards/services/creditCards'

vi.mock('../features/credit-cards/services/creditCards', async (importOriginal) => {
  const original = await importOriginal<typeof import('../features/credit-cards/services/creditCards')>()
  return { ...original, listCreditCards: vi.fn(), createCreditCard: vi.fn(), updateCreditCard: vi.fn(),
    deactivateCreditCard: vi.fn(), reactivateCreditCard: vi.fn(), creditCardHasUsage: vi.fn() }
})

const user = { id: 'user-1' } as User
const state: AuthState = { user, session: null, profile: null, loading: false, error: null }
const card: CreditCard = { id: 'card-1', user_id: user.id, name: 'Nubank', limit_amount: 8000,
  closing_day: 25, due_day: 3, active: true, created_at: '2026-09-15', updated_at: '2026-09-15' }
const inactive: CreditCard = { ...card, id: 'card-2', name: 'Reserva', limit_amount: 0, active: false }

function page(authState = state) {
  return <AuthContext.Provider value={authState}><BalanceVisibilityProvider>
    <BalanceVisibilityToggle /><CreditCardsPage />
  </BalanceVisibilityProvider></AuthContext.Provider>
}
function mount() { return render(page()) }
async function loaded() { await waitFor(() => expect(screen.queryByText('Carregando cartões…')).toBeNull()) }
function openNew() { fireEvent.click(screen.getByRole('button', { name: 'Novo cartão' })) }
function fill(name = '  Meu cartão  ', limit = '8.000,50', closing = '25', due = '03') {
  fireEvent.change(screen.getByLabelText('Nome do cartão *'), { target: { value: name } })
  fireEvent.change(screen.getByLabelText('Limite (R$) *'), { target: { value: limit } })
  fireEvent.change(screen.getByLabelText('Dia de fechamento *'), { target: { value: closing } })
  fireEvent.change(screen.getByLabelText('Dia de vencimento *'), { target: { value: due } })
}
function create() { fireEvent.click(screen.getByRole('button', { name: 'Criar cartão' })) }

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.mocked(listCreditCards).mockResolvedValue([])
  vi.mocked(createCreditCard).mockResolvedValue()
  vi.mocked(updateCreditCard).mockResolvedValue()
  vi.mocked(deactivateCreditCard).mockResolvedValue()
  vi.mocked(reactivateCreditCard).mockResolvedValue()
  vi.mocked(creditCardHasUsage).mockResolvedValue(false)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

test('1: renders cards page and loads the authenticated owner', async () => {
  mount(); await loaded()
  expect(screen.getByRole('heading', { name: 'Cartões', level: 1 })).toBeTruthy()
  expect(listCreditCards).toHaveBeenCalledWith(user.id)
})
test('2: empty state offers the first card form', async () => {
  mount(); await loaded()
  expect(screen.getByText('Você ainda não cadastrou nenhum cartão.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrar primeiro cartão' }))
  expect(screen.getByRole('dialog')).toBeTruthy()
})
test('3: list shows registered limit, cycle days and status without derived metrics', async () => {
  vi.mocked(listCreditCards).mockResolvedValue([card]); mount(); await loaded()
  expect(screen.getByText('Nubank')).toBeTruthy()
  expect(screen.getByText('Fecha dia 25')).toBeTruthy()
  expect(screen.getByText('Vence dia 03')).toBeTruthy()
  expect(screen.getByText('Ativo')).toBeTruthy()
  expect(screen.queryByText(/limite disponível/i)).toBeNull()
})
test('4: status filter defaults to active and offers inactive and all', async () => {
  vi.mocked(listCreditCards).mockResolvedValue([card, inactive]); mount(); await loaded()
  expect(screen.queryByText('Reserva')).toBeNull()
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'inactive' } })
  expect(screen.getByText('Reserva')).toBeTruthy()
  expect(screen.queryByText('Nubank')).toBeNull()
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'all' } })
  expect(screen.getByText('Nubank')).toBeTruthy()
})
test('5: registered limit is formatted in Brazilian real', async () => {
  vi.mocked(listCreditCards).mockResolvedValue([card]); mount(); await loaded()
  expect(screen.getByText(/R\$\s*8\.000,00/)).toBeTruthy()
})

test('hides and reveals registered limits for active and inactive cards without changing them', async () => {
  vi.mocked(listCreditCards).mockResolvedValue([card, inactive]); mount(); await loaded()
  fireEvent.click(screen.getByRole('button', { name: /Ocultar/i }))
  expect(screen.queryByText(/R\$\s*8\.000,00/)).toBeNull()
  expect(screen.getByText('Nubank')).toBeTruthy()
  expect(screen.getByText('Fecha dia 25')).toBeTruthy()
  expect(screen.getByText('Vence dia 03')).toBeTruthy()

  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'all' } })
  expect(screen.getByText('Reserva')).toBeTruthy()
  expect(screen.queryByText(/R\$\s*0,00/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Mostrar/i }))
  expect(screen.getByText(/R\$\s*8\.000,00/)).toBeTruthy()
  expect(screen.getByText(/R\$\s*0,00/)).toBeTruthy()

  expect(listCreditCards).toHaveBeenCalledTimes(1)
  expect(createCreditCard).not.toHaveBeenCalled()
  expect(updateCreditCard).not.toHaveBeenCalled()
  expect(deactivateCreditCard).not.toHaveBeenCalled()
  expect(reactivateCreditCard).not.toHaveBeenCalled()
})
test('6: creates active card with owner, cents and configured days, then refreshes', async () => {
  mount(); await loaded(); openNew(); fill(); create()
  await waitFor(() => expect(createCreditCard).toHaveBeenCalledWith(user.id, {
    name: 'Meu cartão', limit_amount: 8000.5, closing_day: 25, due_day: 3,
  }))
  await waitFor(() => expect(screen.getByText('Cartão criado com sucesso.')).toBeTruthy())
  expect(listCreditCards).toHaveBeenCalledTimes(2)
})
test('7: blank name is rejected before API call', async () => {
  mount(); await loaded(); openNew(); fill('   '); create()
  expect(screen.getByRole('alert').textContent).toContain('nome do cartão')
  expect(createCreditCard).not.toHaveBeenCalled()
})
test('8: negative and malformed limits fail; zero is allowed by the database', async () => {
  mount(); await loaded(); openNew(); fill('Cartão', '-1,00'); create()
  expect(screen.getByRole('alert').textContent).toContain('limite válido')
  expect(createCreditCard).not.toHaveBeenCalled()
  fill('Cartão', '1,234'); create()
  expect(createCreditCard).not.toHaveBeenCalled()
  fill('Cartão', '0'); create()
  await waitFor(() => expect(createCreditCard).toHaveBeenCalledWith(user.id, expect.objectContaining({ limit_amount: 0 })))
})
test('9: closing day below 1 is invalid', async () => {
  mount(); await loaded(); openNew(); fill('Cartão', '10', '0'); create()
  expect(screen.getByRole('alert').textContent).toContain('fechamento')
  expect(createCreditCard).not.toHaveBeenCalled()
})
test('10: closing day above 31 is invalid', async () => {
  mount(); await loaded(); openNew(); fill('Cartão', '10', '32'); create()
  expect(screen.getByRole('alert').textContent).toContain('fechamento')
  expect(createCreditCard).not.toHaveBeenCalled()
})
test('11: due day below 1 is invalid', async () => {
  mount(); await loaded(); openNew(); fill('Cartão', '10', '25', '0'); create()
  expect(screen.getByRole('alert').textContent).toContain('vencimento')
  expect(createCreditCard).not.toHaveBeenCalled()
})
test('12: due day above 31 is invalid', async () => {
  mount(); await loaded(); openNew(); fill('Cartão', '10', '25', '32'); create()
  expect(screen.getByRole('alert').textContent).toContain('vencimento')
  expect(createCreditCard).not.toHaveBeenCalled()
})
test('31 remains a valid cycle day even for short months', async () => {
  mount(); await loaded(); openNew(); fill('Cartão', '10', '31', '31'); create()
  await waitFor(() => expect(createCreditCard).toHaveBeenCalledWith(user.id, expect.objectContaining({ closing_day: 31, due_day: 31 })))
})
test('13: editing a used card cycle confirms that only future invoices change', async () => {
  vi.mocked(listCreditCards).mockResolvedValue([card]); vi.mocked(creditCardHasUsage).mockResolvedValue(true)
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  mount(); await loaded(); fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
  fill('  Novo nome  ', '9.000,00', '30', '04')
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  await waitFor(() => expect(updateCreditCard).toHaveBeenCalledWith(user.id, card.id, {
    name: 'Novo nome', limit_amount: 9000, closing_day: 30, due_day: 4,
  }))
  expect(confirm).toHaveBeenCalledTimes(1)
})
test('declining the used-cycle confirmation preserves the original days', async () => {
  vi.mocked(listCreditCards).mockResolvedValue([card]); vi.mocked(creditCardHasUsage).mockResolvedValue(true)
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  mount(); await loaded(); fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
  fill('Nubank', '8000', '30', '03')
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  await waitFor(() => expect(creditCardHasUsage).toHaveBeenCalled())
  expect(updateCreditCard).not.toHaveBeenCalled()
})
test('14: deactivation requires confirmation and keeps the record', async () => {
  vi.mocked(listCreditCards).mockResolvedValue([card])
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
  mount(); await loaded(); fireEvent.click(screen.getByRole('button', { name: 'Desativar' }))
  expect(deactivateCreditCard).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Desativar' }))
  await waitFor(() => expect(deactivateCreditCard).toHaveBeenCalledWith(user.id, card.id))
  expect(confirm).toHaveBeenCalledTimes(2)
  expect(screen.getByText('Cartão desativado com sucesso.')).toBeTruthy()
})
test('15: inactive card can be reactivated', async () => {
  vi.mocked(listCreditCards).mockResolvedValue([inactive]); mount(); await loaded()
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'inactive' } })
  fireEvent.click(screen.getByRole('button', { name: 'Reativar' }))
  await waitFor(() => expect(reactivateCreditCard).toHaveBeenCalledWith(user.id, inactive.id))
  expect(screen.getByText('Cartão reativado com sucesso.')).toBeTruthy()
})
test('16: API permission and validation errors show friendly text', async () => {
  vi.mocked(createCreditCard).mockRejectedValueOnce(new CreditCardServiceError('permission'))
    .mockRejectedValueOnce(new CreditCardServiceError('validation'))
  mount(); await loaded(); openNew(); fill('Cartão', '10'); create()
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('não tem permissão'))
  create()
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('dados do cartão não são válidos'))
})
test('17: pending request prevents duplicate submits', async () => {
  vi.mocked(createCreditCard).mockReturnValue(new Promise(() => undefined))
  mount(); await loaded(); openNew(); fill('Cartão', '10')
  const submit = screen.getByRole('button', { name: 'Criar cartão' })
  fireEvent.click(submit); fireEvent.click(submit)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Salvando…' }).hasAttribute('disabled')).toBe(true))
  expect(createCreditCard).toHaveBeenCalledTimes(1)
})
test('switching users never shows a previous owner card while loading', async () => {
  vi.mocked(listCreditCards).mockResolvedValueOnce([card]).mockReturnValueOnce(new Promise(() => undefined))
  const view = mount(); await loaded(); expect(screen.getByText('Nubank')).toBeTruthy()
  view.rerender(page({ ...state, user: { id: 'user-2' } as User }))
  expect(screen.queryByText('Nubank')).toBeNull()
  expect(screen.getByText('Carregando cartões…')).toBeTruthy()
})
