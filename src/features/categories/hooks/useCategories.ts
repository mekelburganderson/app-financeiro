import { useCallback, useEffect, useState } from 'react'
import { listCategories } from '../services/categories'
import type { Category } from '../types'

export function useCategories(userId: string | null) {
  const [categories, setCategories] = useState<Category[]>([])
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    listCategories(userId).then((data) => {
      if (!cancelled) {
        setCategories(data)
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
  return { categories: belongsToUser ? categories : [], loading: !!userId && (loading || !belongsToUser), error: belongsToUser && error, refresh }
}
