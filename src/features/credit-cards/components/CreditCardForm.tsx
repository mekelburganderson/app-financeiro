import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { moneyForInput, parseMoneyInput } from '../../../lib/finance'
import { formatCardDay, parseCardDay } from '../days'
import type { CreditCard, CreditCardInput } from '../types'

type Field = 'name' | 'limit' | 'closing' | 'due'

export function CreditCardForm({ card, busy, error, onCancel, onSave }: {
  card: CreditCard | null
  busy: boolean
  error: string | null
  onCancel: () => void
  onSave: (input: CreditCardInput) => Promise<void>
}) {
  const [name, setName] = useState(card?.name ?? '')
  const [limit, setLimit] = useState(card ? moneyForInput(card.limit_amount) : '0')
  const [closing, setClosing] = useState(card ? formatCardDay(card.closing_day) : '')
  const [due, setDue] = useState(card ? formatCardDay(card.due_day) : '')
  const [validation, setValidation] = useState<{ field: Field; text: string } | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    nameInput.current?.focus()
    return () => previous?.focus()
  }, [])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !busy) onCancel()
    if (event.key !== 'Tab') return
    const elements = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)')
    if (!elements?.length) return
    const first = elements[0]!, last = elements[elements.length - 1]!
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  function describedBy(field: Field): string | undefined {
    return validation?.field === field || error ? 'credit-card-form-error' : undefined
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const trimmed = name.trim()
    const parsedLimit = parseMoneyInput(limit)
    const closingDay = parseCardDay(closing)
    const dueDay = parseCardDay(due)
    if (!trimmed) { setValidation({ field: 'name', text: 'Informe o nome do cartão.' }); return }
    if (parsedLimit === null || parsedLimit < 0) { setValidation({ field: 'limit', text: 'Informe um limite válido, igual ou maior que zero.' }); return }
    if (closingDay === null) { setValidation({ field: 'closing', text: 'Informe um dia de fechamento inteiro entre 1 e 31.' }); return }
    if (dueDay === null) { setValidation({ field: 'due', text: 'Informe um dia de vencimento inteiro entre 1 e 31.' }); return }
    setValidation(null)
    await onSave({ name: trimmed, limit_amount: parsedLimit, closing_day: closingDay, due_day: dueDay })
  }

  const fieldError = validation?.text || error
  return <div className="account-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel() }}>
    <div className="account-modal" role="dialog" aria-modal="true" aria-labelledby="credit-card-form-title" onKeyDown={handleKeyDown} ref={dialog}>
      <h2 id="credit-card-form-title">{card ? 'Editar cartão' : 'Novo cartão'}</h2>
      <p>Os campos marcados com * são obrigatórios.</p>
      <form onSubmit={submit} noValidate>
        <label htmlFor="credit-card-name">Nome do cartão *</label>
        <input id="credit-card-name" ref={nameInput} value={name} onChange={(event) => setName(event.target.value)}
          required disabled={busy} maxLength={120} aria-invalid={validation?.field === 'name' || !!error} aria-describedby={describedBy('name')} />
        <label htmlFor="credit-card-limit">Limite (R$) *</label>
        <input id="credit-card-limit" type="text" inputMode="decimal" value={limit} onChange={(event) => setLimit(event.target.value)}
          required disabled={busy} placeholder="0,00" aria-invalid={validation?.field === 'limit'} aria-describedby={describedBy('limit')} />
        <label htmlFor="credit-card-closing">Dia de fechamento *</label>
        <input id="credit-card-closing" type="text" inputMode="numeric" value={closing} onChange={(event) => setClosing(event.target.value)}
          required disabled={busy} maxLength={2} placeholder="25" aria-invalid={validation?.field === 'closing'} aria-describedby={describedBy('closing')} />
        <label htmlFor="credit-card-due">Dia de vencimento *</label>
        <input id="credit-card-due" type="text" inputMode="numeric" value={due} onChange={(event) => setDue(event.target.value)}
          required disabled={busy} maxLength={2} placeholder="03" aria-invalid={validation?.field === 'due'} aria-describedby={describedBy('due')} />
        {card && <small>Alterações nos dias serão usadas em faturas criadas depois desta edição. Faturas já existentes, mesmo de meses futuros, mantêm suas datas.</small>}
        {fieldError && <p id="credit-card-form-error" className="account-form-error" role="alert">{fieldError}</p>}
        <div className="account-form-actions">
          <button type="button" className="account-secondary-button" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button type="submit" className="account-primary-button" disabled={busy}>{busy ? 'Salvando…' : card ? 'Salvar alterações' : 'Criar cartão'}</button>
        </div>
      </form>
    </div>
  </div>
}
