import type { Database } from '../../types/database'

export type Category = Database['public']['Tables']['categories']['Row']
export type CategoryType = Database['public']['Enums']['transaction_type']
export type CategoryInput = Pick<Category, 'name' | 'type'>

export const categoryTypeLabels: Record<CategoryType, string> = {
  expense: 'Despesa',
  income: 'Receita',
}

export function categoryNameKey(name: string): string {
  return name.trim().toLocaleLowerCase('pt-BR')
}
