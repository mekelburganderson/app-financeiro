import { useState } from 'react'
import { ArrowDownLeft, Plus, RefreshCw } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { ExpenseCard } from '../features/expenses/components/ExpenseCard'
import { ExpenseFilters } from '../features/expenses/components/ExpenseFilters'
import { ExpenseForm } from '../features/expenses/components/ExpenseForm'
import { ExpensePaymentDialog } from '../features/expenses/components/ExpensePaymentDialog'
import { useExpenses } from '../features/expenses/hooks/useExpenses'
import { ExpenseServiceError } from '../features/expenses/services/expenses'
import type { ExpenseDraft, ExpenseRecord, PaymentMethod } from '../features/expenses/types'
import { formatBRL } from '../lib/finance'

function friendlyError(error: unknown): string {
  if (error instanceof ExpenseServiceError) {
    const messages = {
      permission: 'Você não tem permissão para realizar esta operação.',
      category: 'A categoria selecionada não está ativa ou não é uma categoria de despesa.',
      account: 'A conta selecionada não é válida para esta operação.',
      card: 'O cartão selecionado não está ativo ou a operação deve ser feita pela fatura.',
      invoice_closed: 'Esta despesa pertence a uma fatura fechada e não pode mais ser alterada financeiramente.',
      already_paid: 'Esta despesa já foi paga.',
      already_reversed: 'Este pagamento já foi desfeito.',
      history: 'A operação foi bloqueada porque a despesa possui histórico financeiro.',
      validation: 'Confira os dados da despesa e tente novamente.',
      generic: 'Não foi possível concluir a operação. Tente novamente.',
    }
    return messages[error.kind]
  }
  return 'Não foi possível concluir a operação. Tente novamente.'
}

export function ExpensesPage() {
  const { user } = useAuth()
  const expenses = useExpenses(user?.id ?? null)
  const [editing, setEditing] = useState<ExpenseRecord | null | undefined>(undefined)
  const [payment, setPayment] = useState<{ expense: ExpenseRecord; mode: 'pay' | 'reverse' } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const total = expenses.allExpenses.reduce((sum, item) => sum + item.amount, 0)
  const pendingTotal = expenses.allExpenses.filter((item) => item.status === 'pending').reduce((sum, item) => sum + item.amount, 0)
  const settledTotal = total - pendingTotal

  function openForm(item: ExpenseRecord | null) { setEditing(item); setFormError(null); setMessage(null) }
  async function save(draft: ExpenseDraft) {
    const result = editing ? await expenses.update(editing.id, draft.input) : await expenses.create(draft)
    if (!result.ok) { setFormError(friendlyError(result.error)); return }
    setEditing(undefined)
    setMessage({ text: editing ? 'Despesa atualizada com sucesso.' : 'Despesa criada com sucesso.', error: false })
  }
  async function remove(item: ExpenseRecord) {
    if (!window.confirm(`Excluir a despesa “${item.description}”?`)) return
    const result = await expenses.remove(item.id)
    setMessage(result.ok ? { text: 'Despesa excluída com sucesso.', error: false } : { text: friendlyError(result.error), error: true })
  }
  async function confirmPayment(accountId: string, method: Exclude<PaymentMethod, 'credit_card'>, date: string) {
    if (!payment) return
    const result = payment.mode === 'pay'
      ? await expenses.pay(payment.expense.id, accountId, method, date)
      : payment.expense.payment_movement_id ? await expenses.reverse(payment.expense.payment_movement_id, date)
        : { ok: false as const, error: new Error('Movimento não encontrado.') }
    if (!result.ok) { setFormError(friendlyError(result.error)); return }
    setPayment(null); setFormError(null)
    setMessage({ text: payment.mode === 'pay' ? 'Despesa paga com sucesso.' : 'Pagamento desfeito com sucesso.', error: false })
  }
  async function generateRecurrences() {
    const result = await expenses.generate()
    setMessage(result.ok
      ? { text: result.value ? `${result.value} ocorrência(s) recorrente(s) gerada(s).` : 'As recorrências já estão atualizadas.', error: false }
      : { text: friendlyError(result.error), error: true })
  }

  return <section className="expenses-page">
    <div className="page-heading">
      <div><p className="eyebrow">GASTOS</p><h1>Despesas</h1><p>Acompanhe e registre seus gastos.</p></div>
      <div className="expense-heading-actions">
        <button className="account-secondary-button" onClick={generateRecurrences} disabled={expenses.busy}><RefreshCw size={17} aria-hidden="true" /> Atualizar recorrências</button>
        <button className="account-primary-button" onClick={() => openForm(null)} disabled={expenses.busy}><Plus size={18} aria-hidden="true" /> Nova despesa</button>
      </div>
    </div>
    {message && <p className={message.error ? 'account-notice account-notice-error' : 'account-notice'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
    <ExpenseFilters {...expenses.filters} categories={expenses.options.categories}
      onStartDate={expenses.setStartDate} onEndDate={expenses.setEndDate} onStatus={expenses.setStatus}
      onCategory={expenses.setCategoryId} onPaymentMethod={expenses.setPaymentMethod} />
    {expenses.invalidPeriod && <p className="account-notice account-notice-error" role="alert">A data inicial deve ser anterior ou igual à data final.</p>}
    <div className="expense-summary" aria-label="Totais do período">
      <div><span>Total</span><strong>{formatBRL(total)}</strong></div>
      <div><span>Pendentes</span><strong>{formatBRL(pendingTotal)}</strong></div>
      <div><span>Pagas</span><strong>{formatBRL(settledTotal)}</strong></div>
    </div>
    {expenses.loading && <div className="account-state" role="status"><div className="loading-spinner" aria-hidden="true" /> Carregando despesas…</div>}
    {!expenses.loading && expenses.error && <div className="account-state" role="alert"><p>Não foi possível carregar suas despesas.</p><button className="account-secondary-button" onClick={expenses.refresh}>Tentar novamente</button></div>}
    {!expenses.loading && !expenses.error && !expenses.invalidPeriod && !expenses.expenses.length && <div className="account-state">
      <span className="placeholder-icon"><ArrowDownLeft size={27} aria-hidden="true" /></span>
      <h2>Nenhuma despesa encontrada.</h2>
      <button className="account-primary-button" onClick={() => openForm(null)} disabled={expenses.busy}>Nova despesa</button>
    </div>}
    {!expenses.loading && !expenses.error && expenses.expenses.length > 0 && <div className="account-grid expense-grid">
      {expenses.expenses.map((item) => <ExpenseCard key={item.id} expense={item} busy={expenses.busy}
        onEdit={() => openForm(item)} onPay={() => { setPayment({ expense: item, mode: 'pay' }); setFormError(null) }}
        onReverse={() => { setPayment({ expense: item, mode: 'reverse' }); setFormError(null) }} onDelete={() => remove(item)} />)}
    </div>}
    {editing !== undefined && <ExpenseForm expense={editing} options={expenses.options} busy={expenses.busy} error={formError}
      onCancel={() => setEditing(undefined)} onSave={save} />}
    {payment && <ExpensePaymentDialog mode={payment.mode} accounts={expenses.options.accounts} busy={expenses.busy} error={formError}
      onCancel={() => setPayment(null)} onConfirm={confirmPayment} />}
  </section>
}
