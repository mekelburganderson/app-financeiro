import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { todayISO } from '../../../lib/finance'
import type { Account } from '../../accounts/types'
import { paymentMethodLabels } from '../types'
import type { PaymentMethod } from '../types'

const methods = (Object.keys(paymentMethodLabels) as PaymentMethod[]).filter((value) => value !== 'credit_card') as Exclude<PaymentMethod, 'credit_card'>[]

export function ExpensePaymentDialog({ mode, accounts, busy, error, onCancel, onConfirm }: {
  mode: 'pay' | 'reverse'; accounts: Account[]; busy: boolean; error: string | null
  onCancel: () => void; onConfirm: (accountId: string, method: Exclude<PaymentMethod, 'credit_card'>, date: string) => Promise<void>
}) {
  const [accountId, setAccountId] = useState('')
  const [method, setMethod] = useState<Exclude<PaymentMethod, 'credit_card'>>('pix')
  const [date, setDate] = useState(todayISO())
  const [validation, setValidation] = useState<string | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const firstInput = useRef<HTMLSelectElement | HTMLInputElement>(null)
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; firstInput.current?.focus(); return () => previous?.focus() }, [])
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !busy) onCancel()
    if (event.key !== 'Tab') return
    const items = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)')
    if (!items?.length) return
    const first = items[0]!, last = items[items.length - 1]!
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!date) { setValidation('Informe a data da operação.'); return }
    if (mode === 'pay' && !accountId) { setValidation('Selecione a conta utilizada.'); return }
    setValidation(null); await onConfirm(accountId, method, date)
  }
  return <div className="account-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}>
    <div className="account-modal expense-payment-modal" role="dialog" aria-modal="true" aria-labelledby="expense-payment-title" ref={dialog} onKeyDown={keyDown}>
      <h2 id="expense-payment-title">{mode === 'pay' ? 'Marcar como paga' : 'Desfazer pagamento'}</h2>
      <p>{mode === 'pay' ? 'Informe de onde saiu o dinheiro.' : 'O saldo será recomposto por um movimento de reversão.'}</p>
      <form onSubmit={submit} noValidate>
        {mode === 'pay' && <>
          <label htmlFor="payment-dialog-account">Conta *</label>
          <select id="payment-dialog-account" ref={firstInput as React.RefObject<HTMLSelectElement>} value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={busy}>
            <option value="">Selecione</option>{accounts.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <label htmlFor="payment-dialog-method">Forma efetiva *</label>
          <select id="payment-dialog-method" value={method} onChange={(e) => setMethod(e.target.value as Exclude<PaymentMethod, 'credit_card'>)} disabled={busy}>
            {methods.map((value) => <option key={value} value={value}>{paymentMethodLabels[value]}</option>)}
          </select>
        </>}
        <label htmlFor="payment-dialog-date">{mode === 'pay' ? 'Data do pagamento' : 'Data do estorno'} *</label>
        <input id="payment-dialog-date" ref={mode === 'reverse' ? firstInput as React.RefObject<HTMLInputElement> : undefined} type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={busy} />
        {(validation || error) && <p className="account-form-error" role="alert">{validation || error}</p>}
        <div className="account-form-actions">
          <button type="button" className="account-secondary-button" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button type="submit" className="account-primary-button" disabled={busy}>{busy ? 'Processando…' : mode === 'pay' ? 'Confirmar pagamento' : 'Confirmar estorno'}</button>
        </div>
      </form>
    </div>
  </div>
}
