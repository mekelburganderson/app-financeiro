import { ArrowUpRight } from 'lucide-react'
import { formatBRDate, formatBRL } from '../../../lib/finance'
import { recurrenceLabels } from '../../expenses/types'
import type { IncomeRecord } from '../types'
export function IncomeCard({ income, busy, onEdit, onReceive, onReverse, onDelete }: { income: IncomeRecord; busy: boolean; onEdit: () => void; onReceive: () => void; onReverse: () => void; onDelete: () => void }) {
  const canDelete = income.status === 'pending' && !income.has_receipt_history
  return <article className="account-card income-card"><div className="account-card-top"><span className="account-card-icon"><ArrowUpRight size={22} aria-hidden="true" /></span><span className={income.status === 'settled' ? 'account-badge' : 'account-badge account-badge-inactive'}>{income.status === 'settled' ? 'Recebida' : 'Pendente'}</span></div>
    <h2>{income.description}</h2><p className="expense-category">{income.category_name} · {formatBRDate(income.transaction_date)}</p><p className="account-balance-label">Valor da receita</p><p className="account-balance">{formatBRL(income.amount)}</p>
    <div className="expense-details">{income.due_date && <span>Prevista para {formatBRDate(income.due_date)}</span>}{income.account_name && <span>Conta: {income.account_name}</span>}{income.recurrence_rule_id && <span>Recorrente{income.recurrence_frequency ? ` · ${recurrenceLabels[income.recurrence_frequency]} a cada ${income.recurrence_interval_count}` : ''}</span>}</div>
    {income.status === 'settled' && <p className="expense-guidance">Para alterar valores financeiros, desfaça o recebimento.</p>}
    <div className="account-card-actions"><button className="account-secondary-button" onClick={onEdit} disabled={busy}>Editar</button>{income.status === 'pending' && <button className="account-secondary-button" onClick={onReceive} disabled={busy}>Marcar como recebida</button>}{income.status === 'settled' && income.receipt_movement_id && <button className="account-text-button" onClick={onReverse} disabled={busy}>Desfazer recebimento</button>}{canDelete && <button className="account-text-button" onClick={onDelete} disabled={busy}>Excluir</button>}</div>
  </article>
}
