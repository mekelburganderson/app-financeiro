import type { Category } from '../../categories/types'
import { paymentMethodLabels } from '../types'
import type { ExpenseStatus, PaymentMethod } from '../types'

const methods = Object.keys(paymentMethodLabels) as PaymentMethod[]

export function ExpenseFilters({ startDate, endDate, status, categoryId, paymentMethod, categories,
  onStartDate, onEndDate, onStatus, onCategory, onPaymentMethod }: {
  startDate: string; endDate: string; status: ExpenseStatus | 'all'; categoryId: string
  paymentMethod: PaymentMethod | 'all'; categories: Category[]
  onStartDate: (value: string) => void; onEndDate: (value: string) => void
  onStatus: (value: ExpenseStatus | 'all') => void; onCategory: (value: string) => void
  onPaymentMethod: (value: PaymentMethod | 'all') => void
}) {
  const sortedCategories = [...categories].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  return <div className="expense-filters" role="group" aria-label="Filtros de despesas">
    <label htmlFor="expense-filter-start">Data inicial
      <input id="expense-filter-start" type="date" value={startDate} onChange={(event) => onStartDate(event.target.value)} />
    </label>
    <label htmlFor="expense-filter-end">Data final
      <input id="expense-filter-end" type="date" value={endDate} onChange={(event) => onEndDate(event.target.value)} />
    </label>
    <label htmlFor="expense-filter-status">Status
      <select id="expense-filter-status" value={status} onChange={(event) => onStatus(event.target.value as ExpenseStatus | 'all')}>
        <option value="all">Todas</option><option value="pending">Pendentes</option><option value="settled">Pagas</option>
      </select>
    </label>
    <label htmlFor="expense-filter-category">Categoria
      <select id="expense-filter-category" value={categoryId} onChange={(event) => onCategory(event.target.value)}>
        <option value="all">Todas</option>
        {sortedCategories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.active ? '' : ' (inativa)'}</option>)}
      </select>
    </label>
    <label htmlFor="expense-filter-method">Forma prevista
      <select id="expense-filter-method" value={paymentMethod} onChange={(event) => onPaymentMethod(event.target.value as PaymentMethod | 'all')}>
        <option value="all">Todas</option>
        {methods.map((method) => <option key={method} value={method}>{paymentMethodLabels[method]}</option>)}
      </select>
    </label>
  </div>
}
