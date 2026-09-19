export type DashboardPreset = 'this_month'|'last_month'|'last_3_months'|'last_6_months'|'this_year'|'custom'
export type DashboardPeriod = { start:string; end:string; label:string }
export type DashboardSummary = { availableBalance:number; income:number; expense:number; result:number; payable:number; receivable:number; openInvoices:number }
export type CashFlow = { incoming:number; outgoing:number; net:number }
export type CategoryMetric = { id:string; name:string; amount:number; percentage:number }
export type MonthlyMetric = { month:string; label:string; income:number; expense:number; result:number }
export type AccountBalanceItem = { id:string; name:string; balance:number }
export type UpcomingTransaction = { id:string; description:string; categoryName:string; amount:number; dueDate:string }
export type UpcomingInvoice = { id:string; cardName:string; amount:number; dueDate:string; status:'open'|'closed' }
export type CardSummary = { id:string; name:string; limit:number; invoice:UpcomingInvoice|null }
export type DashboardSection = 'balances'|'competence'|'cash'|'invoices'
export type DashboardData = {
  summary:DashboardSummary; cashFlow:CashFlow; expensesByCategory:CategoryMetric[]; incomesByCategory:CategoryMetric[]
  monthlyEvolution:MonthlyMetric[]; accountBalances:AccountBalanceItem[]; upcomingExpenses:UpcomingTransaction[]
  upcomingIncomes:UpcomingTransaction[]; upcomingInvoices:UpcomingInvoice[]; cards:CardSummary[]
  sectionErrors:DashboardSection[]; hasData:boolean
}
