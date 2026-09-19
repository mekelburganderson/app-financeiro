import { useCallback, useEffect, useState } from 'react'
import { listAccounts } from '../services/accounts'
import type { AccountWithBalance } from '../types'

export function useAccounts(userId: string | null) {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([])
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    let cancelled = false
    if (!userId) {
      return
    }
    listAccounts(userId).then((data) => {
      if (!cancelled) {
        setAccounts(data)
        setLoadedFor(userId)
        setError(false)
      }
    }).catch(() => {
      if (!cancelled) {
        setLoadedFor(userId)
        setError(true)
      }
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [userId, revision])

  const belongsToUser = !!userId && loadedFor === userId
  return { accounts: belongsToUser ? accounts : [], loading: !!userId && (loading || !belongsToUser), error: belongsToUser && error, refresh }
}
