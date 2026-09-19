import { createContext, useContext } from 'react'

export interface BalanceVisibility {
  hidden: boolean
  toggle: () => void
}

export const BalanceVisibilityContext = createContext<BalanceVisibility | null>(null)

export function useBalanceVisibility() {
  const context = useContext(BalanceVisibilityContext)
  if (!context) throw new Error('useBalanceVisibility deve ser utilizado dentro de BalanceVisibilityProvider.')
  return context
}
