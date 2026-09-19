import { getSupabaseClient } from '../../../lib/supabase'
import type { CreditCard, CreditCardInput } from '../types'

export type CreditCardErrorKind = 'permission' | 'validation' | 'history' | 'generic'

export class CreditCardServiceError extends Error {
  constructor(public readonly kind: CreditCardErrorKind) {
    super(kind)
  }
}

export function creditCardErrorKind(code?: string, message?: string): CreditCardErrorKind {
  if (code === '42501' || code === 'PGRST301' || code === 'PGRST116') return 'permission'
  if (code === '23503' || (code === '23514' && message?.includes('Card cycle is immutable'))) return 'history'
  if (code === '23514' || code === '22003' || code === '22P02') return 'validation'
  return 'generic'
}

function throwCardError(error: { code?: string; message?: string } | null): void {
  if (error) throw new CreditCardServiceError(creditCardErrorKind(error.code, error.message))
}

export async function listCreditCards(userId: string): Promise<CreditCard[]> {
  const { data, error } = await getSupabaseClient().from('credit_cards').select('*').eq('user_id', userId)
  throwCardError(error)
  return data ?? []
}

export async function createCreditCard(userId: string, input: CreditCardInput): Promise<void> {
  const { error } = await getSupabaseClient().from('credit_cards').insert({ ...input, user_id: userId, active: true })
  throwCardError(error)
}

export async function updateCreditCard(userId: string, cardId: string, input: CreditCardInput): Promise<void> {
  const { data, error } = await getSupabaseClient().from('credit_cards').update(input)
    .eq('user_id', userId).eq('id', cardId).select('id').single()
  throwCardError(error)
  if (!data) throw new CreditCardServiceError('permission')
}

async function setCreditCardActive(userId: string, cardId: string, active: boolean): Promise<void> {
  const { data, error } = await getSupabaseClient().from('credit_cards').update({ active })
    .eq('user_id', userId).eq('id', cardId).select('id').single()
  throwCardError(error)
  if (!data) throw new CreditCardServiceError('permission')
}

export function deactivateCreditCard(userId: string, cardId: string): Promise<void> {
  return setCreditCardActive(userId, cardId, false)
}

export function reactivateCreditCard(userId: string, cardId: string): Promise<void> {
  return setCreditCardActive(userId, cardId, true)
}

export async function creditCardHasUsage(userId: string, cardId: string): Promise<boolean> {
  const client = getSupabaseClient()
  const [invoices, transactions] = await Promise.all([
    client.from('credit_card_invoices').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('credit_card_id', cardId),
    client.from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('credit_card_id', cardId),
  ])
  throwCardError(invoices.error)
  throwCardError(transactions.error)
  return (invoices.count ?? 0) > 0 || (transactions.count ?? 0) > 0
}
