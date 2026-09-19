import { useRef, useState } from 'react'
import { CreditCard as CreditCardIcon, Plus } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { CreditCardCard } from '../features/credit-cards/components/CreditCardCard'
import { CreditCardFilters } from '../features/credit-cards/components/CreditCardFilters'
import type { CreditCardStatusFilter } from '../features/credit-cards/components/CreditCardFilters'
import { CreditCardForm } from '../features/credit-cards/components/CreditCardForm'
import { useCreditCards } from '../features/credit-cards/hooks/useCreditCards'
import type { CreditCard, CreditCardInput } from '../features/credit-cards/types'
import { CreditCardServiceError, createCreditCard, creditCardHasUsage, deactivateCreditCard, reactivateCreditCard, updateCreditCard } from '../features/credit-cards/services/creditCards'

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' })

function friendlyError(error: unknown, action: 'criar' | 'editar' | 'desativar' | 'reativar'): string {
  if (error instanceof CreditCardServiceError) {
    if (error.kind === 'permission') return 'Você não tem permissão para alterar este cartão.'
    if (error.kind === 'validation') return 'Os dados do cartão não são válidos. Confira os campos e tente novamente.'
    if (error.kind === 'history') return 'Não foi possível alterar o ciclo deste cartão porque há um vínculo histórico.'
  }
  return `Não foi possível ${action} o cartão. Tente novamente.`
}

export function CreditCardsPage() {
  const { user } = useAuth()
  const { cards, loading, error: listError, refresh } = useCreditCards(user?.id ?? null)
  const [statusFilter, setStatusFilter] = useState<CreditCardStatusFilter>('active')
  const [editing, setEditing] = useState<CreditCard | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const shown = cards.filter((card) => statusFilter === 'all' || card.active === (statusFilter === 'active'))
    .sort((a, b) => Number(b.active) - Number(a.active) || collator.compare(a.name, b.name))

  function openForm(card: CreditCard | null) {
    setEditing(card)
    setFormError(null)
    setMessage(null)
  }

  async function save(input: CreditCardInput) {
    if (!user || pending.current || (editing && editing.user_id !== user.id)) return
    pending.current = true
    setBusy(true)
    setFormError(null)
    try {
      if (editing) {
        const cycleChanged = input.closing_day !== editing.closing_day || input.due_day !== editing.due_day
        if (cycleChanged && await creditCardHasUsage(user.id, editing.id) &&
          !window.confirm('Este cartão já possui faturas ou transações. Os novos dias serão usados em faturas criadas depois desta alteração; faturas já existentes, mesmo de meses futuros, mantêm suas datas. Deseja continuar?')) return
        await updateCreditCard(user.id, editing.id, input)
      } else {
        await createCreditCard(user.id, input)
      }
      setEditing(undefined)
      setMessage({ text: editing ? 'Cartão atualizado com sucesso.' : 'Cartão criado com sucesso.', error: false })
      refresh()
    } catch (error) {
      setFormError(friendlyError(error, editing ? 'editar' : 'criar'))
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  async function changeStatus(card: CreditCard) {
    if (!user || pending.current || card.user_id !== user.id) return
    if (card.active && !window.confirm('Deseja desativar este cartão? Ele continuará disponível no histórico, mas não deverá ser usado em novos lançamentos.')) return
    pending.current = true
    setBusy(true)
    setMessage(null)
    try {
      if (card.active) await deactivateCreditCard(user.id, card.id)
      else await reactivateCreditCard(user.id, card.id)
      setMessage({ text: card.active ? 'Cartão desativado com sucesso.' : 'Cartão reativado com sucesso.', error: false })
      refresh()
    } catch (error) {
      setMessage({ text: friendlyError(error, card.active ? 'desativar' : 'reativar'), error: true })
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return <section className="credit-cards-page">
    <div className="page-heading">
      <div><p className="eyebrow">CRÉDITO</p><h1>Cartões</h1><p>Gerencie seus cartões de crédito.</p></div>
      <button className="account-primary-button" onClick={() => openForm(null)} disabled={busy}><Plus size={18} aria-hidden="true" /> Novo cartão</button>
    </div>
    {message && <p className={message.error ? 'account-notice account-notice-error' : 'account-notice'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
    <CreditCardFilters status={statusFilter} onChange={setStatusFilter} />
    {loading && <div className="account-state" role="status"><div className="loading-spinner" aria-hidden="true" /> Carregando cartões…</div>}
    {!loading && listError && <div className="account-state" role="alert"><p>Não foi possível carregar seus cartões. Tente novamente.</p><button className="account-secondary-button" onClick={refresh}>Tentar novamente</button></div>}
    {!loading && !listError && !shown.length && <div className="account-state">
      <span className="placeholder-icon"><CreditCardIcon size={27} aria-hidden="true" /></span>
      <h2>{cards.length === 0 ? 'Você ainda não cadastrou nenhum cartão.' : 'Nenhum cartão encontrado para os filtros selecionados.'}</h2>
      {cards.length === 0 && <button className="account-primary-button" onClick={() => openForm(null)} disabled={busy}>Cadastrar primeiro cartão</button>}
    </div>}
    {!loading && !listError && shown.length > 0 && <div className="account-grid">
      {shown.map((card) => <CreditCardCard key={card.id} card={card} busy={busy}
        onEdit={() => openForm(card)} onChangeStatus={() => changeStatus(card)} />)}
    </div>}
    {editing !== undefined && (!editing || editing.user_id === user?.id) && <CreditCardForm
      card={editing} busy={busy} error={formError} onCancel={() => setEditing(undefined)} onSave={save} />}
  </section>
}
