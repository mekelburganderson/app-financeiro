import type { Database } from '../../types/database'

export type TransferAccount = Database['public']['Tables']['accounts']['Row']
export type AccountMovement = Database['public']['Tables']['account_movements']['Row']

export type TransferRecord = {
  id: string
  source_movement_id: string
  destination_movement_id: string
  source_account_id: string
  destination_account_id: string
  source_account_name: string
  destination_account_name: string
  source_account_active: boolean
  destination_account_active: boolean
  amount: number
  movement_date: string
  description: string | null
  created_at: string
  reversed: boolean
}

export type TransferDataset = { transfers: TransferRecord[]; accounts: TransferAccount[] }
export type TransferDraft = {
  source_account_id: string
  destination_account_id: string
  amount: number
  movement_date: string
  description: string | null
}
