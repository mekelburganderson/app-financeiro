import { useCallback, useEffect, useState } from 'react'
import { listCreditCards } from '../services/creditCards'
import type { CreditCard } from '../types'

export function useCreditCards(userId: string | null) {
  const [cards, setCards] = useState<CreditCard[]>([])
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    listCreditCards(userId).then((data) => {
      if (!cancelled) {
        setCards(data)
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
  return { cards: belongsToUser ? cards : [], loading: !!userId && (loading || !belongsToUser), error: belongsToUser && error, refresh }
}
