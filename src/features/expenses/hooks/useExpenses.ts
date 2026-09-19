import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { currentMonthBounds, todayISO } from '../../../lib/finance'
import { createCardExpense, createExpense, createInstallmentExpense, createPaidExpense,
  createRecurringExpense, deleteExpense, generateRecurringOccurrences, listExpenses,
  reverseExpensePayment, settleExpense, updateExpense } from '../services/expenses'
import type { ExpenseDataset, ExpenseDraft, ExpenseInput, ExpenseStatus, PaymentMethod } from '../types'

const initialPeriod = currentMonthBounds()

export function useExpenses(userId: string | null) {
  const [startDate, setStartDate] = useState(initialPeriod.start)
  const [endDate, setEndDate] = useState(initialPeriod.end)
  const [status, setStatus] = useState<ExpenseStatus | 'all'>('all')
  const [categoryId, setCategoryId] = useState('all')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | 'all'>('all')
  const [dataset, setDataset] = useState<ExpenseDataset>({ expenses: [], options: { categories: [], accounts: [], cards: [] } })
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  const invalidPeriod = !startDate || !endDate || startDate > endDate
  const key = userId ? `${userId}:${startDate}:${endDate}` : null

  useEffect(() => {
    if (!userId || invalidPeriod) return
    let cancelled = false
    listExpenses(userId, startDate, endDate).then((data) => {
      if (!cancelled) {
        setDataset(data)
        setLoadedKey(`${userId}:${startDate}:${endDate}`)
        setError(false)
      }
    }).catch(() => {
      if (!cancelled) {
        setLoadedKey(`${userId}:${startDate}:${endDate}`)
        setError(true)
      }
    })
    return () => { cancelled = true }
  }, [userId, startDate, endDate, invalidPeriod, revision])

  const belongsToQuery = !!key && loadedKey === key
  const options = belongsToQuery ? dataset.options : { categories: [], accounts: [], cards: [] }
  const expenses = useMemo(() => belongsToQuery ? dataset.expenses.filter((expense) =>
    (status === 'all' || expense.status === status) &&
    (categoryId === 'all' || expense.category_id === categoryId) &&
    (paymentMethod === 'all' || expense.planned_payment_method === paymentMethod),
  ) : [], [belongsToQuery, dataset, status, categoryId, paymentMethod])

  async function execute<T>(operation: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
    if (pending.current) return { ok: false, error: new Error('Operação em andamento.') }
    pending.current = true
    setBusy(true)
    try {
      const value = await operation()
      refresh()
      return { ok: true, value }
    } catch (operationError) {
      return { ok: false, error: operationError }
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  function create(draft: ExpenseDraft) {
    return execute(async () => {
      if (draft.recurrence) {
        await createRecurringExpense({ ...draft.input, ...draft.recurrence }, todayISO())
      } else if (draft.installments) {
        if (draft.input.planned_payment_method === 'credit_card') await createCardExpense(draft.input, draft.installments)
        else await createInstallmentExpense(draft.input, draft.installments)
      } else if (draft.input.planned_payment_method === 'credit_card') {
        await createCardExpense(draft.input)
      } else if (draft.status === 'settled' && draft.payment) {
        await createPaidExpense({ ...draft.input,
          payment_account_id: draft.payment.account_id,
          actual_payment_method: draft.payment.method, settled_at: draft.payment.settled_at })
      } else {
        if (!userId) throw new Error('Usuário não autenticado.')
        await createExpense(userId, draft.input)
      }
    })
  }

  function update(expenseId: string, input: ExpenseInput) { return execute(() => updateExpense(expenseId, input)) }
  function remove(expenseId: string) {
    return execute(() => {
      if (!userId) throw new Error('Usuário não autenticado.')
      return deleteExpense(userId, expenseId)
    })
  }
  function pay(expenseId: string, accountId: string, method: Exclude<PaymentMethod, 'credit_card'>, date: string) {
    return execute(() => settleExpense(expenseId, accountId, method, date))
  }
  function reverse(movementId: string, date: string) { return execute(() => reverseExpensePayment(movementId, date)) }
  function generate() { return execute(() => generateRecurringOccurrences(todayISO())) }

  return {
    expenses, allExpenses: belongsToQuery ? dataset.expenses : [], options,
    loading: !!key && !invalidPeriod && !belongsToQuery,
    error: belongsToQuery && error, invalidPeriod, refresh, busy,
    filters: { startDate, endDate, status, categoryId, paymentMethod },
    setStartDate, setEndDate, setStatus, setCategoryId, setPaymentMethod,
    create, update, remove, pay, reverse, generate,
  }
}
