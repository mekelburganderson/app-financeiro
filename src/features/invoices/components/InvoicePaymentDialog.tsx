import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ModalSurface } from '../../../components/ModalSurface'
import { formatBRL, todayISO } from '../../../lib/finance'
import type { Account } from '../../accounts/types'

export function InvoicePaymentDialog({accounts,total,busy,error,onCancel,onConfirm}:{accounts:Account[];total:number;busy:boolean;error:string|null;onCancel:()=>void;onConfirm:(accountId:string,date:string)=>Promise<void>}){
  const[accountId,setAccountId]=useState(''),[date,setDate]=useState(todayISO()),[validation,setValidation]=useState<string|null>(null),first=useRef<HTMLSelectElement>(null)
  useEffect(()=>{const old=document.activeElement as HTMLElement|null;first.current?.focus();return()=>old?.focus()},[])
  async function submit(event:FormEvent){event.preventDefault();if(!accountId){setValidation('Selecione a conta de pagamento.');return}if(!date){setValidation('Informe a data do pagamento.');return}setValidation(null);await onConfirm(accountId,date)}
  return <ModalSurface titleId="invoice-payment-title" busy={busy} onClose={onCancel}><h2 id="invoice-payment-title">Pagar fatura</h2><p>Valor da fatura: <strong>{formatBRL(total)}</strong></p><form onSubmit={submit} noValidate><label htmlFor="invoice-payment-account">Conta de pagamento *</label><select id="invoice-payment-account" ref={first} value={accountId} onChange={(event)=>setAccountId(event.target.value)} disabled={busy}><option value="">Selecione</option>{accounts.filter((account)=>account.active).map((account)=><option key={account.id} value={account.id}>{account.name}</option>)}</select><label htmlFor="invoice-payment-date">Data do pagamento *</label><input id="invoice-payment-date" type="date" value={date} onChange={(event)=>setDate(event.target.value)} disabled={busy}/>{(validation||error)&&<p className="account-form-error" role="alert">{validation||error}</p>}<div className="account-form-actions"><button type="button" className="account-secondary-button" onClick={onCancel} disabled={busy}>Cancelar</button><button className="account-primary-button" disabled={busy}>{busy?'Pagando…':'Confirmar pagamento'}</button></div></form></ModalSurface>
}
