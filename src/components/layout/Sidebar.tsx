import { NavLink } from 'react-router-dom'
import { Wallet, X } from 'lucide-react'
import { navigation } from './navigation'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {open && <button className="sidebar-backdrop" type="button" aria-label="Fechar menu" onClick={onClose} />}
      <aside className={`sidebar${open ? ' sidebar-open' : ''}`} id="app-navigation" aria-label="Navegação principal">
        <div className="sidebar-brand">
          <span className="brand-icon"><Wallet size={23} strokeWidth={2.2} /></span>
          <span className="brand-copy"><strong>Finanças</strong><small>Controle pessoal</small></span>
          <button className="sidebar-close icon-button" type="button" aria-label="Fechar menu" onClick={onClose}><X size={20} /></button>
        </div>
        <p className="nav-caption">VISÃO GERAL</p>
        <nav className="sidebar-nav">
          {navigation.map(({ to, label, icon: Icon, ...options }) => (
            <NavLink key={to} to={to} end={'end' in options ? options.end : undefined}
              className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}
              onClick={onClose}>
              <Icon size={19} strokeWidth={1.9} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footnote"><span className="sidebar-footnote-dot" /> Seu espaço financeiro</div>
      </aside>
    </>
  )
}
