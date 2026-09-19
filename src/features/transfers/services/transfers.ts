import { getSupabaseClient } from '../../../lib/supabase'
import type { AccountMovement, TransferDataset, TransferDraft, TransferRecord } from '../types'

export type TransferErrorKind = 'account'|'same_account'|'amount'|'inactive'|'already_reversed'|'permission'|'date'|'generic'
export class TransferServiceError extends Error { constructor(public readonly kind: TransferErrorKind) { super(kind) } }

export function transferErrorKind(code?: string, message = ''): TransferErrorKind {
  if (/already reversed/i.test(message)) return 'already_reversed'
  if (/Distinct accounts/i.test(message) || /same account/i.test(message)) return 'same_account'
  if (/positive amount|amount/i.test(message)) return 'amount'
  if (/Active account/i.test(message)) return 'inactive'
  if (/date/i.test(message)) return 'date'
  if (code === '42501' || code === 'PGRST301') return 'permission'
  if (/account/i.test(message)) return 'account'
  return 'generic'
}

function check(error: { code?: string; message?: string } | null) {
  if (error) throw new TransferServiceError(transferErrorKind(error.code, error.message))
}

export async function listTransfers(userId: string): Promise<TransferDataset> {
  const client = getSupabaseClient()
  const [movementsResult, reversalsResult, accountsResult] = await Promise.all([
    client.from('account_movements').select('*').eq('user_id', userId).eq('origin_type', 'transfer'),
    client.from('account_movements').select('reversal_of_movement_id').eq('user_id', userId).eq('origin_type', 'reversal'),
    client.from('accounts').select('*').eq('user_id', userId),
  ])
  check(movementsResult.error); check(reversalsResult.error); check(accountsResult.error)
  const accounts = accountsResult.data ?? []
  const accountMap = new Map(accounts.map((account) => [account.id, account]))
  const reversed = new Set((reversalsResult.data ?? []).map((row) => row.reversal_of_movement_id).filter(Boolean))
  const groups = new Map<string, AccountMovement[]>()
  for (const movement of movementsResult.data ?? []) {
    if (!movement.transfer_group_id) continue
    groups.set(movement.transfer_group_id, [...(groups.get(movement.transfer_group_id) ?? []), movement])
  }
  const transfers: TransferRecord[] = []
  for (const [id, movements] of groups) {
    const outgoing = movements.find((movement) => movement.type === 'out')
    const incoming = movements.find((movement) => movement.type === 'in')
    if (!outgoing || !incoming) continue
    const source = accountMap.get(outgoing.account_id), destination = accountMap.get(incoming.account_id)
    transfers.push({
      id, source_movement_id: outgoing.id, destination_movement_id: incoming.id,
      source_account_id: outgoing.account_id, destination_account_id: incoming.account_id,
      source_account_name: source?.name ?? 'Conta indisponível', destination_account_name: destination?.name ?? 'Conta indisponível',
      source_account_active: source?.active ?? false, destination_account_active: destination?.active ?? false,
      amount: outgoing.amount, movement_date: outgoing.movement_date,
      description: outgoing.description === 'Transferência entre contas' ? null : outgoing.description,
      created_at: outgoing.created_at, reversed: reversed.has(outgoing.id) || reversed.has(incoming.id),
    })
  }
  return { accounts, transfers }
}

export async function createTransfer(draft: TransferDraft): Promise<string> {
  const groupId = crypto.randomUUID()
  const { data, error } = await getSupabaseClient().rpc('transfer_between_accounts', {
    p_from_account_id: draft.source_account_id, p_to_account_id: draft.destination_account_id,
    p_amount: draft.amount, p_movement_date: draft.movement_date,
    p_description: draft.description?.trim() || 'Transferência entre contas', p_transfer_group_id: groupId,
  })
  check(error)
  return data ?? groupId
}

export async function reverseTransfer(groupId: string, reversedAt: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('reverse_transfer_group', {
    p_transfer_group_id: groupId, p_reversed_at: reversedAt,
  })
  check(error)
}
