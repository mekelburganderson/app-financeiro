import { useRef, useState } from 'react'
import { Plus, Tags } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { CategoryCard } from '../features/categories/components/CategoryCard'
import { CategoryFilters } from '../features/categories/components/CategoryFilters'
import type { StatusFilter, TypeFilter } from '../features/categories/components/CategoryFilters'
import { CategoryForm } from '../features/categories/components/CategoryForm'
import { useCategories } from '../features/categories/hooks/useCategories'
import { categoryNameKey } from '../features/categories/types'
import type { Category, CategoryInput } from '../features/categories/types'
import { CategoryServiceError, categoryHasUsage, createCategory, deactivateCategory, reactivateCategory, updateCategory } from '../features/categories/services/categories'

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' })

function friendlyError(error: unknown, action: 'criar' | 'editar' | 'desativar' | 'reativar'): string {
  if (error instanceof CategoryServiceError) {
    if (error.kind === 'duplicate') return 'Já existe uma categoria com esse nome para este tipo.'
    if (error.kind === 'type_used') return 'O tipo desta categoria não pode ser alterado porque ela já está em uso.'
    if (error.kind === 'permission') return 'Você não tem permissão para alterar esta categoria.'
  }
  return `Não foi possível ${action} a categoria. Tente novamente.`
}

export function CategoriesPage() {
  const { user } = useAuth()
  const { categories, loading, error: listError, refresh } = useCategories(user?.id ?? null)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [editing, setEditing] = useState<Category | null | undefined>(undefined)
  const [usageState, setUsageState] = useState<'checking' | 'used' | 'free' | 'unknown'>('free')
  const usageRequest = useRef(0)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const shown = categories.filter((category) =>
    (typeFilter === 'all' || category.type === typeFilter) &&
    (statusFilter === 'all' || category.active === (statusFilter === 'active')),
  ).sort((a, b) => a.type.localeCompare(b.type) || collator.compare(a.name, b.name))

  function closeForm() {
    usageRequest.current += 1
    setEditing(undefined)
  }

  function openForm(category: Category | null) {
    const request = ++usageRequest.current
    setEditing(category)
    setFormError(null)
    setMessage(null)
    setUsageState(category ? 'checking' : 'free')
    if (category && user) {
      categoryHasUsage(user.id, category.id).then((used) => {
        if (usageRequest.current === request) setUsageState(used ? 'used' : 'free')
      }).catch(() => {
        if (usageRequest.current === request) setUsageState('unknown')
      })
    }
  }

  async function save(input: CategoryInput) {
    if (!user || pending.current || (editing && editing.user_id !== user.id)) return
    if (categories.some((category) => category.id !== editing?.id && category.type === input.type && categoryNameKey(category.name) === categoryNameKey(input.name))) {
      setFormError('Já existe uma categoria com esse nome para este tipo.')
      return
    }
    if (editing && input.type !== editing.type && usageState !== 'free') {
      setFormError('O tipo desta categoria não pode ser alterado porque ela já está em uso ou seu uso não foi verificado.')
      return
    }
    pending.current = true
    setBusy(true)
    setFormError(null)
    try {
      if (editing) {
        if (input.type !== editing.type && await categoryHasUsage(user.id, editing.id)) {
          setUsageState('used')
          setFormError('O tipo desta categoria não pode ser alterado porque ela já está em uso.')
          return
        }
        await updateCategory(user.id, editing.id, input)
      } else {
        await createCategory(user.id, input)
      }
      closeForm()
      setMessage({ text: editing ? 'Categoria atualizada com sucesso.' : 'Categoria criada com sucesso.', error: false })
      refresh()
    } catch (error) {
      setFormError(friendlyError(error, editing ? 'editar' : 'criar'))
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  async function changeStatus(category: Category) {
    if (!user || pending.current || category.user_id !== user.id) return
    if (category.active && !window.confirm('Deseja desativar esta categoria? Ela continuará disponível no histórico, mas não deverá ser usada em novos lançamentos.')) return
    pending.current = true
    setBusy(true)
    setMessage(null)
    try {
      if (category.active) await deactivateCategory(user.id, category.id)
      else await reactivateCategory(user.id, category.id)
      setMessage({ text: category.active ? 'Categoria desativada com sucesso.' : 'Categoria reativada com sucesso.', error: false })
      refresh()
    } catch (error) {
      setMessage({ text: friendlyError(error, category.active ? 'desativar' : 'reativar'), error: true })
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  const lockReason = editing ? usageState === 'checking' ? 'Verificando se a categoria está em uso…'
    : usageState === 'used' ? 'Categoria em uso: o tipo permanece preservado para manter o histórico.'
      : usageState === 'unknown' ? 'Não foi possível verificar o uso; o tipo permanece bloqueado.' : null : null

  return <section className="categories-page">
    <div className="page-heading">
      <div><p className="eyebrow">ORGANIZAÇÃO</p><h1>Categorias</h1><p>Organize receitas e despesas por categoria.</p></div>
      <button className="account-primary-button" onClick={() => openForm(null)} disabled={busy}><Plus size={18} aria-hidden="true" /> Nova categoria</button>
    </div>
    {message && <p className={message.error ? 'account-notice account-notice-error' : 'account-notice'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
    <CategoryFilters type={typeFilter} status={statusFilter} onTypeChange={setTypeFilter} onStatusChange={setStatusFilter} />
    {loading && <div className="account-state" role="status"><div className="loading-spinner" aria-hidden="true" /> Carregando categorias…</div>}
    {!loading && listError && <div className="account-state" role="alert"><p>Não foi possível carregar suas categorias. Tente novamente.</p><button className="account-secondary-button" onClick={refresh}>Tentar novamente</button></div>}
    {!loading && !listError && !shown.length && <div className="account-state">
      <span className="placeholder-icon"><Tags size={27} aria-hidden="true" /></span>
      <h2>{categories.length === 0 ? 'Você ainda não cadastrou nenhuma categoria.' : 'Nenhuma categoria encontrada para os filtros selecionados.'}</h2>
      {categories.length === 0 && <button className="account-primary-button" onClick={() => openForm(null)} disabled={busy}>Cadastrar primeira categoria</button>}
    </div>}
    {!loading && !listError && shown.length > 0 && <div className="account-grid">
      {shown.map((category) => <CategoryCard key={category.id} category={category} busy={busy}
        onEdit={() => openForm(category)} onChangeStatus={() => changeStatus(category)} />)}
    </div>}
    {editing !== undefined && (!editing || editing.user_id === user?.id) && <CategoryForm
      category={editing} busy={busy} typeLocked={!!editing && usageState !== 'free'} lockReason={lockReason}
      error={formError} onCancel={closeForm} onSave={save} />}
  </section>
}
