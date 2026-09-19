import { getSupabaseClient } from '../../../lib/supabase'
import type { Database } from '../../../types/database'
import type { AccountBalanceItem, CardSummary, CashFlow, CategoryMetric, DashboardData, DashboardPeriod, DashboardSummary, MonthlyMetric, UpcomingInvoice, UpcomingTransaction } from '../types'

type Transaction=Database['public']['Tables']['transactions']['Row']
type Movement=Database['public']['Tables']['account_movements']['Row']
const sum=(values:number[])=>values.reduce((total,value)=>total+value,0)
function check(error:{message?:string}|null){if(error)throw new Error('dashboard query failed')}

export function getDashboardSummary(periodTransactions:Transaction[],pending:Transaction[],invoiceTotal:number,availableBalance:number):DashboardSummary{
  const income=sum(periodTransactions.filter((item)=>item.type==='income').map((item)=>item.amount))
  const expense=sum(periodTransactions.filter((item)=>item.type==='expense').map((item)=>item.amount))
  const directPending=pending.filter((item)=>item.planned_payment_method!=='credit_card')
  return{availableBalance,income,expense,result:income-expense,
    payable:sum(directPending.filter((item)=>item.type==='expense').map((item)=>item.amount)),
    receivable:sum(directPending.filter((item)=>item.type==='income').map((item)=>item.amount)),openInvoices:invoiceTotal}
}
export function getCategorySummary(transactions:Transaction[],categories:Map<string,string>,type:'expense'|'income'):CategoryMetric[]{
  const grouped=new Map<string,number>();for(const item of transactions.filter((row)=>row.type===type))grouped.set(item.category_id,(grouped.get(item.category_id)??0)+item.amount)
  const total=sum([...grouped.values()]);return[...grouped].map(([id,amount])=>({id,name:categories.get(id)??'Categoria indisponível',amount,percentage:total?amount/total*100:0})).sort((a,b)=>b.amount-a.amount)
}
export function getMonthlyEvolution(transactions:Transaction[],period:DashboardPeriod):MonthlyMetric[]{
  const grouped=new Map<string,{income:number;expense:number}>();for(const row of transactions){const month=row.transaction_date.slice(0,7),item=grouped.get(month)??{income:0,expense:0};item[row.type]+=row.amount;grouped.set(month,item)}
  const result:MonthlyMetric[]=[],startParts=period.start.slice(0,7).split('-').map(Number),endParts=period.end.slice(0,7).split('-').map(Number);let year=startParts[0]??0,month=startParts[1]??0;const endYear=endParts[0]??0,endMonth=endParts[1]??0
  while(year<endYear||(year===endYear&&month<=endMonth)){const key=`${year}-${String(month).padStart(2,'0')}`,item=grouped.get(key)??{income:0,expense:0};result.push({month:key,label:new Intl.DateTimeFormat('pt-BR',{month:'short',year:'2-digit',timeZone:'UTC'}).format(new Date(`${key}-01T00:00:00Z`)).replace('.',''),income:item.income,expense:item.expense,result:item.income-item.expense});month++;if(month===13){month=1;year++}}
  return result.slice(-24)
}
export function getCashFlowSummary(movements:Movement[],originals:Map<string,Movement>):CashFlow{
  const relevant=movements.filter((movement)=>movement.origin_type!=='transfer'&&!(movement.origin_type==='reversal'&&movement.reversal_of_movement_id&&originals.get(movement.reversal_of_movement_id)?.origin_type==='transfer'))
  const incoming=sum(relevant.filter((item)=>item.type==='in').map((item)=>item.amount)),outgoing=sum(relevant.filter((item)=>item.type==='out').map((item)=>item.amount))
  return{incoming,outgoing,net:incoming-outgoing}
}
function upcoming(rows:Transaction[],categories:Map<string,string>,type:'expense'|'income',period:DashboardPeriod):UpcomingTransaction[]{return rows.filter((row)=>row.type===type&&row.planned_payment_method!=='credit_card'&&row.due_date&&row.due_date>=period.start).sort((a,b)=>(a.due_date??'').localeCompare(b.due_date??'')).slice(0,5).map((row)=>({id:row.id,description:row.description,categoryName:categories.get(row.category_id)??'Categoria indisponível',amount:row.amount,dueDate:row.due_date!}))}

async function loadBalances(userId:string){const c=getSupabaseClient(),result=await c.from('account_balances').select('*').eq('user_id',userId);check(result.error);const balances:AccountBalanceItem[]=(result.data??[]).filter((row)=>row.active&&row.account_id&&row.name&&row.current_balance!==null).map((row)=>({id:row.account_id!,name:row.name!,balance:row.current_balance!}));return balances}
async function loadCompetence(userId:string,period:DashboardPeriod){const c=getSupabaseClient();const[periodResult,pendingResult,categoriesResult]=await Promise.all([
  c.from('transactions').select('*').eq('user_id',userId).gte('transaction_date',period.start).lte('transaction_date',period.end),
  c.from('transactions').select('*').eq('user_id',userId).eq('status','pending').not('due_date','is',null).lte('due_date',period.end),
  c.from('categories').select('id,name').eq('user_id',userId)])
  check(periodResult.error);check(pendingResult.error);check(categoriesResult.error);return{transactions:periodResult.data??[],pending:pendingResult.data??[],categories:new Map((categoriesResult.data??[]).map((row)=>[row.id,row.name]))}}
async function loadCash(userId:string,period:DashboardPeriod){const c=getSupabaseClient(),result=await c.from('account_movements').select('*').eq('user_id',userId).gte('movement_date',period.start).lte('movement_date',period.end);check(result.error);const movements=result.data??[],ids=movements.map((row)=>row.reversal_of_movement_id).filter((id):id is string=>!!id);if(!ids.length)return{movements,originals:new Map<string,Movement>()};const originalsResult=await c.from('account_movements').select('*').eq('user_id',userId).in('id',ids);check(originalsResult.error);return{movements,originals:new Map((originalsResult.data??[]).map((row)=>[row.id,row]))}}
async function loadInvoices(userId:string){const c=getSupabaseClient();const[invoicesResult,totalsResult,cardsResult]=await Promise.all([
  c.from('credit_card_invoices').select('*').eq('user_id',userId).in('status',['open','closed']),
  c.from('invoice_totals').select('*').eq('user_id',userId).in('status',['open','closed']),c.from('credit_cards').select('*').eq('user_id',userId).eq('active',true)])
  check(invoicesResult.error);check(totalsResult.error);check(cardsResult.error);const totals=new Map((totalsResult.data??[]).map((row)=>[row.invoice_id,row.total_amount??0])),cardNames=new Map((cardsResult.data??[]).map((row)=>[row.id,row.name]));const invoices:UpcomingInvoice[]=(invoicesResult.data??[]).map((row)=>({id:row.id,cardName:cardNames.get(row.credit_card_id)??'Cartão inativo',amount:totals.get(row.id)??0,dueDate:row.due_date,status:row.status as 'open'|'closed'}));const cards:CardSummary[]=(cardsResult.data??[]).map((card)=>({id:card.id,name:card.name,limit:card.limit_amount,invoice:[...invoices].filter((invoice)=>invoicesResult.data?.find((row)=>row.id===invoice.id)?.credit_card_id===card.id).sort((a,b)=>a.dueDate.localeCompare(b.dueDate))[0]??null}));return{invoices,cards}}

export async function getDashboardData(userId:string,period:DashboardPeriod):Promise<DashboardData>{
  const results=await Promise.allSettled([loadBalances(userId),loadCompetence(userId,period),loadCash(userId,period),loadInvoices(userId)])
  const balances=results[0].status==='fulfilled'?results[0].value:[],competence=results[1].status==='fulfilled'?results[1].value:{transactions:[],pending:[],categories:new Map<string,string>()},cash=results[2].status==='fulfilled'?results[2].value:{movements:[],originals:new Map<string,Movement>()},invoiceData=results[3].status==='fulfilled'?results[3].value:{invoices:[],cards:[]}
  const sectionErrors=(['balances','competence','cash','invoices'] as const).filter((_,index)=>results[index]?.status==='rejected'),invoiceTotal=sum(invoiceData.invoices.filter((invoice)=>invoice.dueDate<=period.end).map((invoice)=>invoice.amount)),summary=getDashboardSummary(competence.transactions,competence.pending,invoiceTotal,sum(balances.map((item)=>item.balance)))
  return{summary,cashFlow:getCashFlowSummary(cash.movements,cash.originals),expensesByCategory:getCategorySummary(competence.transactions,competence.categories,'expense'),incomesByCategory:getCategorySummary(competence.transactions,competence.categories,'income'),monthlyEvolution:getMonthlyEvolution(competence.transactions,period),accountBalances:balances,upcomingExpenses:upcoming(competence.pending,competence.categories,'expense',period),upcomingIncomes:upcoming(competence.pending,competence.categories,'income',period),upcomingInvoices:[...invoiceData.invoices].filter((invoice)=>invoice.dueDate>=period.start&&invoice.dueDate<=period.end).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).slice(0,5),cards:invoiceData.cards,sectionErrors,hasData:competence.transactions.length>0||cash.movements.length>0||invoiceData.invoices.length>0||balances.some((item)=>item.balance!==0)}
}
