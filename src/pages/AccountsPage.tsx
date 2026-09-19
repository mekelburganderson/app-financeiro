import { useRef, useState } from 'react'
import { Landmark, Plus } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { AccountForm } from '../features/accounts/components/AccountForm'
import { useAccounts } from '../features/accounts/hooks/useAccounts'
import { formatBRL, formatBRDate } from '../lib/finance'
import { accountTypeLabels } from '../features/accounts/types'
import type { AccountInput, AccountWithBalance } from '../features/accounts/types'
import { createAccount, deactivateAccount, hasAccountMovements, reactivateAccount, updateAccount } from '../features/accounts/services/accounts'

export function AccountsPage() {
  const { user } = useAuth()
  const { accounts, loading, error: listError, refresh } = useAccounts(user?.id ?? null)
  const [filter, setFilter] = useState<'active' | 'inactive'>('active')
  const [editing, setEditing] = useState<AccountWithBalance | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const shown = accounts.filter((account) => account.active === (filter === 'active'))

  function openForm(account: AccountWithBalance | null) {
    setEditing(account)
    setFormError(null)
    setMessage(null)
  }

  async function save(input: AccountInput) {
    if (!user || pending.current) return
    pending.current = true
    setBusy(true)
    setFormError(null)
    try {
      if (editing) {
        const openingChanged = input.initial_balance !== editing.initial_balance || input.initial_balance_date !== editing.initial_balance_date
        if (openingChanged && await hasAccountMovements(user.id, editing.id) &&
          !window.confirm('Esta conta já possui movimentações. Alterar o saldo inicial ou a data pode modificar o saldo atual. Deseja continuar?')) return
        await updateAccount(user.id, editing.id, input)
      } else {
        await createAccount(user.id, input)
      }
      setEditing(undefined)
      setMessage({ text: editing ? 'Conta atualizada com sucesso.' : 'Conta criada com sucesso.', error: false })
      refresh()
    } catch {
      setFormError(editing ? 'Não foi possível editar a conta. Tente novamente.' : 'Não foi possível criar a conta. Tente novamente.')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  async function changeStatus(account: AccountWithBalance) {
    if (!user || pending.current) return
    if (account.active && !window.confirm('Deseja desativar esta conta? Ela continuará disponível no histórico, mas não deverá ser usada em novos lançamentos.')) return
    pending.current = true
    setBusy(true)
    setMessage(null)
    try {
      if (account.active) await deactivateAccount(user.id, account.id)
      else await reactivateAccount(user.id, account.id)
      setMessage({ text: account.active ? 'Conta desativada com sucesso.' : 'Conta reativada com sucesso.', error: false })
      refresh()
    } catch {
      setMessage({ text: account.active ? 'Não foi possível desativar a conta. Tente novamente.' : 'Não foi possível reativar a conta. Tente novamente.', error: true })
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return <section className="accounts-page">
    <div className="page-heading">
      <div><p className="eyebrow">SUAS FINANÇAS</p><h1>Contas</h1><p>Gerencie suas contas e acompanhe seus saldos.</p></div>
      <button className="account-primary-button" onClick={() => openForm(null)} disabled={busy}><Plus size={18} aria-hidden="true" /> Nova conta</button>
    </div>
    {message && <p className={message.error ? 'account-notice account-notice-error' : 'account-notice'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
    <div className="account-filter" role="group" aria-label="Filtrar contas por status">
      <button type="button" aria-pressed={filter === 'active'} onClick={() => setFilter('active')}>Ativas <span>{accounts.filter((a) => a.active).length}</span></button>
      <button type="button" aria-pressed={filter === 'inactive'} onClick={() => setFilter('inactive')}>Inativas <span>{accounts.filter((a) => !a.active).length}</span></button>
    </div>
    {loading && <div className="account-state" role="status"><div className="loading-spinner" aria-hidden="true" /> Carregando contas…</div>}
    {!loading && listError && <div className="account-state" role="alert"><p>Não foi possível carregar suas contas. Tente novamente.</p><button className="account-secondary-button" onClick={refresh}>Tentar novamente</button></div>}
    {!loading && !listError && !shown.length && <div className="account-state">
      <span className="placeholder-icon"><Landmark size={27} aria-hidden="true" /></span>
      <h2>{filter === 'active' && accounts.length === 0 ? 'Você ainda não cadastrou nenhuma conta.' : filter === 'active' ? 'Nenhuma conta ativa.' : 'Nenhuma conta inativa.'}</h2>
      {filter === 'active' && <button className="account-primary-button" onClick={() => openForm(null)} disabled={busy}>Cadastrar primeira conta</button>}
    </div>}
    {!loading && !listError && shown.length > 0 && <div className="account-grid">
      {shown.map((account) => <article className="account-card" key={account.id}>
        <div className="account-card-top"><span className="account-card-icon"><Landmark size={22} aria-hidden="true" /></span><span className={account.active ? 'account-badge' : 'account-badge account-badge-inactive'}>{account.active ? 'Ativa' : 'Inativa'}</span></div>
        <h2>{account.name}</h2><p className="account-type">{accountTypeLabels[account.type]}</p>
        <p className="account-balance-label">Saldo atual</p><p className="account-balance">{formatBRL(account.current_balance)}</p>
        <p className="account-opening">Saldo inicial em {formatBRDate(account.initial_balance_date)}</p>
        <div className="account-card-actions">
          <button className="account-secondary-button" onClick={() => openForm(account)} disabled={busy}>Editar</button>
          <button className="account-text-button" onClick={() => changeStatus(account)} disabled={busy}>{busy ? 'Aguarde…' : account.active ? 'Desativar' : 'Reativar'}</button>
        </div>
      </article>)}
    </div>}
    {editing !== undefined && <AccountForm account={editing} busy={busy} error={formError} onCancel={() => setEditing(undefined)} onSave={save} />}
  </section>
}
