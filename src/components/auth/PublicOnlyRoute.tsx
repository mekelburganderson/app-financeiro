import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { AuthLoading } from './AuthLoading'

export function PublicOnlyRoute() {
  const { user, loading } = useAuth()

  if (loading) return <AuthLoading />
  if (user) return <Navigate to="/" replace />
  return <Outlet />
}
