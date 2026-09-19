export type CreditCardStatusFilter = 'active' | 'inactive' | 'all'

export function CreditCardFilters({ status, onChange }: {
  status: CreditCardStatusFilter
  onChange: (status: CreditCardStatusFilter) => void
}) {
  return <div className="category-filters">
    <label htmlFor="credit-card-status-filter">Status
      <select id="credit-card-status-filter" value={status} onChange={(event) => onChange(event.target.value as CreditCardStatusFilter)}>
        <option value="active">Ativos</option><option value="inactive">Inativos</option><option value="all">Todos</option>
      </select>
    </label>
  </div>
}
