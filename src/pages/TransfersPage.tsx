import { useState } from 'react'
import { ArrowDownUp, Plus } from 'lucide-react'
import { TransferCard } from '../features/transfers/components/TransferCard'
import { TransferFilters } from '../features/transfers/components/TransferFilters'
import { TransferForm } from '../features/transfers/components/TransferForm'
import { useTransfers } from '../features/transfers/hooks/useTransfers'
import { TransferServiceError } from '../features/transfers/services/transfers'
import type { TransferDraft, TransferRecord } from '../features/transfers/types'
import { useAuth } from '../hooks/useAuth'
import { todayISO } from '../lib/finance'

function friendly(error: unknown) {
  if (error instanceof TransferServiceError) return ({ account:'A conta selecionada não é válida.',same_account:'Escolha contas diferentes para a transferência.',amount:'Informe um valor maior que zero.',inactive:'Uma das contas está inativa.',already_reversed:'Esta transferência já foi desfeita.',permission:'Você não tem permissão para alterar esta transferência.',date:'Informe uma data válida.',generic:'Não foi possível concluir a operação. Tente novamente.' })[error.kind]
  return 'Não foi possível concluir a operação. Tente novamente.'
}

export function TransfersPage() {
  const { user } = useAuth(), data = useTransfers(user?.id ?? null)
  const [formOpen,setFormOpen]=useState(false),[formError,setFormError]=useState<string|null>(null),[message,setMessage]=useState<{text:string;error:boolean}|null>(null)
  async function save(draft:TransferDraft){const result=await data.create(draft);if(!result.ok){setFormError(friendly(result.error));return}setFormOpen(false);setMessage({text:'Transferência realizada com sucesso.',error:false})}
  async function reverse(transfer:TransferRecord){if(!window.confirm('Deseja desfazer esta transferência? Os valores serão revertidos nas duas contas e o histórico será preservado.'))return;const result=await data.reverse(transfer.id,todayISO());setMessage(result.ok?{text:'Transferência desfeita com sucesso.',error:false}:{text:friendly(result.error),error:true})}
  const filtered=data.filters.startDate||data.filters.endDate||data.filters.accountId!=='all'
  return <section className="transfers-page"><div className="page-heading"><div><p className="eyebrow">MOVIMENTAÇÕES</p><h1>Transferências</h1><p>Movimente valores entre suas contas.</p></div><button className="account-primary-button" onClick={()=>{setFormError(null);setFormOpen(true)}}><Plus size={17}/> Nova transferência</button></div>
    {message&&<p className={message.error?'account-notice account-notice-error':'account-notice'} role={message.error?'alert':'status'}>{message.text}</p>}
    <TransferFilters {...data.filters} accounts={data.accounts} onStartDate={data.setStartDate} onEndDate={data.setEndDate} onAccount={data.setAccountId}/>
    {data.loading&&<div className="account-state" role="status"><div className="loading-spinner"/> Carregando transferências…</div>}
    {!data.loading&&data.error&&<div className="account-state" role="alert"><p>Não foi possível carregar suas transferências.</p><button className="account-secondary-button" onClick={data.refresh}>Tentar novamente</button></div>}
    {!data.loading&&!data.error&&!data.transfers.length&&<div className="account-state"><span className="placeholder-icon"><ArrowDownUp size={27}/></span><h2>{filtered?'Nenhuma transferência encontrada para os filtros selecionados.':'Você ainda não realizou nenhuma transferência.'}</h2><button className="account-primary-button" onClick={()=>setFormOpen(true)}>Nova transferência</button></div>}
    {!data.loading&&!data.error&&data.transfers.length>0&&<div className="account-grid">{data.transfers.map((transfer)=><TransferCard key={transfer.id} transfer={transfer} busy={data.busy} onReverse={()=>reverse(transfer)}/>)}</div>}
    {formOpen&&<TransferForm accounts={data.accounts} busy={data.busy} error={formError} onCancel={()=>setFormOpen(false)} onSave={save}/>}</section>
}
