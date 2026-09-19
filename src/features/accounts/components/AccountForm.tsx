import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { isValidDate, moneyForInput, parseMoneyInput, todayISO } from '../../../lib/finance'
import { accountTypeLabels } from '../types'
import type { Account, AccountInput, AccountType } from '../types'

const types = Object.keys(accountTypeLabels) as AccountType[]

export function AccountForm({ account, busy, error, onCancel, onSave }: {
  account: Account | null
  busy: boolean
  error: string | null
  onCancel: () => void
  onSave: (input: AccountInput) => Promise<void>
}) {
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType | ''>(account?.type ?? 'checking')
  const [balance, setBalance] = useState(account ? moneyForInput(account.initial_balance) : '0')
  const [date, setDate] = useState(account?.initial_balance_date ?? todayISO())
  const [validation, setValidation] = useState<string | null>(null)
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const trimmedName = name.trim()
    const parsedBalance = parseMoneyInput(balance)
    if (!trimmedName) { setValidation('Informe o nome da conta.'); return }
    if (!type || !types.includes(type)) { setValidation('Selecione um tipo de conta válido.'); return }
    if (parsedBalance === null) { setValidation('Informe um saldo inicial válido, como 1.234,56 ou -50,00.'); return }
    if (!isValidDate(date)) { setValidation('Informe uma data do saldo inicial válida.'); return }
    setValidation(null)
    await onSave({ name: trimmedName, type, initial_balance: parsedBalance, initial_balance_date: date })
  }

  return <div className="account-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel() }}>
    <div className="account-modal" role="dialog" aria-modal="true" aria-labelledby="account-form-title" onKeyDown={handleKeyDown} ref={dialog}>
      <h2 id="account-form-title">{account ? 'Editar conta' : 'Nova conta'}</h2>
      <p>Os campos marcados com * são obrigatórios.</p>
      <form onSubmit={submit} noValidate>
        <label htmlFor="account-name">Nome da conta *</label>
        <input id="account-name" ref={nameInput} value={name} onChange={(event) => setName(event.target.value)} required disabled={busy} maxLength={120} />
        <label htmlFor="account-type">Tipo *</label>
        <select id="account-type" value={type} onChange={(event) => setType(event.target.value as AccountType)} required disabled={busy}>
          {types.map((value) => <option key={value} value={value}>{accountTypeLabels[value]}</option>)}
        </select>
        <label htmlFor="account-balance">Saldo inicial (R$) *</label>
        <input id="account-balance" type="text" inputMode="decimal" value={balance} onChange={(event) => setBalance(event.target.value)} required disabled={busy} placeholder="0,00" aria-describedby="account-money-help" />
        <small id="account-money-help">Aceita zero, centavos e valores negativos. Ex.: -50,00</small>
        <label htmlFor="account-date">Data do saldo inicial *</label>
        <input id="account-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required disabled={busy} />
        {(validation || error) && <p className="account-form-error" role="alert">{validation || error}</p>}
        <div className="account-form-actions">
          <button type="button" className="account-secondary-button" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button type="submit" className="account-primary-button" disabled={busy}>{busy ? 'Salvando…' : account ? 'Salvar alterações' : 'Criar conta'}</button>
        </div>
      </form>
    </div>
  </div>
}
