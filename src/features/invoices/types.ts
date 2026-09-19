import type { Database } from '../../types/database'
import type { Account } from '../accounts/types'
import type { CreditCard } from '../credit-cards/types'
export type InvoiceStatus=Database['public']['Enums']['invoice_status']
export type Invoice=Database['public']['Tables']['credit_card_invoices']['Row']
export type InvoiceRecord=Invoice&{card_name:string;card_active:boolean;payment_account_name:string|null;total_amount:number;transaction_count:number;payment_movement_id:string|null;has_payment_history:boolean}
export type InvoiceItem=Database['public']['Tables']['transactions']['Row']&{category_name:string}
export type InvoiceDataset={invoices:InvoiceRecord[];cards:CreditCard[];accounts:Account[]}
export type InvoiceDetailsData={invoice:InvoiceRecord;items:InvoiceItem[]}
export const invoiceStatusLabels:Record<InvoiceStatus,string>={open:'Aberta',closed:'Fechada',paid:'Paga'}
export function formatReferenceMonth(value:string){const[year,month]=value.split('-').map(Number);const label=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year!,month!-1,1)));return label.charAt(0).toUpperCase()+label.slice(1)}
