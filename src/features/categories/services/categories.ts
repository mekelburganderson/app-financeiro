import { getSupabaseClient } from '../../../lib/supabase'
import type { Category, CategoryInput } from '../types'

export type CategoryErrorKind = 'duplicate' | 'type_used' | 'permission' | 'generic'

export class CategoryServiceError extends Error {
  constructor(public readonly kind: CategoryErrorKind) {
    super(kind)
  }
}

export function categoryErrorKind(code?: string): CategoryErrorKind {
  if (code === '23505') return 'duplicate'
  if (code === '23503') return 'type_used'
  if (code === '42501' || code === 'PGRST301' || code === 'PGRST116') return 'permission'
  return 'generic'
}

function throwCategoryError(error: { code?: string } | null): void {
  if (!error) return
  throw new CategoryServiceError(categoryErrorKind(error.code))
}

export async function listCategories(userId: string): Promise<Category[]> {
  const { data, error } = await getSupabaseClient().from('categories').select('*').eq('user_id', userId)
  throwCategoryError(error)
  return data ?? []
}

export async function createCategory(userId: string, input: CategoryInput): Promise<void> {
  const { error } = await getSupabaseClient().from('categories').insert({ ...input, user_id: userId, active: true })
  throwCategoryError(error)
}

export async function updateCategory(userId: string, categoryId: string, input: CategoryInput): Promise<void> {
  const { data, error } = await getSupabaseClient().from('categories').update(input)
    .eq('user_id', userId).eq('id', categoryId).select('id').single()
  throwCategoryError(error)
  if (!data) throw new CategoryServiceError('permission')
}

async function setCategoryActive(userId: string, categoryId: string, active: boolean): Promise<void> {
  const { data, error } = await getSupabaseClient().from('categories').update({ active })
    .eq('user_id', userId).eq('id', categoryId).select('id').single()
  throwCategoryError(error)
  if (!data) throw new CategoryServiceError('permission')
}

export function deactivateCategory(userId: string, categoryId: string): Promise<void> {
  return setCategoryActive(userId, categoryId, false)
}

export function reactivateCategory(userId: string, categoryId: string): Promise<void> {
  return setCategoryActive(userId, categoryId, true)
}

export async function categoryHasUsage(userId: string, categoryId: string): Promise<boolean> {
  const client = getSupabaseClient()
  const [transactions, recurrences] = await Promise.all([
    client.from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('category_id', categoryId),
    client.from('recurrence_rules').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('category_id', categoryId),
  ])
  throwCategoryError(transactions.error)
  throwCategoryError(recurrences.error)
  return (transactions.count ?? 0) > 0 || (recurrences.count ?? 0) > 0
}
