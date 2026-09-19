import { useEffect, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { BalanceVisibilityContext } from './balance-visibility-context'

function readPreference(key: string | null) {
  try { return key !== null && window.localStorage.getItem(key) === 'true' }
  catch { return false }
}

function UserBalanceVisibility({ userId, children }: PropsWithChildren<{ userId: string | null }>) {
  const storageKey = userId ? `app-financeiro:balances-hidden:${userId}` : null
  const [hidden, setHidden] = useState(() => readPreference(storageKey))

  useEffect(() => {
    function synchronize(event: StorageEvent) {
      if (storageKey && event.storageArea === window.localStorage && (event.key === storageKey || event.key === null)) {
        setHidden(event.newValue === 'true')
      }
    }
    window.addEventListener('storage', synchronize)
    return () => window.removeEventListener('storage', synchronize)
  }, [storageKey])

  function toggle() {
    const nextHidden = !hidden
    setHidden(nextHidden)
    try {
      if (storageKey) window.localStorage.setItem(storageKey, String(nextHidden))
    } catch {
      // A preferência continua funcionando nesta sessão se o navegador bloquear o armazenamento.
    }
  }

  return <BalanceVisibilityContext.Provider value={{ hidden, toggle }}>{children}</BalanceVisibilityContext.Provider>
}

export function BalanceVisibilityProvider({ children }: PropsWithChildren) {
  const { user } = useAuth()
  return <UserBalanceVisibility key={user?.id ?? 'anonymous'} userId={user?.id ?? null}>{children}</UserBalanceVisibility>
}
