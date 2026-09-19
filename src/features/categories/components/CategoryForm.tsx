import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { categoryTypeLabels } from '../types'
import type { Category, CategoryInput, CategoryType } from '../types'

const types = Object.keys(categoryTypeLabels) as CategoryType[]

export function CategoryForm({ category, busy, typeLocked, lockReason, error, onCancel, onSave }: {
  category: Category | null
  busy: boolean
  typeLocked: boolean
  lockReason: string | null
  error: string | null
  onCancel: () => void
  onSave: (input: CategoryInput) => Promise<void>
}) {
  const [name, setName] = useState(category?.name ?? '')
  const [type, setType] = useState<CategoryType | ''>(category?.type ?? 'expense')
  const [validation, setValidation] = useState<string | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    nameInput.current?.focus()
    return () => previous?.focus()
  }, [])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !busy) onCancel()
    if (event.key !== 'Tab') return
    const elements = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)')
    if (!elements?.length) return
    const first = elements[0]!, last = elements[elements.length - 1]!
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const trimmed = name.trim()
    if (!trimmed) { setValidation('Informe o nome da categoria.'); return }
    if (!type || !types.includes(type)) { setValidation('Selecione um tipo de categoria válido.'); return }
    setValidation(null)
    await onSave({ name: trimmed, type })
  }

  const fieldError = validation || error
  return <div className="account-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel() }}>
    <div className="account-modal" role="dialog" aria-modal="true" aria-labelledby="category-form-title" onKeyDown={handleKeyDown} ref={dialog}>
      <h2 id="category-form-title">{category ? 'Editar categoria' : 'Nova categoria'}</h2>
      <p>Os campos marcados com * são obrigatórios.</p>
      <form onSubmit={submit} noValidate>
        <label htmlFor="category-name">Nome *</label>
        <input id="category-name" ref={nameInput} value={name} onChange={(event) => setName(event.target.value)}
          required disabled={busy} maxLength={120} aria-invalid={!!fieldError} aria-describedby={fieldError ? 'category-form-error' : undefined} />
        <label htmlFor="category-type">Tipo *</label>
        <select id="category-type" value={type} onChange={(event) => setType(event.target.value as CategoryType)}
          required disabled={busy || typeLocked} aria-describedby={[fieldError && 'category-form-error', lockReason && 'category-type-reason'].filter(Boolean).join(' ') || undefined}>
          {types.map((value) => <option key={value} value={value}>{categoryTypeLabels[value]}</option>)}
        </select>
        {lockReason && <small id="category-type-reason">{lockReason}</small>}
        {fieldError && <p id="category-form-error" className="account-form-error" role="alert">{fieldError}</p>}
        <div className="account-form-actions">
          <button type="button" className="account-secondary-button" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button type="submit" className="account-primary-button" disabled={busy}>{busy ? 'Salvando…' : category ? 'Salvar alterações' : 'Criar categoria'}</button>
        </div>
      </form>
    </div>
  </div>
}
