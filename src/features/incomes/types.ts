import type { Database } from '../../types/database'
import type { Account } from '../accounts/types'
import type { Category } from '../categories/types'

export type Income = Database['public']['Tables']['transactions']['Row']
export type IncomeStatus = Database['public']['Enums']['transaction_status']
export type RecurrenceFrequency = Database['public']['Enums']['recurrence_frequency']
export type IncomeInput = Pick<Income, 'description' | 'category_id' | 'amount' | 'transaction_date' | 'due_date' | 'notes'>
export type IncomeDraft = { input: IncomeInput; status: IncomeStatus
  receipt: { account_id: string; received_at: string } | null
  recurrence: { frequency: RecurrenceFrequency; interval_count: number; end_date: string | null; max_occurrences: number | null; account_id: string | null } | null }
export type IncomeRecord = Income & { category_name: string; account_name: string | null
  receipt_movement_id: string | null; has_receipt_history: boolean
  recurrence_frequency: RecurrenceFrequency | null; recurrence_interval_count: number | null }
export type IncomeOptions = { categories: Category[]; accounts: Account[] }
export type IncomeDataset = { incomes: IncomeRecord[]; options: IncomeOptions }

