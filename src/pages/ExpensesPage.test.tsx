import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import { AuthContext } from '../features/auth/auth-context'
import type { AuthState } from '../features/auth/auth-context'
import type { ExpenseDataset, ExpenseRecord, PaymentMethod } from '../features/expenses/types'
import { ExpensesPage } from './ExpensesPage'
import { ExpenseServiceError, createCardExpense, createExpense, createInstallmentExpense, createPaidExpense,
  createRecurringExpense, deleteExpense, generateRecurringOccurrences, listExpenses,
  reverseExpensePayment, settleExpense, updateExpense } from '../features/expenses/services/expenses'

vi.mock('../features/expenses/services/expenses', async (importOriginal) => {
  const original = await importOriginal<typeof import('../features/expenses/services/expenses')>()
  return { ...original, listExpenses: vi.fn(), createExpense: vi.fn(), createPaidExpense: vi.fn(),
    createInstallmentExpense: vi.fn(), createCardExpense: vi.fn(), createRecurringExpense: vi.fn(),
    generateRecurringOccurrences: vi.fn(), updateExpense: vi.fn(), deleteExpense: vi.fn(),
    settleExpense: vi.fn(), reverseExpensePayment: vi.fn() }
})

const user = { id: 'user-expense' } as User
const auth: AuthState = { user, session: null, profile: null, loading: false, error: null }
const category = { id: 'category-1', user_id: user.id, name: 'Mercado', type: 'expense', active: true,
  created_at: '2026-09-01', updated_at: '2026-09-01' } as const
const account = { id: 'account-1', user_id: user.id, name: 'Conta principal', type: 'checking', initial_balance: 0,
  initial_balance_date: '2026-01-01', active: true, created_at: '2026-01-01', updated_at: '2026-01-01' } as const
const cashAccount = { ...account, id: 'account-2', name: 'Carteira', type: 'cash' as const }
const card = { id: 'card-1', user_id: user.id, name: 'Nubank', limit_amount: 5000, closing_day: 25,
  due_day: 3, active: true, created_at: '2026-01-01', updated_at: '2026-01-01' } as const
const baseExpense = {
  id: 'expense-1', user_id: user.id, type: 'expense', description: 'Supermercado', category_id: category.id,
  amount: 123.45, transaction_date: '2026-09-15', due_date: '2026-09-20', status: 'pending',
  planned_payment_method: 'boleto', actual_payment_method: null, account_id: null, credit_card_id: null,
  credit_card_invoice_id: null, installment_group_id: null, installment_number: null, installment_total: null,
  recurrence_rule_id: null, settled_at: null, notes: null, created_at: '2026-09-15', updated_at: '2026-09-15',
  category_name: category.name, card_name: null, account_name: null, invoice_status: null,
  invoice_reference_month: null, payment_movement_id: null, has_payment_history: false,
  installment_description: null, recurrence_frequency: null, recurrence_interval_count: null,
} as ExpenseRecord
const dataset = (expenses: ExpenseRecord[] = []): ExpenseDataset => ({ expenses,
  options: { categories: [category], accounts: [account, cashAccount], cards: [card] } })

function mount() { return render(<AuthContext.Provider value={auth}><ExpensesPage /></AuthContext.Provider>) }
async function loaded() { await waitFor(() => expect(screen.queryByText('Carregando despesas…')).toBeNull()) }
function openNew() { fireEvent.click(screen.getAllByRole('button', { name: 'Nova despesa' })[0]!) }
function fillBasic(method: PaymentMethod = 'boleto') {
  fireEvent.change(screen.getByLabelText('Descrição *'), { target: { value: '  Nova compra  ' } })
  fireEvent.change(screen.getByLabelText('Categoria *'), { target: { value: category.id } })
  fireEvent.change(screen.getByLabelText('Valor (R$) *'), { target: { value: '1.200,30' } })
  fireEvent.change(screen.getByLabelText('Data do lançamento *'), { target: { value: '2026-09-16' } })
  fireEvent.change(screen.getByLabelText('Forma prevista *'), { target: { value: method } })
  if (method === 'credit_card') fireEvent.change(screen.getByLabelText('Cartão *'), { target: { value: card.id } })
  if (['pix', 'debit_card', 'cash'].includes(method)) fireEvent.change(screen.getByLabelText('Conta *'), { target: { value: method === 'cash' ? cashAccount.id : account.id } })
}
function submit() { fireEvent.click(screen.getByRole('button', { name: 'Criar despesa' })) }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listExpenses).mockResolvedValue(dataset())
  for (const fn of [createExpense, createPaidExpense, createInstallmentExpense, createCardExpense,
    createRecurringExpense, updateExpense, deleteExpense, settleExpense, reverseExpensePayment]) vi.mocked(fn).mockResolvedValue()
  vi.mocked(generateRecurringOccurrences).mockResolvedValue(0)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

test('1: renderiza o módulo para o proprietário autenticado', async () => {
  mount(); await loaded(); expect(screen.getByRole('heading', { name: 'Despesas', level: 1 })).toBeTruthy()
  expect(listExpenses).toHaveBeenCalledWith(user.id, expect.any(String), expect.any(String))
})
test('2: estado vazio oferece nova despesa', async () => {
  mount(); await loaded(); expect(screen.getByText('Nenhuma despesa encontrada.')).toBeTruthy(); openNew(); expect(screen.getByRole('dialog')).toBeTruthy()
})
test('3: listagem exibe valor, categoria, data e forma de pagamento', async () => {
  vi.mocked(listExpenses).mockResolvedValue(dataset([baseExpense])); mount(); await loaded()
  expect(screen.getByText('Supermercado')).toBeTruthy(); expect(screen.getAllByText(/R\$\s*123,45/).length).toBeGreaterThan(0); expect(screen.getAllByText('Boleto').length).toBeGreaterThan(0)
})
test('4: alteração do período recarrega a consulta', async () => {
  mount(); await loaded(); fireEvent.change(screen.getByLabelText('Data inicial'), { target: { value: '2026-08-01' } })
  await waitFor(() => expect(listExpenses).toHaveBeenLastCalledWith(user.id, '2026-08-01', expect.any(String)))
})
test('5: filtro por status mantém somente despesas pagas', async () => {
  const paid = { ...baseExpense, id: 'paid', description: 'Paga', status: 'settled' as const }
  vi.mocked(listExpenses).mockResolvedValue(dataset([baseExpense, paid])); mount(); await loaded()
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'settled' } })
  expect(screen.getByRole('heading', { name: 'Paga', level: 2 })).toBeTruthy(); expect(screen.queryByText('Supermercado')).toBeNull()
})
test('6: filtro por categoria elimina categorias diferentes', async () => {
  const other = { ...baseExpense, id: 'other', category_id: 'other-category', category_name: 'Outra' }
  vi.mocked(listExpenses).mockResolvedValue(dataset([baseExpense, other])); mount(); await loaded()
  fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: category.id } })
  expect(screen.getByText('Supermercado')).toBeTruthy(); expect(screen.queryByText('Outra')).toBeNull()
})
test('7: criação simples pendente usa transação sem movimento', async () => {
  mount(); await loaded(); openNew(); fillBasic(); submit()
  await waitFor(() => expect(createExpense).toHaveBeenCalledWith(user.id, expect.objectContaining({ description: 'Nova compra', amount: 1200.3, planned_payment_method: 'boleto' })))
})
test('8: criação já paga usa a RPC atômica', async () => {
  mount(); await loaded(); openNew(); fillBasic('boleto'); fireEvent.change(screen.getByLabelText('Status inicial *'), { target: { value: 'settled' } })
  fireEvent.change(screen.getByLabelText('Conta utilizada *'), { target: { value: account.id } }); submit()
  await waitFor(() => expect(createPaidExpense).toHaveBeenCalledWith(expect.objectContaining({ payment_account_id: account.id })))
})
test('9: PIX pendente exige e envia a conta', async () => {
  mount(); await loaded(); openNew(); fillBasic('pix'); submit()
  await waitFor(() => expect(createExpense).toHaveBeenCalledWith(user.id, expect.objectContaining({ planned_payment_method: 'pix', account_id: account.id })))
})
test('10: débito usa conta financeira sem cartão separado', async () => {
  mount(); await loaded(); openNew(); fillBasic('debit_card'); submit()
  await waitFor(() => expect(createExpense).toHaveBeenCalledWith(user.id, expect.objectContaining({ planned_payment_method: 'debit_card', account_id: account.id })))
})
test('11: dinheiro prioriza e envia a conta carteira', async () => {
  mount(); await loaded(); openNew(); fillBasic('cash'); submit()
  await waitFor(() => expect(createExpense).toHaveBeenCalledWith(user.id, expect.objectContaining({ planned_payment_method: 'cash', account_id: cashAccount.id })))
})
test('12: boleto pendente não cria movimento nem exige conta', async () => {
  mount(); await loaded(); openNew(); fillBasic('boleto'); submit()
  await waitFor(() => expect(createExpense).toHaveBeenCalledWith(user.id, expect.objectContaining({ account_id: null }))); expect(createPaidExpense).not.toHaveBeenCalled()
})
test('13: compra em cartão usa a RPC de compra e fatura', async () => {
  mount(); await loaded(); openNew(); fillBasic('credit_card'); submit()
  await waitFor(() => expect(createCardExpense).toHaveBeenCalledWith(expect.objectContaining({ credit_card_id: card.id, account_id: null })))
})
test('14: cartão é obrigatório', async () => {
  mount(); await loaded(); openNew(); fillBasic(); fireEvent.change(screen.getByLabelText('Forma prevista *'), { target: { value: 'credit_card' } }); submit()
  expect(screen.getByRole('alert').textContent).toContain('Selecione um cartão'); expect(createCardExpense).not.toHaveBeenCalled()
})
test('15: cartão remove account_id do payload', async () => {
  mount(); await loaded(); openNew(); fillBasic('pix'); fireEvent.change(screen.getByLabelText('Forma prevista *'), { target: { value: 'credit_card' } })
  fireEvent.change(screen.getByLabelText('Cartão *'), { target: { value: card.id } }); submit()
  await waitFor(() => expect(createCardExpense).toHaveBeenCalledWith(expect.objectContaining({ account_id: null })))
})
test('16: parcelamento chama operação atômica com o total de parcelas', async () => {
  mount(); await loaded(); openNew(); fillBasic(); fireEvent.click(screen.getByLabelText('Parcelar despesa'))
  fireEvent.change(screen.getByLabelText('Número de parcelas *'), { target: { value: '3' } }); submit()
  await waitFor(() => expect(createInstallmentExpense).toHaveBeenCalledWith(expect.any(Object), 3))
})
test('17: recorrência cria regra com frequência e limite', async () => {
  mount(); await loaded(); openNew(); fillBasic(); fireEvent.click(screen.getByLabelText('Despesa recorrente'))
  fireEvent.change(screen.getByLabelText('Término'), { target: { value: 'count' } }); fireEvent.change(screen.getByLabelText('Ocorrências *'), { target: { value: '6' } }); submit()
  await waitFor(() => expect(createRecurringExpense).toHaveBeenCalledWith(expect.objectContaining({ frequency: 'monthly', max_occurrences: 6 }), expect.any(String)))
})
test('18: parcelamento e recorrência ficam mutuamente exclusivos', async () => {
  mount(); await loaded(); openNew(); fillBasic(); fireEvent.click(screen.getByLabelText('Parcelar despesa'))
  expect((screen.getByLabelText('Despesa recorrente') as HTMLInputElement).disabled).toBe(true)
})
test('19: marcar como paga solicita conta e chama settle_transaction', async () => {
  vi.mocked(listExpenses).mockResolvedValue(dataset([baseExpense])); mount(); await loaded(); fireEvent.click(screen.getByRole('button', { name: 'Marcar como paga' }))
  fireEvent.change(screen.getByLabelText('Conta *'), { target: { value: account.id } }); fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento' }))
  await waitFor(() => expect(settleExpense).toHaveBeenCalledWith(baseExpense.id, account.id, 'pix', expect.any(String)))
})
test('20: estorno usa o movimento original sem apagá-lo', async () => {
  const paid = { ...baseExpense, status: 'settled' as const, payment_movement_id: 'movement-1', has_payment_history: true }
  vi.mocked(listExpenses).mockResolvedValue(dataset([paid])); mount(); await loaded(); fireEvent.click(screen.getByRole('button', { name: 'Desfazer pagamento' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar estorno' }))
  await waitFor(() => expect(reverseExpensePayment).toHaveBeenCalledWith('movement-1', expect.any(String)))
})
test('21: cartão não oferece pagamento individual', async () => {
  const cardExpense = { ...baseExpense, planned_payment_method: 'credit_card' as const, credit_card_id: card.id, card_name: card.name,
    credit_card_invoice_id: 'invoice-1', due_date: '2026-10-03', invoice_status: 'open' as const, invoice_reference_month: '2026-10-01' }
  vi.mocked(listExpenses).mockResolvedValue(dataset([cardExpense])); mount(); await loaded()
  expect(screen.getByText('Pagamento ocorre pela fatura.')).toBeTruthy(); expect(screen.queryByRole('button', { name: 'Marcar como paga' })).toBeNull()
})
test('22: edição envia os campos pela RPC dedicada', async () => {
  vi.mocked(listExpenses).mockResolvedValue(dataset([baseExpense])); mount(); await loaded(); fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
  fireEvent.change(screen.getByLabelText('Descrição *'), { target: { value: 'Mercado editado' } }); fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  await waitFor(() => expect(updateExpense).toHaveBeenCalledWith(baseExpense.id, expect.objectContaining({ description: 'Mercado editado' })))
})
test('23: fatura fechada bloqueia campos financeiros e explica o motivo', async () => {
  const closed = { ...baseExpense, planned_payment_method: 'credit_card' as const, credit_card_id: card.id, card_name: card.name,
    credit_card_invoice_id: 'invoice-1', invoice_status: 'closed' as const, invoice_reference_month: '2026-09-01' }
  vi.mocked(listExpenses).mockResolvedValue(dataset([closed])); mount(); await loaded(); fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
  expect((screen.getByLabelText('Valor (R$) *') as HTMLInputElement).disabled).toBe(true); expect(screen.getByText(/Apenas descrição e notas/)).toBeTruthy()
})
test('24: exclusão permitida confirma e chama o serviço', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true); vi.mocked(listExpenses).mockResolvedValue(dataset([baseExpense])); mount(); await loaded()
  fireEvent.click(screen.getByRole('button', { name: 'Excluir' })); await waitFor(() => expect(deleteExpense).toHaveBeenCalledWith(user.id, baseExpense.id))
})
test('25: recusa do banco por histórico mostra erro amigável', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true); vi.mocked(deleteExpense).mockRejectedValue(new ExpenseServiceError('history'))
  vi.mocked(listExpenses).mockResolvedValue(dataset([baseExpense])); mount(); await loaded(); fireEvent.click(screen.getByRole('button', { name: 'Excluir' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('histórico financeiro'))
})
test('26: erro de API não expõe mensagem PostgreSQL', async () => {
  vi.mocked(createExpense).mockRejectedValue(new Error('raw postgres secret')); mount(); await loaded(); openNew(); fillBasic(); submit()
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Não foi possível concluir')); expect(screen.queryByText('raw postgres secret')).toBeNull()
})
test('27: requisição pendente impede submit duplicado', async () => {
  vi.mocked(createExpense).mockReturnValue(new Promise(() => undefined)); mount(); await loaded(); openNew(); fillBasic(); const button = screen.getByRole('button', { name: 'Criar despesa' })
  fireEvent.click(button); fireEvent.click(button); await waitFor(() => expect(screen.getByRole('button', { name: 'Salvando…' }).hasAttribute('disabled')).toBe(true)); expect(createExpense).toHaveBeenCalledTimes(1)
})
