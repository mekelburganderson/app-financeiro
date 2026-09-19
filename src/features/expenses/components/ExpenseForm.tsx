import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { moneyForInput, parseMoneyInput, todayISO } from '../../../lib/finance'
import type { ExpenseDraft, ExpenseOptions, ExpenseRecord, ExpenseStatus, PaymentMethod, RecurrenceFrequency } from '../types'
import { paymentMethodLabels } from '../types'
import { ExpenseInstallmentFields } from './ExpenseInstallmentFields'
import { ExpenseRecurrenceFields } from './ExpenseRecurrenceFields'

const methods = Object.keys(paymentMethodLabels) as PaymentMethod[]
const directAccountMethods: PaymentMethod[] = ['pix', 'debit_card', 'cash']

export function ExpenseForm({ expense, options, busy, error, onCancel, onSave }: {
  expense: ExpenseRecord | null; options: ExpenseOptions; busy: boolean; error: string | null
  onCancel: () => void; onSave: (draft: ExpenseDraft) => Promise<void>
}) {
  const editing = !!expense
  const financiallyLocked = !!expense && (expense.status === 'settled' || !!expense.installment_group_id ||
    expense.has_payment_history || expense.invoice_status === 'closed' || expense.invoice_status === 'paid')
  const [description, setDescription] = useState(expense?.description ?? '')
  const [categoryId, setCategoryId] = useState(expense?.category_id ?? '')
  const [amount, setAmount] = useState(expense ? moneyForInput(expense.amount) : '')
  const [transactionDate, setTransactionDate] = useState(expense?.transaction_date ?? todayISO())
  const [dueDate, setDueDate] = useState(expense?.due_date ?? '')
  const [method, setMethod] = useState<PaymentMethod>(expense?.planned_payment_method ?? 'pix')
  const [cardId, setCardId] = useState(expense?.credit_card_id ?? '')
  const [accountId, setAccountId] = useState(expense?.account_id ?? '')
  const [status, setStatus] = useState<ExpenseStatus>(expense?.status ?? 'pending')
  const [notes, setNotes] = useState(expense?.notes ?? '')
  const [installment, setInstallment] = useState(false)
  const [installmentCount, setInstallmentCount] = useState('2')
  const [recurring, setRecurring] = useState(false)
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('monthly')
  const [interval, setInterval] = useState('1')
  const [ending, setEnding] = useState<'none' | 'date' | 'count'>('none')
  const [endDate, setEndDate] = useState('')
  const [maxOccurrences, setMaxOccurrences] = useState('')
  const [paymentAccountId, setPaymentAccountId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<Exclude<PaymentMethod, 'credit_card'>>('pix')
  const [settledAt, setSettledAt] = useState(todayISO())
  const [validation, setValidation] = useState<string | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const firstInput = useRef<HTMLInputElement>(null)
  const activeCategories = options.categories.filter((item) => item.active || item.id === expense?.category_id)
  const activeAccounts = options.accounts.filter((item) => item.active || item.id === expense?.account_id)
    .sort((a, b) => Number(b.type === 'cash') - Number(a.type === 'cash') || a.name.localeCompare(b.name, 'pt-BR'))
  const activeCards = options.cards.filter((item) => item.active || item.id === expense?.credit_card_id)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    firstInput.current?.focus()
    return () => previous?.focus()
  }, [])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !busy) onCancel()
    if (event.key !== 'Tab') return
    const elements = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')
    if (!elements?.length) return
    const first = elements[0]!, last = elements[elements.length - 1]!
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const parsedAmount = parseMoneyInput(amount)
    const installments = Number(installmentCount)
    const recurrenceInterval = Number(interval)
    const occurrenceCount = Number(maxOccurrences)
    if (!description.trim()) { setValidation('Informe a descrição da despesa.'); return }
    if (!categoryId) { setValidation('Selecione uma categoria de despesa.'); return }
    if (parsedAmount === null || parsedAmount <= 0) { setValidation('Informe um valor maior que zero.'); return }
    if (!transactionDate) { setValidation('Informe a data do lançamento.'); return }
    if (method === 'credit_card' && !cardId) { setValidation('Selecione um cartão ativo.'); return }
    if (directAccountMethods.includes(method) && !accountId) { setValidation('Selecione a conta vinculada a esta forma de pagamento.'); return }
    if (installment && recurring) { setValidation('Escolha parcelamento ou recorrência.'); return }
    if (installment && (!Number.isInteger(installments) || installments < 2 || installments > 600)) {
      setValidation('Informe um número de parcelas entre 2 e 600.'); return
    }
    if (recurring && (!Number.isInteger(recurrenceInterval) || recurrenceInterval < 1)) {
      setValidation('Informe um intervalo de recorrência válido.'); return
    }
    if (recurring && ending === 'date' && (!endDate || endDate < transactionDate)) {
      setValidation('Informe uma data final igual ou posterior ao início.'); return
    }
    if (recurring && ending === 'count' && (!Number.isInteger(occurrenceCount) || occurrenceCount < 1)) {
      setValidation('Informe uma quantidade de ocorrências válida.'); return
    }
    if (!editing && status === 'settled' && (!paymentAccountId || !settledAt)) {
      setValidation('Informe a conta e a data do pagamento.'); return
    }
    if (!editing && method === 'credit_card' && status === 'settled') {
      setValidation('Compras no cartão são pagas pela fatura.'); return
    }
    if (!editing && status === 'settled' && (installment || recurring)) {
      setValidation('Crie parcelamentos e recorrências como pendentes.'); return
    }
    setValidation(null)
    await onSave({
      input: {
        description: description.trim(), category_id: categoryId, amount: parsedAmount,
        transaction_date: transactionDate, due_date: method === 'credit_card' ? null : dueDate || null,
        planned_payment_method: method, credit_card_id: method === 'credit_card' ? cardId : null,
        account_id: method === 'credit_card' ? null : accountId || null, notes: notes.trim() || null,
      },
      status: method === 'credit_card' ? 'pending' : status,
      installments: installment ? installments : null,
      recurrence: recurring ? {
        frequency, interval_count: recurrenceInterval,
        end_date: ending === 'date' ? endDate : null,
        max_occurrences: ending === 'count' ? occurrenceCount : null,
      } : null,
      payment: !editing && status === 'settled' ? {
        account_id: paymentAccountId, method: paymentMethod, settled_at: settledAt,
      } : null,
    })
  }

  const formError = validation || error
  return <div className="account-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel() }}>
    <div className="account-modal expense-modal" role="dialog" aria-modal="true" aria-labelledby="expense-form-title" onKeyDown={handleKeyDown} ref={dialog}>
      <h2 id="expense-form-title">{editing ? 'Editar despesa' : 'Nova despesa'}</h2>
      <p>Os campos marcados com * são obrigatórios.</p>
      {financiallyLocked && <p className="expense-lock-note">Há histórico financeiro. Apenas descrição e notas podem ser alteradas.</p>}
      <form onSubmit={submit} noValidate>
        <label htmlFor="expense-description">Descrição *</label>
        <input id="expense-description" ref={firstInput} value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} maxLength={160} />
        <div className="expense-form-grid">
          <label htmlFor="expense-category">Categoria *
            <select id="expense-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={busy || financiallyLocked}>
              <option value="">Selecione</option>{activeCategories.map((item) => <option key={item.id} value={item.id}>{item.name}{item.active ? '' : ' (inativa)'}</option>)}
            </select>
          </label>
          <label htmlFor="expense-amount">Valor (R$) *
            <input id="expense-amount" value={amount} inputMode="decimal" placeholder="0,00" onChange={(e) => setAmount(e.target.value)} disabled={busy || financiallyLocked} />
          </label>
          <label htmlFor="expense-date">Data do lançamento *
            <input id="expense-date" type="date" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} disabled={busy || financiallyLocked} />
          </label>
          {method !== 'credit_card' && <label htmlFor="expense-due-date">Data de vencimento
            <input id="expense-due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={busy || financiallyLocked} />
          </label>}
          <label htmlFor="expense-method">Forma prevista *
            <select id="expense-method" value={method} onChange={(e) => { const value = e.target.value as PaymentMethod; setMethod(value); if (value === 'credit_card') setStatus('pending') }} disabled={busy || financiallyLocked}>
              {methods.map((value) => <option key={value} value={value}>{paymentMethodLabels[value]}</option>)}
            </select>
          </label>
          {method === 'credit_card' ? <label htmlFor="expense-card">Cartão *
            <select id="expense-card" value={cardId} onChange={(e) => setCardId(e.target.value)} disabled={busy || financiallyLocked}>
              <option value="">Selecione</option>{activeCards.map((item) => <option key={item.id} value={item.id}>{item.name}{item.active ? '' : ' (inativo)'}</option>)}
            </select>
          </label> : <label htmlFor="expense-account">Conta{directAccountMethods.includes(method) ? ' *' : ''}
            <select id="expense-account" value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={busy || financiallyLocked}>
              <option value="">{directAccountMethods.includes(method) ? 'Selecione' : 'Não informada'}</option>{activeAccounts.map((item) => <option key={item.id} value={item.id}>{item.name}{item.type === 'cash' ? ' · Dinheiro' : ''}</option>)}
            </select>
          </label>}
          {!editing && <label htmlFor="expense-status">Status inicial *
            <select id="expense-status" value={status} onChange={(e) => setStatus(e.target.value as ExpenseStatus)} disabled={busy || method === 'credit_card' || installment || recurring}>
              <option value="pending">Pendente</option><option value="settled">Paga</option>
            </select>
          </label>}
        </div>
        {!editing && <div className="expense-extra-grid">
          <ExpenseInstallmentFields checked={installment} count={installmentCount} disabled={busy || recurring || status === 'settled'} onChecked={setInstallment} onCount={setInstallmentCount} />
          <ExpenseRecurrenceFields checked={recurring} frequency={frequency} interval={interval} ending={ending} endDate={endDate} maxOccurrences={maxOccurrences}
            disabled={busy || installment || status === 'settled'} onChecked={setRecurring} onFrequency={setFrequency} onInterval={setInterval} onEnding={setEnding} onEndDate={setEndDate} onMaxOccurrences={setMaxOccurrences} />
        </div>}
        {!editing && status === 'settled' && method !== 'credit_card' && <fieldset className="expense-payment-fields">
          <legend>Dados do pagamento</legend>
          <div className="expense-form-grid">
            <label htmlFor="expense-payment-account">Conta utilizada *
              <select id="expense-payment-account" value={paymentAccountId} onChange={(e) => setPaymentAccountId(e.target.value)} disabled={busy}>
                <option value="">Selecione</option>{activeAccounts.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label htmlFor="expense-payment-method">Forma efetiva *
              <select id="expense-payment-method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as Exclude<PaymentMethod, 'credit_card'>)} disabled={busy}>
                {methods.filter((value) => value !== 'credit_card').map((value) => <option key={value} value={value}>{paymentMethodLabels[value]}</option>)}
              </select>
            </label>
            <label htmlFor="expense-settled-at">Data do pagamento *
              <input id="expense-settled-at" type="date" value={settledAt} onChange={(e) => setSettledAt(e.target.value)} disabled={busy} />
            </label>
          </div>
        </fieldset>}
        <label htmlFor="expense-notes">Notas</label>
        <textarea id="expense-notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy} rows={3} maxLength={1000} />
        {formError && <p id="expense-form-error" className="account-form-error" role="alert">{formError}</p>}
        <div className="account-form-actions">
          <button type="button" className="account-secondary-button" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button type="submit" className="account-primary-button" disabled={busy}>{busy ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar despesa'}</button>
        </div>
      </form>
    </div>
  </div>
}
