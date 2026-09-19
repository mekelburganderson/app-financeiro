import { getSupabaseClient } from '../../../lib/supabase'
import type { Database } from '../../../types/database'
import type { IncomeDataset, IncomeInput } from '../types'

export type IncomeErrorKind = 'permission' | 'category' | 'account' | 'already_received' | 'already_reversed' | 'history' | 'validation' | 'generic'
export class IncomeServiceError extends Error { constructor(public readonly kind: IncomeErrorKind) { super(kind) } }
export function incomeErrorKind(code?: string, message = ''): IncomeErrorKind {
  if (code === '42501' || code === 'PGRST116' || code === 'PGRST301') return 'permission'
  if (/Active income category|category.*invalid/i.test(message)) return 'category'
  if (/Active account|movement date|account.*invalid/i.test(message)) return 'account'
  if (/already settled|already received/i.test(message)) return 'already_received'
  if (/already reversed|reversal.*already/i.test(message)) return 'already_reversed'
  if (/locked by history|financial history|Reverse the payment/i.test(message)) return 'history'
  if (code === '23503' || code === '23514' || code === '22003' || code === '22P02') return 'validation'
  return 'generic'
}
function check(error: { code?: string; message?: string } | null) { if (error) throw new IncomeServiceError(incomeErrorKind(error.code, error.message)) }

export async function listIncomes(userId: string, startDate: string, endDate: string): Promise<IncomeDataset> {
  const client = getSupabaseClient()
  const [transactions, categories, accounts] = await Promise.all([
    client.from('transactions').select('*').eq('user_id', userId).eq('type', 'income').gte('transaction_date', startDate).lte('transaction_date', endDate).order('transaction_date', { ascending: false }).order('created_at', { ascending: false }),
    client.from('categories').select('*').eq('user_id', userId).eq('type', 'income'),
    client.from('accounts').select('*').eq('user_id', userId),
  ])
  check(transactions.error); check(categories.error); check(accounts.error)
  const rows = transactions.data ?? []; const options = { categories: categories.data ?? [], accounts: accounts.data ?? [] }
  if (!rows.length) return { incomes: [], options }
  const ids = rows.map((x) => x.id); const ruleIds = [...new Set(rows.map((x) => x.recurrence_rule_id).filter((x): x is string => !!x))]
  const [movements, rules] = await Promise.all([
    client.from('account_movements').select('id,origin_id').eq('user_id', userId).eq('origin_type', 'income_receipt').in('origin_id', ids),
    ruleIds.length ? client.from('recurrence_rules').select('*').eq('user_id', userId).in('id', ruleIds) : Promise.resolve({ data: [], error: null }),
  ])
  check(movements.error); check(rules.error)
  const originals = movements.data ?? []; const movementIds = originals.map((x) => x.id)
  const reversals = movementIds.length ? await client.from('account_movements').select('reversal_of_movement_id').eq('user_id', userId).in('reversal_of_movement_id', movementIds) : { data: [], error: null }
  check(reversals.error)
  const reversed = new Set((reversals.data ?? []).map((x) => x.reversal_of_movement_id))
  const active = new Map(originals.filter((x) => !reversed.has(x.id)).map((x) => [x.origin_id, x.id]))
  const history = new Set(originals.map((x) => x.origin_id)); const categoryById = new Map(options.categories.map((x) => [x.id, x]))
  const accountById = new Map(options.accounts.map((x) => [x.id, x])); const ruleById = new Map((rules.data ?? []).map((x) => [x.id, x]))
  return { options, incomes: rows.map((income) => { const rule = income.recurrence_rule_id ? ruleById.get(income.recurrence_rule_id) : null; return {
    ...income, category_name: categoryById.get(income.category_id)?.name ?? 'Categoria indisponível',
    account_name: income.account_id ? accountById.get(income.account_id)?.name ?? 'Conta indisponível' : null,
    receipt_movement_id: active.get(income.id) ?? null, has_receipt_history: history.has(income.id),
    recurrence_frequency: rule?.frequency ?? null, recurrence_interval_count: rule?.interval_count ?? null,
  } }) }
}
export async function createIncome(userId: string, input: IncomeInput) { const { error } = await getSupabaseClient().from('transactions').insert({ ...input, user_id: userId, type: 'income', status: 'pending', planned_payment_method: 'bank_transfer' }); check(error) }
export async function createReceivedIncome(input: IncomeInput, accountId: string, receivedAt: string) { const { error } = await getSupabaseClient().rpc('create_received_income', { p_description: input.description, p_category_id: input.category_id, p_amount: input.amount, p_transaction_date: input.transaction_date, p_due_date: input.due_date, p_notes: input.notes, p_account_id: accountId, p_received_at: receivedAt }); check(error) }
export async function createRecurringIncome(input: IncomeInput, recurrence: { frequency: Database['public']['Enums']['recurrence_frequency']; interval_count: number; end_date: string | null; max_occurrences: number | null; account_id: string | null }, throughDate: string) { const { error } = await getSupabaseClient().rpc('create_income_recurrence', { p_description: input.description, p_category_id: input.category_id, p_amount: input.amount, p_frequency: recurrence.frequency, p_interval_count: recurrence.interval_count, p_start_date: input.transaction_date, p_end_date: recurrence.end_date, p_max_occurrences: recurrence.max_occurrences, p_account_id: recurrence.account_id, p_notes: input.notes, p_through_date: throughDate }); check(error) }
export async function updateIncome(id: string, input: IncomeInput) { const { error } = await getSupabaseClient().rpc('update_income', { p_income_id: id, p_description: input.description, p_category_id: input.category_id, p_amount: input.amount, p_transaction_date: input.transaction_date, p_due_date: input.due_date, p_notes: input.notes }); check(error) }
export async function deleteIncome(userId: string, id: string) { const { data, error } = await getSupabaseClient().from('transactions').delete().eq('user_id', userId).eq('id', id).eq('type', 'income').select('id').single(); check(error); if (!data) throw new IncomeServiceError('permission') }
export async function settleIncome(id: string, accountId: string, receivedAt: string) { const { error } = await getSupabaseClient().rpc('settle_transaction', { p_transaction_id: id, p_account_id: accountId, p_payment_method: 'bank_transfer', p_settled_at: receivedAt }); check(error) }
export async function reverseIncomeReceipt(movementId: string, reversedAt: string) { const { error } = await getSupabaseClient().rpc('reverse_movement', { p_movement_id: movementId, p_reversed_at: reversedAt }); check(error) }
export async function generateIncomeOccurrences(throughDate: string) { const { data, error } = await getSupabaseClient().rpc('generate_recurrences', { p_through_date: throughDate }); check(error); return data ?? 0 }
