import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { currentMonthBounds, todayISO } from '../../../lib/finance'
import { createIncome, createReceivedIncome, createRecurringIncome, deleteIncome, generateIncomeOccurrences,
  listIncomes, reverseIncomeReceipt, settleIncome, updateIncome } from '../services/incomes'
import type { IncomeDataset, IncomeDraft, IncomeInput, IncomeStatus } from '../types'
const initial = currentMonthBounds()
export function useIncomes(userId: string | null) {
  const [startDate, setStartDate] = useState(initial.start), [endDate, setEndDate] = useState(initial.end)
  const [status, setStatus] = useState<IncomeStatus | 'all'>('all'), [categoryId, setCategoryId] = useState('all')
  const [dataset, setDataset] = useState<IncomeDataset>({ incomes: [], options: { categories: [], accounts: [] } })
  const [loadedKey, setLoadedKey] = useState<string | null>(null), [error, setError] = useState(false), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0)
  const pending = useRef(false), invalidPeriod = !startDate || !endDate || startDate > endDate
  const key = userId ? `${userId}:${startDate}:${endDate}` : null; const refresh = useCallback(() => setRevision((v) => v + 1), [])
  useEffect(() => { if (!userId || invalidPeriod) return; let cancelled = false
    listIncomes(userId, startDate, endDate).then((data) => { if (!cancelled) { setDataset(data); setLoadedKey(`${userId}:${startDate}:${endDate}`); setError(false) } }).catch(() => { if (!cancelled) { setLoadedKey(`${userId}:${startDate}:${endDate}`); setError(true) } })
    return () => { cancelled = true }
  }, [userId, startDate, endDate, invalidPeriod, revision])
  const belongs = !!key && loadedKey === key
  const incomes = useMemo(() => belongs ? dataset.incomes.filter((item) => (status === 'all' || item.status === status) && (categoryId === 'all' || item.category_id === categoryId)) : [], [belongs, dataset, status, categoryId])
  async function execute<T>(operation: () => Promise<T>) { if (pending.current) return { ok: false as const, error: new Error('Operação em andamento.') }; pending.current = true; setBusy(true); try { const value = await operation(); refresh(); return { ok: true as const, value } } catch (operationError) { return { ok: false as const, error: operationError } } finally { pending.current = false; setBusy(false) } }
  function create(draft: IncomeDraft) { return execute(async () => { if (draft.recurrence) await createRecurringIncome(draft.input, draft.recurrence, todayISO()); else if (draft.status === 'settled' && draft.receipt) await createReceivedIncome(draft.input, draft.receipt.account_id, draft.receipt.received_at); else { if (!userId) throw new Error('Usuário não autenticado.'); await createIncome(userId, draft.input) } }) }
  return { incomes, allIncomes: belongs ? dataset.incomes : [], options: belongs ? dataset.options : { categories: [], accounts: [] }, loading: !!key && !invalidPeriod && !belongs, error: belongs && error, busy, invalidPeriod, refresh,
    filters: { startDate, endDate, status, categoryId }, setStartDate, setEndDate, setStatus, setCategoryId,
    create, update: (id: string, input: IncomeInput) => execute(() => updateIncome(id, input)),
    remove: (id: string) => execute(() => { if (!userId) throw new Error('Usuário não autenticado.'); return deleteIncome(userId, id) }),
    receive: (id: string, accountId: string, date: string) => execute(() => settleIncome(id, accountId, date)),
    reverse: (movementId: string, date: string) => execute(() => reverseIncomeReceipt(movementId, date)),
    generate: () => execute(() => generateIncomeOccurrences(todayISO())) }
}
