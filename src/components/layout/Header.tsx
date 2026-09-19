import { useState } from 'react'
import { LogOut, Menu } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { signOut } from '../../services/auth'
import { useLocation } from 'react-router-dom'
import { BalanceVisibilityToggle } from '../../features/privacy/BalanceVisibilityToggle'

interface HeaderProps { onOpenMenu: () => void }

function userName(fullName: string | null | undefined, metadata: Record<string, unknown> | undefined, email: string | undefined) {
  const candidate = fullName || metadata?.full_name || metadata?.name
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : email?.split('@')[0] || 'Você'
}

function avatarUrl(profileUrl: string | null | undefined, metadata: Record<string, unknown> | undefined) {
  const candidate = profileUrl || metadata?.avatar_url || metadata?.picture
  if (typeof candidate !== 'string') return null
  try {
    const url = new URL(candidate)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null
  } catch { return null }
}

export function Header({ onOpenMenu }: HeaderProps) {
  const { user, profile } = useAuth()
  const { pathname } = useLocation()
  const showBalanceVisibility = ['/', '/contas', '/cartoes'].includes(pathname.replace(/\/+$/, '') || '/')
  const [signingOut, setSigningOut] = useState(false)
  const [logoutError, setLogoutError] = useState(false)
  const name = userName(profile?.full_name, user?.user_metadata, user?.email)
  const avatar = avatarUrl(profile?.avatar_url, user?.user_metadata)

  async function handleLogout() {
    if (signingOut) return
    setLogoutError(false)
    setSigningOut(true)
    try { await signOut() }
    catch { setLogoutError(true); setSigningOut(false) }
  }

  return (
    <header className="app-header">
      <div className="header-leading">
        <button className="mobile-menu-button icon-button" type="button" aria-label="Abrir menu" aria-controls="app-navigation" onClick={onOpenMenu}><Menu size={22} /></button>
        <span className="header-context">Seu painel pessoal</span>
      </div>
      <div className="header-actions">
        {showBalanceVisibility && <BalanceVisibilityToggle />}
        {logoutError && <span className="header-error" role="alert">Não foi possível sair. Tente novamente.</span>}
        <div className="user-chip">
          {avatar ? <img className="user-avatar" src={avatar} alt="" referrerPolicy="no-referrer" /> :
            <span className="user-avatar user-avatar-fallback" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>}
          <span className="user-name" title={name}>{name}</span>
        </div>
        <button className="logout-button" type="button" onClick={() => void handleLogout()} disabled={signingOut} aria-label="Sair da conta">
          <LogOut size={18} aria-hidden="true" />
          <span>{signingOut ? 'Saindo…' : 'Sair'}</span>
        </button>
      </div>
    </header>
  )
}
