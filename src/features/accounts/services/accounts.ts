import { getSupabaseClient } from '../../../lib/supabase'
import type { AccountInput, AccountWithBalance } from '../types'

export async function listAccounts(userId: string): Promise<AccountWithBalance[]> {
  const client = getSupabaseClient()
  const accountsResult = await client.from('accounts').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  if (accountsResult.error) throw accountsResult.error
  const balancesResult = await client.from('account_balances').select('account_id,current_balance').eq('user_id', userId)
  if (balancesResult.error) throw balancesResult.error
  const balances = new Map((balancesResult.data ?? []).map((row) => [row.account_id, row.current_balance]))
  return (accountsResult.data ?? []).map((account) => {
    const currentBalance = balances.get(account.id)
    if (currentBalance === null || currentBalance === undefined || !Number.isFinite(currentBalance)) {
      throw new Error('Saldo da conta indisponível na view account_balances.')
    }
    return { ...account, current_balance: currentBalance }
  })
}

export async function createAccount(userId: string, input: AccountInput): Promise<void> {
  const { error } = await getSupabaseClient().from('accounts').insert({ ...input, user_id: userId, active: true })
  if (error) throw error
}

export async function updateAccount(userId: string, accountId: string, input: AccountInput): Promise<void> {
  const { data, error } = await getSupabaseClient().from('accounts').update(input).eq('id', accountId).eq('user_id', userId).select('id').single()
  if (error) throw error
  if (!data) throw new Error('Conta não encontrada.')
}

async function setAccountActive(userId: string, accountId: string, active: boolean): Promise<void> {
  const { data, error } = await getSupabaseClient().from('accounts').update({ active }).eq('id', accountId).eq('user_id', userId).select('id').single()
  if (error) throw error
  if (!data) throw new Error('Conta não encontrada.')
}

export function deactivateAccount(userId: string, accountId: string): Promise<void> {
  return setAccountActive(userId, accountId, false)
}

export function reactivateAccount(userId: string, accountId: string): Promise<void> {
  return setAccountActive(userId, accountId, true)
}

export async function hasAccountMovements(userId: string, accountId: string): Promise<boolean> {
  const { count, error } = await getSupabaseClient().from('account_movements').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('account_id', accountId)
  if (error) throw error
  return (count ?? 0) > 0
}
