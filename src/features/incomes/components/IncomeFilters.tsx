import type { Category } from '../../categories/types'
import type { IncomeStatus } from '../types'
export function IncomeFilters({ startDate, endDate, status, categoryId, categories, onStartDate, onEndDate, onStatus, onCategory }: {
  startDate: string; endDate: string; status: IncomeStatus | 'all'; categoryId: string; categories: Category[]
  onStartDate: (v: string) => void; onEndDate: (v: string) => void; onStatus: (v: IncomeStatus | 'all') => void; onCategory: (v: string) => void
}) { return <div className="income-filters" role="group" aria-label="Filtros de receitas">
  <label htmlFor="income-filter-start">Data inicial<input id="income-filter-start" type="date" value={startDate} onChange={(e) => onStartDate(e.target.value)} /></label>
  <label htmlFor="income-filter-end">Data final<input id="income-filter-end" type="date" value={endDate} onChange={(e) => onEndDate(e.target.value)} /></label>
  <label htmlFor="income-filter-status">Status<select id="income-filter-status" value={status} onChange={(e) => onStatus(e.target.value as IncomeStatus | 'all')}><option value="all">Todas</option><option value="pending">Pendentes</option><option value="settled">Recebidas</option></select></label>
  <label htmlFor="income-filter-category">Categoria<select id="income-filter-category" value={categoryId} onChange={(e) => onCategory(e.target.value)}><option value="all">Todas</option>{[...categories].sort((a,b) => a.name.localeCompare(b.name,'pt-BR')).map((item) => <option key={item.id} value={item.id}>{item.name}{item.active ? '' : ' (inativa)'}</option>)}</select></label>
</div> }
