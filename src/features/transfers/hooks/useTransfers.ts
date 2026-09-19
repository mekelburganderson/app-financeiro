import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createTransfer, listTransfers, reverseTransfer } from '../services/transfers'
import type { TransferDataset, TransferDraft } from '../types'

export function useTransfers(userId: string | null) {
  const [dataset, setDataset] = useState<TransferDataset>({ transfers: [], accounts: [] })
  const [loadedFor, setLoadedFor] = useState<string|null>(null), [error, setError] = useState(false)
  const [busy, setBusy] = useState(false), [revision, setRevision] = useState(0)
  const [startDate, setStartDate] = useState(''), [endDate, setEndDate] = useState(''), [accountId, setAccountId] = useState('all')
  const pending = useRef(false), refresh = useCallback(() => setRevision((value) => value + 1), [])
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    listTransfers(userId).then((result) => { if (!cancelled) { setDataset(result); setLoadedFor(userId); setError(false) } })
      .catch(() => { if (!cancelled) { setLoadedFor(userId); setError(true) } })
    return () => { cancelled = true }
  }, [userId, revision])
  const belongs = !!userId && loadedFor === userId
  const transfers = useMemo(() => belongs ? dataset.transfers.filter((transfer) =>
    (!startDate || transfer.movement_date >= startDate) && (!endDate || transfer.movement_date <= endDate) &&
    (accountId === 'all' || transfer.source_account_id === accountId || transfer.destination_account_id === accountId))
    .sort((a,b) => b.movement_date.localeCompare(a.movement_date) || b.created_at.localeCompare(a.created_at)) : [],
  [belongs, dataset.transfers, startDate, endDate, accountId])
  async function execute(operation: () => Promise<unknown>) {
    if (pending.current) return { ok: false as const, error: new Error('Operação em andamento.') }
    pending.current = true; setBusy(true)
    try { await operation(); refresh(); return { ok: true as const } }
    catch (operationError) { return { ok: false as const, error: operationError } }
    finally { pending.current = false; setBusy(false) }
  }
  return {
    transfers, accounts: belongs ? dataset.accounts : [], loading: !!userId && !belongs, error: belongs && error, busy, refresh,
    filters: { startDate, endDate, accountId }, setStartDate, setEndDate, setAccountId,
    create: (draft: TransferDraft) => execute(() => createTransfer(draft)),
    reverse: (id: string, date: string) => execute(() => reverseTransfer(id, date)),
  }
}
