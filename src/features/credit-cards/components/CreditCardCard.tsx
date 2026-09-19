import { CreditCard as CreditCardIcon } from 'lucide-react'
import { formatBRL } from '../../../lib/finance'
import { formatCardDay } from '../days'
import type { CreditCard } from '../types'

export function CreditCardCard({ card, busy, onEdit, onChangeStatus }: {
  card: CreditCard
  busy: boolean
  onEdit: () => void
  onChangeStatus: () => void
}) {
  return <article className="account-card credit-card-card">
    <div className="account-card-top">
      <span className="account-card-icon"><CreditCardIcon size={22} aria-hidden="true" /></span>
      <span className={card.active ? 'account-badge' : 'account-badge account-badge-inactive'}>{card.active ? 'Ativo' : 'Inativo'}</span>
    </div>
    <h2>{card.name}</h2>
    <p className="account-balance-label">Limite cadastrado</p>
    <p className="account-balance">{formatBRL(card.limit_amount)}</p>
    <div className="credit-card-days"><span>Fecha dia {formatCardDay(card.closing_day)}</span><span>Vence dia {formatCardDay(card.due_day)}</span></div>
    <div className="account-card-actions">
      <button className="account-secondary-button" onClick={onEdit} disabled={busy}>Editar</button>
      <button className="account-text-button" onClick={onChangeStatus} disabled={busy}>{busy ? 'Aguarde…' : card.active ? 'Desativar' : 'Reativar'}</button>
    </div>
  </article>
}
