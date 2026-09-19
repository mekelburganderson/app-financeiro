import { getSupabaseClient } from '../../../lib/supabase'
import type { ExpenseDataset, ExpenseInput, PaidExpenseInput, RecurrenceInput } from '../types'

export type ExpenseErrorKind = 'permission' | 'category' | 'account' | 'card' | 'invoice_closed' |
  'already_paid' | 'already_reversed' | 'history' | 'validation' | 'generic'

export class ExpenseServiceError extends Error {
  constructor(public readonly kind: ExpenseErrorKind) { super(kind) }
}

export function expenseErrorKind(code?: string, message = ''): ExpenseErrorKind {
  if (code === '42501' || code === 'PGRST116' || code === 'PGRST301') return 'permission'
  if (/Active expense category|category.*invalid/i.test(message)) return 'category'
  if (/Active account|movement date|account.*invalid/i.test(message)) return 'account'
  if (/Active credit card|Credit card purchases are paid through/i.test(message)) return 'card'
  if (/Closed or paid invoice|invoice already closed|corresponding invoice already closed|Invoice.*closed|fatura.*fechada/i.test(message)) return 'invoice_closed'
  if (/already settled|already paid/i.test(message)) return 'already_paid'
  if (/already reversed|reversal.*already/i.test(message)) return 'already_reversed'
  if (/locked by history|immutable|consolidated|installment financial/i.test(message)) return 'history'
  if (code === '23503' || code === '23514' || code === '22003' || code === '22P02') return 'validation'
  return 'generic'
}

function throwExpenseError(error: { code?: string; message?: string } | null): void {
  if (error) throw new ExpenseServiceError(expenseErrorKind(error.code, error.message))
}

export async function listExpenses(userId: string, startDate: string, endDate: string): Promise<ExpenseDataset> {
  const client = getSupabaseClient()
  const [transactions, categories, accounts, cards] = await Promise.all([
    client.from('transactions').select('*').eq('user_id', userId).eq('type', 'expense')
      .gte('transaction_date', startDate).lte('transaction_date', endDate)
      .order('transaction_date', { ascending: false }).order('created_at', { ascending: false }),
    client.from('categories').select('*').eq('user_id', userId).eq('type', 'expense'),
    client.from('accounts').select('*').eq('user_id', userId),
    client.from('credit_cards').select('*').eq('user_id', userId),
  ])
  throwExpenseError(transactions.error)
  throwExpenseError(categories.error)
  throwExpenseError(accounts.error)
  throwExpenseError(cards.error)
  const expenseRows = transactions.data ?? []
  const options = { categories: categories.data ?? [], accounts: accounts.data ?? [], cards: cards.data ?? [] }
  if (!expenseRows.length) return { expenses: [], options }

  const invoiceIds = [...new Set(expenseRows.map((x) => x.credit_card_invoice_id).filter((x): x is string => !!x))]
  const groupIds = [...new Set(expenseRows.map((x) => x.installment_group_id).filter((x): x is string => !!x))]
  const ruleIds = [...new Set(expenseRows.map((x) => x.recurrence_rule_id).filter((x): x is string => !!x))]
  const expenseIds = expenseRows.map((x) => x.id)
  const [invoices, groups, rules, movements] = await Promise.all([
    invoiceIds.length ? client.from('credit_card_invoices').select('*').eq('user_id', userId).in('id', invoiceIds) : Promise.resolve({ data: [], error: null }),
    groupIds.length ? client.from('installment_groups').select('*').eq('user_id', userId).in('id', groupIds) : Promise.resolve({ data: [], error: null }),
    ruleIds.length ? client.from('recurrence_rules').select('*').eq('user_id', userId).in('id', ruleIds) : Promise.resolve({ data: [], error: null }),
    client.from('account_movements').select('id,origin_id').eq('user_id', userId)
      .eq('origin_type', 'expense_payment').in('origin_id', expenseIds),
  ])
  throwExpenseError(invoices.error)
  throwExpenseError(groups.error)
  throwExpenseError(rules.error)
  throwExpenseError(movements.error)
  const originalMovements = movements.data ?? []
  const movementIds = originalMovements.map((x) => x.id)
  const reversals = movementIds.length ? await client.from('account_movements').select('reversal_of_movement_id')
    .eq('user_id', userId).in('reversal_of_movement_id', movementIds) : { data: [], error: null }
  throwExpenseError(reversals.error)
  const reversed = new Set((reversals.data ?? []).map((x) => x.reversal_of_movement_id))
  const activeMovements = new Map(originalMovements.filter((x) => !reversed.has(x.id)).map((x) => [x.origin_id, x.id]))
  const paymentHistory = new Set(originalMovements.map((x) => x.origin_id))
  const categoryById = new Map(options.categories.map((x) => [x.id, x]))
  const accountById = new Map(options.accounts.map((x) => [x.id, x]))
  const cardById = new Map(options.cards.map((x) => [x.id, x]))
  const invoiceById = new Map((invoices.data ?? []).map((x) => [x.id, x]))
  const groupById = new Map((groups.data ?? []).map((x) => [x.id, x]))
  const ruleById = new Map((rules.data ?? []).map((x) => [x.id, x]))
  return {
    options,
    expenses: expenseRows.map((expense) => {
      const invoice = expense.credit_card_invoice_id ? invoiceById.get(expense.credit_card_invoice_id) : null
      const rule = expense.recurrence_rule_id ? ruleById.get(expense.recurrence_rule_id) : null
      return {
        ...expense,
        category_name: categoryById.get(expense.category_id)?.name ?? 'Categoria indisponível',
        card_name: expense.credit_card_id ? cardById.get(expense.credit_card_id)?.name ?? 'Cartão indisponível' : null,
        account_name: expense.account_id ? accountById.get(expense.account_id)?.name ?? 'Conta indisponível' : null,
        invoice_status: invoice?.status ?? null,
        invoice_reference_month: invoice?.reference_month ?? null,
        payment_movement_id: activeMovements.get(expense.id) ?? null,
        has_payment_history: paymentHistory.has(expense.id),
        installment_description: expense.installment_group_id ? groupById.get(expense.installment_group_id)?.description ?? null : null,
        recurrence_frequency: rule?.frequency ?? null,
        recurrence_interval_count: rule?.interval_count ?? null,
      }
    }),
  }
}

export async function createExpense(userId: string, input: ExpenseInput): Promise<void> {
  if (input.planned_payment_method === 'credit_card') throw new ExpenseServiceError('validation')
  const { error } = await getSupabaseClient().from('transactions').insert({
    user_id: userId, type: 'expense', status: 'pending', description: input.description,
    category_id: input.category_id, amount: input.amount, transaction_date: input.transaction_date,
    due_date: input.due_date, planned_payment_method: input.planned_payment_method,
    account_id: input.account_id, notes: input.notes,
  })
  throwExpenseError(error)
}

export async function createPaidExpense(input: PaidExpenseInput): Promise<void> {
  const { error } = await getSupabaseClient().rpc('create_paid_expense', {
    p_description: input.description, p_category_id: input.category_id, p_amount: input.amount,
    p_transaction_date: input.transaction_date, p_due_date: input.due_date,
    p_planned_payment_method: input.planned_payment_method, p_notes: input.notes,
    p_account_id: input.payment_account_id, p_payment_method: input.actual_payment_method,
    p_settled_at: input.settled_at,
  })
  throwExpenseError(error)
}

export async function createInstallmentExpense(input: ExpenseInput, count: number): Promise<void> {
  if (input.planned_payment_method === 'credit_card') throw new ExpenseServiceError('validation')
  const { error } = await getSupabaseClient().rpc('create_installment_expense', {
    p_description: input.description, p_category_id: input.category_id, p_amount: input.amount,
    p_transaction_date: input.transaction_date, p_due_date: input.due_date,
    p_payment_method: input.planned_payment_method, p_notes: input.notes,
    p_account_id: input.account_id, p_installment_count: count,
  })
  throwExpenseError(error)
}

export async function createCardExpense(input: ExpenseInput, count = 1): Promise<void> {
  if (!input.credit_card_id) throw new ExpenseServiceError('card')
  const { error } = await getSupabaseClient().rpc('create_expense_card_purchase', {
    p_credit_card_id: input.credit_card_id, p_category_id: input.category_id,
    p_description: input.description, p_amount: input.amount,
    p_transaction_date: input.transaction_date, p_notes: input.notes,
    p_installment_count: count,
  })
  throwExpenseError(error)
}

export async function createRecurringExpense(input: RecurrenceInput, throughDate: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('create_expense_recurrence', {
    p_description: input.description, p_category_id: input.category_id, p_amount: input.amount,
    p_frequency: input.frequency, p_interval_count: input.interval_count,
    p_start_date: input.transaction_date, p_end_date: input.end_date,
    p_max_occurrences: input.max_occurrences, p_payment_method: input.planned_payment_method,
    p_credit_card_id: input.credit_card_id, p_account_id: input.account_id,
    p_notes: input.notes, p_through_date: throughDate,
  })
  throwExpenseError(error)
}

export async function generateRecurringOccurrences(throughDate: string): Promise<number> {
  const { data, error } = await getSupabaseClient().rpc('generate_recurrences', { p_through_date: throughDate })
  throwExpenseError(error)
  return data ?? 0
}

export async function updateExpense(expenseId: string, input: ExpenseInput): Promise<void> {
  const { error } = await getSupabaseClient().rpc('update_expense', {
    p_expense_id: expenseId, p_description: input.description, p_category_id: input.category_id,
    p_amount: input.amount, p_transaction_date: input.transaction_date, p_due_date: input.due_date,
    p_payment_method: input.planned_payment_method, p_credit_card_id: input.credit_card_id,
    p_account_id: input.account_id, p_notes: input.notes,
  })
  throwExpenseError(error)
}

export async function deleteExpense(expenseId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('delete_expense', { p_expense_id: expenseId })
  throwExpenseError(error)
}

export async function settleExpense(expenseId: string, accountId: string, method: Exclude<ExpenseInput['planned_payment_method'], 'credit_card'>, settledAt: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('settle_transaction', {
    p_transaction_id: expenseId, p_account_id: accountId,
    p_payment_method: method, p_settled_at: settledAt,
  })
  throwExpenseError(error)
}

export async function reverseExpensePayment(movementId: string, reversedAt: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('reverse_movement', {
    p_movement_id: movementId, p_reversed_at: reversedAt,
  })
  throwExpenseError(error)
}
