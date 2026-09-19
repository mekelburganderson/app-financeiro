import type { TransferAccount } from '../types'

export function TransferFilters({ startDate, endDate, accountId, accounts, onStartDate, onEndDate, onAccount }: {
  startDate: string; endDate: string; accountId: string; accounts: TransferAccount[]
  onStartDate: (value:string)=>void; onEndDate: (value:string)=>void; onAccount: (value:string)=>void
}) {
  return <div className="transfer-filters" role="group" aria-label="Filtros de transferências">
    <label htmlFor="transfer-filter-start">Data inicial<input id="transfer-filter-start" type="date" value={startDate} onChange={(event)=>onStartDate(event.target.value)}/></label>
    <label htmlFor="transfer-filter-end">Data final<input id="transfer-filter-end" type="date" value={endDate} onChange={(event)=>onEndDate(event.target.value)}/></label>
    <label htmlFor="transfer-filter-account">Conta<select id="transfer-filter-account" value={accountId} onChange={(event)=>onAccount(event.target.value)}><option value="all">Todas</option>{[...accounts].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).map((account)=><option key={account.id} value={account.id}>{account.name}{account.active?'':' (inativa)'}</option>)}</select></label>
  </div>
}
