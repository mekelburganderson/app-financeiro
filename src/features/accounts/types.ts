import type { Database } from '../../types/database'

export type Account = Database['public']['Tables']['accounts']['Row']
export type AccountType = Database['public']['Enums']['account_type']
export type AccountInput = Pick<Account, 'name' | 'type' | 'initial_balance' | 'initial_balance_date'>
export type AccountWithBalance = Account & { current_balance: number }

export const accountTypeLabels: Record<AccountType, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  cash: 'Dinheiro / Carteira',
  other: 'Outra',
}
