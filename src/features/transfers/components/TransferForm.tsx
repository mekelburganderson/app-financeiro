import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ModalSurface } from '../../../components/ModalSurface'
import { formatBRL, isValidDate, parseMoneyInput, todayISO } from '../../../lib/finance'
import type { TransferAccount, TransferDraft } from '../types'

export function TransferForm({accounts,busy,error,onCancel,onSave}:{accounts:TransferAccount[];busy:boolean;error:string|null;onCancel:()=>void;onSave:(draft:TransferDraft)=>Promise<void>}){
  const active=accounts.filter((account)=>account.active)
  const[source,setSource]=useState(''),[destination,setDestination]=useState(''),[amount,setAmount]=useState(''),[date,setDate]=useState(todayISO()),[description,setDescription]=useState(''),[validation,setValidation]=useState<string|null>(null)
  const first=useRef<HTMLSelectElement>(null)
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;first.current?.focus();return()=>previous?.focus()},[])
  async function submit(event:FormEvent){event.preventDefault();if(busy)return;const value=parseMoneyInput(amount);if(!source){setValidation('Selecione a conta de origem.');return}if(!destination){setValidation('Selecione a conta de destino.');return}if(source===destination){setValidation('A conta de destino deve ser diferente da conta de origem.');return}if(value===null||value<=0){setValidation('Informe um valor maior que zero.');return}if(!isValidDate(date)){setValidation('Informe uma data de transferência válida.');return}setValidation(null);await onSave({source_account_id:source,destination_account_id:destination,amount:value,movement_date:date,description:description.trim()||null})}
  const parsed=parseMoneyInput(amount)
  return <ModalSurface titleId="transfer-form-title" className="account-modal transfer-modal" busy={busy} onClose={onCancel}><h2 id="transfer-form-title">Nova transferência</h2><p>Movimente valores entre duas contas ativas.</p><form onSubmit={submit} noValidate>
    <label htmlFor="transfer-source">Conta de origem *</label><select id="transfer-source" ref={first} value={source} onChange={(event)=>setSource(event.target.value)} disabled={busy}><option value="">Selecione</option>{active.map((account)=><option key={account.id} value={account.id}>{account.name}</option>)}</select>
    <label htmlFor="transfer-destination">Conta de destino *</label><select id="transfer-destination" value={destination} onChange={(event)=>setDestination(event.target.value)} disabled={busy}><option value="">Selecione</option>{active.map((account)=><option key={account.id} value={account.id}>{account.name}</option>)}</select>
    <div className="expense-form-grid"><label htmlFor="transfer-amount">Valor (R$) *<input id="transfer-amount" inputMode="decimal" value={amount} onChange={(event)=>setAmount(event.target.value)} disabled={busy}/></label><label htmlFor="transfer-date">Data da transferência *<input id="transfer-date" type="date" value={date} onChange={(event)=>setDate(event.target.value)} disabled={busy}/></label></div>
    <label htmlFor="transfer-description">Descrição</label><textarea id="transfer-description" rows={3} value={description} onChange={(event)=>setDescription(event.target.value)} disabled={busy}/>{source&&destination&&parsed!==null&&parsed>0&&<p className="transfer-summary">Resumo: <strong>{active.find((account)=>account.id===source)?.name}</strong> → <strong>{active.find((account)=>account.id===destination)?.name}</strong> · {formatBRL(parsed)}</p>}{(validation||error)&&<p className="account-form-error" role="alert">{validation||error}</p>}<div className="account-form-actions"><button type="button" className="account-secondary-button" onClick={onCancel} disabled={busy}>Cancelar</button><button className="account-primary-button" disabled={busy}>{busy?'Transferindo…':'Confirmar transferência'}</button></div>
  </form></ModalSurface>
}
