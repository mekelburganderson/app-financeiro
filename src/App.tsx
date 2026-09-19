import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { PublicOnlyRoute } from './components/auth/PublicOnlyRoute'
import { AppLayout } from './components/layout/AppLayout'
import { AccountsPage } from './pages/AccountsPage'
import { CategoriesPage } from './pages/CategoriesPage'
import { CreditCardsPage } from './pages/CreditCardsPage'
import { LoginPage } from './pages/LoginPage'
import { TransfersPage } from './pages/TransfersPage'

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const ExpensesPage = lazy(() => import('./pages/ExpensesPage').then((module) => ({ default: module.ExpensesPage })))
const IncomesPage = lazy(() => import('./pages/IncomesPage').then((module) => ({ default: module.IncomesPage })))
const InvoicesPage = lazy(() => import('./pages/InvoicesPage').then((module) => ({ default: module.InvoicesPage })))

export function App() {
  return (
    <Suspense fallback={<div className="auth-loading" role="status"><div className="loading-spinner" /> Carregando página…</div>}><Routes>
      <Route element={<PublicOnlyRoute />}><Route path="/login" element={<LoginPage />} /></Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="despesas" element={<ExpensesPage />} />
          <Route path="receitas" element={<IncomesPage />} />
          <Route path="transferencias" element={<TransfersPage />} />
          <Route path="cartoes" element={<CreditCardsPage />} />
          <Route path="faturas" element={<InvoicesPage />} />
          <Route path="contas" element={<AccountsPage />} />
          <Route path="categorias" element={<CategoriesPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes></Suspense>
  )
}
