import type { Database } from '../../types/database'
import type { Account } from '../accounts/types'
import type { Category } from '../categories/types'
import type { CreditCard } from '../credit-cards/types'

export type Expense = Database['public']['Tables']['transactions']['Row']
export type PaymentMethod = Database['public']['Enums']['payment_method']
export type ExpenseStatus = Database['public']['Enums']['transaction_status']
export type InvoiceStatus = Database['public']['Enums']['invoice_status']
export type RecurrenceFrequency = Database['public']['Enums']['recurrence_frequency']

export type ExpenseInput = Pick<Expense, 'description' | 'category_id' | 'amount' | 'transaction_date' | 'due_date' | 'notes'> & {
  planned_payment_method: PaymentMethod
  credit_card_id: string | null
  account_id: string | null
}

export type PaidExpenseInput = ExpenseInput & {
  payment_account_id: string
  actual_payment_method: Exclude<PaymentMethod, 'credit_card'>
  settled_at: string
}

export type RecurrenceInput = ExpenseInput & {
  frequency: RecurrenceFrequency
  interval_count: number
  end_date: string | null
  max_occurrences: number | null
}

export type ExpenseDraft = {
  input: ExpenseInput
  status: ExpenseStatus
  installments: number | null
  recurrence: Omit<RecurrenceInput, keyof ExpenseInput> | null
  payment: { account_id: string; method: Exclude<PaymentMethod, 'credit_card'>; settled_at: string } | null
}

export type ExpenseRecord = Expense & {
  category_name: string
  card_name: string | null
  account_name: string | null
  invoice_status: InvoiceStatus | null
  invoice_reference_month: string | null
  payment_movement_id: string | null
  has_payment_history: boolean
  installment_description: string | null
  recurrence_frequency: RecurrenceFrequency | null
  recurrence_interval_count: number | null
}

export type ExpenseOptions = { categories: Category[]; accounts: Account[]; cards: CreditCard[] }
export type ExpenseDataset = { expenses: ExpenseRecord[]; options: ExpenseOptions }

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  credit_card: 'Cartão de crédito', debit_card: 'Cartão de débito', pix: 'PIX',
  cash: 'Dinheiro', boleto: 'Boleto', bank_transfer: 'Transferência bancária', other: 'Outro',
}

export const recurrenceLabels: Record<RecurrenceFrequency, string> = {
  daily: 'Diária', weekly: 'Semanal', monthly: 'Mensal', yearly: 'Anual',
}
