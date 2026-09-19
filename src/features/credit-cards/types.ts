import type { Database } from '../../types/database'

export type CreditCard = Database['public']['Tables']['credit_cards']['Row']
export type CreditCardInput = Pick<CreditCard, 'name' | 'limit_amount' | 'closing_day' | 'due_day'>
