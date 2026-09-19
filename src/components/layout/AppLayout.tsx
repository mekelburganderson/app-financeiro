import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Sidebar } from './Sidebar'

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="app-frame">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="app-column">
        <Header onOpenMenu={() => setMenuOpen(true)} />
        <main className="app-main"><Outlet /></main>
      </div>
    </div>
  )
}
