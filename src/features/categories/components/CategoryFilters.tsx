import type { CategoryType } from '../types'

export type StatusFilter = 'active' | 'inactive' | 'all'
export type TypeFilter = CategoryType | 'all'

export function CategoryFilters({ type, status, onTypeChange, onStatusChange }: {
  type: TypeFilter
  status: StatusFilter
  onTypeChange: (value: TypeFilter) => void
  onStatusChange: (value: StatusFilter) => void
}) {
  return <div className="category-filters" role="group" aria-label="Filtros de categorias">
    <label htmlFor="category-type-filter">Tipo
      <select id="category-type-filter" value={type} onChange={(event) => onTypeChange(event.target.value as TypeFilter)}>
        <option value="all">Todas</option><option value="expense">Despesas</option><option value="income">Receitas</option>
      </select>
    </label>
    <label htmlFor="category-status-filter">Status
      <select id="category-status-filter" value={status} onChange={(event) => onStatusChange(event.target.value as StatusFilter)}>
        <option value="active">Ativas</option><option value="inactive">Inativas</option><option value="all">Todas</option>
      </select>
    </label>
  </div>
}
