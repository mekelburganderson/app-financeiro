import { ArrowDownLeft } from 'lucide-react'
import { formatBRDate, formatBRL } from '../../../lib/finance'
import { paymentMethodLabels, recurrenceLabels } from '../types'
import type { ExpenseRecord } from '../types'

export function ExpenseCard({ expense, busy, onEdit, onPay, onReverse, onDelete }: {
  expense: ExpenseRecord; busy: boolean
  onEdit: () => void; onPay: () => void; onReverse: () => void; onDelete: () => void
}) {
  const cardPurchase = expense.planned_payment_method === 'credit_card'
  const invoiceLocked = expense.invoice_status === 'closed' || expense.invoice_status === 'paid'
  const canDelete = expense.status === 'pending' && !expense.installment_group_id &&
    !expense.has_payment_history && !invoiceLocked
  const invoiceMonth = expense.invoice_reference_month
    ? `${expense.invoice_reference_month.slice(5, 7)}/${expense.invoice_reference_month.slice(0, 4)}` : null

  return <article className="account-card expense-card">
    <div className="account-card-top">
      <span className="account-card-icon"><ArrowDownLeft size={22} aria-hidden="true" /></span>
      <span className={expense.status === 'settled' ? 'account-badge' : 'account-badge account-badge-inactive'}>
        {expense.status === 'settled' ? 'Paga' : 'Pendente'}
      </span>
    </div>
    <h2>{expense.description}</h2>
    <p className="expense-category">{expense.category_name} · {formatBRDate(expense.transaction_date)}</p>
    <p className="account-balance-label">Valor da despesa</p>
    <p className="account-balance">{formatBRL(expense.amount)}</p>
    <div className="expense-details">
      <span>{expense.planned_payment_method ? paymentMethodLabels[expense.planned_payment_method] : 'Forma não informada'}</span>
      {!cardPurchase && expense.due_date && <span>Vence em {formatBRDate(expense.due_date)}</span>}
      {expense.account_name && <span>Conta: {expense.account_name}</span>}
      {cardPurchase && <span>Cartão: {expense.card_name ?? 'Cartão indisponível'}</span>}
      {invoiceMonth && <span>Fatura {invoiceMonth} · {expense.invoice_status === 'open' ? 'Aberta' : expense.invoice_status === 'closed' ? 'Fechada' : 'Paga'}</span>}
      {expense.installment_number && expense.installment_total && <span>Parcela {expense.installment_number} de {expense.installment_total}{expense.installment_description ? ` · ${expense.installment_description}` : ''}</span>}
      {expense.recurrence_rule_id && <span>Recorrente{expense.recurrence_frequency ? ` · ${recurrenceLabels[expense.recurrence_frequency]} a cada ${expense.recurrence_interval_count}` : ''}</span>}
    </div>
    {cardPurchase && <p className="expense-guidance">Pagamento ocorre pela fatura.</p>}
    {invoiceLocked && <p className="expense-guidance expense-guidance-warning">Esta despesa pertence a uma fatura fechada e não pode mais ser alterada financeiramente.</p>}
    <div className="account-card-actions">
      <button className="account-secondary-button" onClick={onEdit} disabled={busy}>Editar</button>
      {expense.status === 'pending' && !cardPurchase && <button className="account-secondary-button" onClick={onPay} disabled={busy}>Marcar como paga</button>}
      {expense.status === 'settled' && !cardPurchase && expense.payment_movement_id &&
        <button className="account-text-button" onClick={onReverse} disabled={busy}>Desfazer pagamento</button>}
      {canDelete && <button className="account-text-button" onClick={onDelete} disabled={busy}>Excluir</button>}
    </div>
  </article>
}
