import { Tags } from 'lucide-react'
import { categoryTypeLabels } from '../types'
import type { Category } from '../types'

export function CategoryCard({ category, busy, onEdit, onChangeStatus }: {
  category: Category
  busy: boolean
  onEdit: () => void
  onChangeStatus: () => void
}) {
  return <article className="account-card category-card">
    <div className="account-card-top">
      <span className="account-card-icon"><Tags size={21} aria-hidden="true" /></span>
      <span className={category.active ? 'account-badge' : 'account-badge account-badge-inactive'}>{category.active ? 'Ativa' : 'Inativa'}</span>
    </div>
    <h2>{category.name}</h2>
    <p className="category-type">{categoryTypeLabels[category.type]}</p>
    <div className="account-card-actions">
      <button className="account-secondary-button" onClick={onEdit} disabled={busy}>Editar</button>
      <button className="account-text-button" onClick={onChangeStatus} disabled={busy}>{busy ? 'Aguarde…' : category.active ? 'Desativar' : 'Reativar'}</button>
    </div>
  </article>
}
