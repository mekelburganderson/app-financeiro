import { ArrowDownUp } from 'lucide-react'
import { formatBRDate, formatBRL } from '../../../lib/finance'
import type { TransferRecord } from '../types'

export function TransferCard({ transfer, busy, onReverse }: { transfer:TransferRecord; busy:boolean; onReverse:()=>void }) {
  return <article className="account-card transfer-card">
    <div className="account-card-top"><span className="account-card-icon"><ArrowDownUp size={22} aria-hidden="true"/></span><span className={transfer.reversed?'account-badge account-badge-inactive':'account-badge'}>{transfer.reversed?'Desfeita':'Concluída'}</span></div>
    <div className="transfer-route"><div><span>Origem</span><strong>{transfer.source_account_name}{transfer.source_account_active?'':' · Inativa'}</strong></div><span className="transfer-arrow" aria-hidden="true">↓</span><div><span>Destino</span><strong>{transfer.destination_account_name}{transfer.destination_account_active?'':' · Inativa'}</strong></div></div>
    <p className="account-balance-label">Valor transferido</p><p className="account-balance">{formatBRL(transfer.amount)}</p>
    <div className="expense-details"><span>{formatBRDate(transfer.movement_date)}</span>{transfer.description&&<span>{transfer.description}</span>}</div>
    <div className="account-card-actions">{!transfer.reversed&&<button className="account-text-button" onClick={onReverse} disabled={busy}>Desfazer transferência</button>}</div>
  </article>
}
