import { useEffect, useRef } from 'react'
import { ModalSurface } from '../../../components/ModalSurface'
import { formatBRDate, formatBRL } from '../../../lib/finance'
import { formatReferenceMonth, invoiceStatusLabels } from '../types'
import type { InvoiceDetailsData } from '../types'

export function InvoiceDetails({data,onClose}:{data:InvoiceDetailsData;onClose:()=>void}){
  const{invoice,items}=data,closeButton=useRef<HTMLButtonElement>(null)
  useEffect(()=>{const old=document.activeElement as HTMLElement|null;closeButton.current?.focus();return()=>old?.focus()},[])
  return <ModalSurface titleId="invoice-details-title" className="account-modal invoice-details-modal" onClose={onClose}><div className="invoice-details-heading"><div><p>{invoice.card_name}</p><h2 id="invoice-details-title">{formatReferenceMonth(invoice.reference_month)}</h2></div><button ref={closeButton} className="account-text-button" onClick={onClose} aria-label="Fechar detalhes">Fechar</button></div><div className="invoice-detail-summary"><span>Total <strong>{formatBRL(invoice.total_amount)}</strong></span><span>Status <strong>{invoiceStatusLabels[invoice.status]}</strong></span><span>Fechamento <strong>{formatBRDate(invoice.closing_date)}</strong></span><span>Vencimento <strong>{formatBRDate(invoice.due_date)}</strong></span></div><h3>Compras da fatura</h3>{!items.length?<p className="invoice-empty-items">Nenhum lançamento nesta fatura.</p>:<div className="invoice-items">{items.map((item)=><article key={item.id}><div><strong>{item.description}</strong><span>{item.category_name} · {formatBRDate(item.transaction_date)}</span>{item.installment_number&&<span>Parcela {item.installment_number}/{item.installment_total}</span>}{item.recurrence_rule_id&&<span>Recorrente</span>}</div><strong>{formatBRL(item.amount)}</strong></article>)}</div>}</ModalSurface>
}
