import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import { AuthContext } from '../features/auth/auth-context'
import type { AuthState } from '../features/auth/auth-context'
import { getCashFlowSummary, getDashboardData, getDashboardSummary } from '../features/dashboard/services/dashboard'
import type { DashboardData } from '../features/dashboard/types'
import type { Database } from '../types/database'
import { DashboardPage } from './DashboardPage'

vi.mock('../features/dashboard/services/dashboard',async(importOriginal)=>{const original=await importOriginal<typeof import('../features/dashboard/services/dashboard')>();return{...original,getDashboardData:vi.fn()}})
const user={id:'dashboard-user'} as User,auth:AuthState={user,session:null,profile:null,loading:false,error:null}
const full:DashboardData={summary:{availableBalance:7500,income:4200,expense:2350,result:1850,payable:610,receivable:920,openInvoices:1300},cashFlow:{incoming:3900,outgoing:2100,net:1800},expensesByCategory:[{id:'food',name:'Alimentação',amount:1500,percentage:63.8}],incomesByCategory:[{id:'salary',name:'Salário',amount:4200,percentage:100}],monthlyEvolution:[{month:'2026-09',label:'set 26',income:4200,expense:2350,result:1850}],accountBalances:[{id:'a1',name:'Itaú',balance:5200},{id:'a2',name:'Nubank',balance:2300}],upcomingExpenses:[{id:'e1',description:'Aluguel',categoryName:'Moradia',amount:1200,dueDate:'2026-09-20'}],upcomingIncomes:[{id:'i1',description:'Freela',categoryName:'Trabalho',amount:900,dueDate:'2026-09-25'}],upcomingInvoices:[{id:'f1',cardName:'Cartão Nubank',amount:1300,dueDate:'2026-09-28',status:'closed'}],cards:[{id:'c1',name:'Nubank',limit:5000,invoice:{id:'f1',cardName:'Cartão Nubank',amount:1300,dueDate:'2026-09-28',status:'closed'}}],sectionErrors:[],hasData:true}
const empty:DashboardData={...full,summary:{availableBalance:0,income:0,expense:0,result:0,payable:0,receivable:0,openInvoices:0},cashFlow:{incoming:0,outgoing:0,net:0},expensesByCategory:[],incomesByCategory:[],monthlyEvolution:[],accountBalances:[],upcomingExpenses:[],upcomingIncomes:[],upcomingInvoices:[],cards:[],hasData:false}
function mount(){return render(<AuthContext.Provider value={auth}><DashboardPage/></AuthContext.Provider>)}
async function loaded(){await waitFor(()=>expect(screen.queryByText('Carregando dados financeiros…')).toBeNull())}
function movement(values:Partial<Database['public']['Tables']['account_movements']['Row']>={}){return{id:'m1',user_id:user.id,account_id:'a1',type:'out' as const,amount:100,movement_date:'2026-09-10',origin_type:'expense_payment' as const,origin_id:'t1',transfer_group_id:null,reversal_of_movement_id:null,description:'Movimento',created_at:'2026-09-10',...values}}
function transaction(values:Partial<Database['public']['Tables']['transactions']['Row']>={}){return{id:'t1',user_id:user.id,type:'expense' as const,description:'Despesa',category_id:'cat',amount:100,transaction_date:'2026-09-10',due_date:'2026-09-10',status:'pending' as const,planned_payment_method:null,actual_payment_method:null,account_id:null,credit_card_id:null,credit_card_invoice_id:null,installment_group_id:null,installment_number:null,installment_total:null,recurrence_rule_id:null,settled_at:null,notes:null,created_at:'2026-09-10',updated_at:'2026-09-10',...values}}
beforeEach(()=>{vi.clearAllMocks();vi.mocked(getDashboardData).mockResolvedValue(full)})
afterEach(()=>cleanup())

test('1: renderização',async()=>{mount();await loaded();expect(screen.getByRole('heading',{name:'Dashboard'})).toBeTruthy();expect(getDashboardData).toHaveBeenCalledWith(user.id,expect.objectContaining({label:'Este mês'}))})
test('2: estado sem dados',async()=>{vi.mocked(getDashboardData).mockResolvedValue(empty);mount();await loaded();expect(screen.getByText(/começará a ganhar vida/)).toBeTruthy()})
test('3: saldo disponível',async()=>{mount();await loaded();expect(screen.getByText(/R\$\s*7\.500,00/)).toBeTruthy()})
test('4: receitas',async()=>{mount();await loaded();expect(screen.getAllByText(/R\$\s*4\.200,00/).length).toBeGreaterThan(0)})
test('5: despesas',async()=>{mount();await loaded();expect(screen.getAllByText(/R\$\s*2\.350,00/).length).toBeGreaterThan(0)})
test('6: resultado',async()=>{mount();await loaded();expect(screen.getAllByText(/R\$\s*1\.850,00/).length).toBeGreaterThan(0)})
test('7: contas a pagar',async()=>{mount();await loaded();expect(screen.getByText(/R\$\s*610,00/)).toBeTruthy()})
test('8: contas a receber',async()=>{mount();await loaded();expect(screen.getByText(/R\$\s*920,00/)).toBeTruthy()})
test('9: faturas em aberto',async()=>{mount();await loaded();expect(screen.getAllByText(/R\$\s*1\.300,00/).length).toBeGreaterThan(0)})
test('10: filtro de período recarrega dados',async()=>{mount();await loaded();fireEvent.change(screen.getByLabelText('Período'),{target:{value:'last_3_months'}});await waitFor(()=>expect(getDashboardData).toHaveBeenCalledTimes(2));expect(getDashboardData).toHaveBeenLastCalledWith(user.id,expect.objectContaining({label:'Últimos 3 meses'}))})
test('11: despesas por categoria',async()=>{mount();await loaded();expect(screen.getByRole('heading',{name:'Despesas por categoria'})).toBeTruthy();expect(screen.getByText('Alimentação')).toBeTruthy()})
test('12: receitas por categoria',async()=>{mount();await loaded();expect(screen.getByRole('heading',{name:'Receitas por categoria'})).toBeTruthy();expect(screen.getByText('Salário')).toBeTruthy()})
test('13: evolução mensal',async()=>{mount();await loaded();expect(screen.getByRole('img',{name:/Receitas, despesas e resultado/})).toBeTruthy();expect(screen.getByText('set 26')).toBeTruthy()})
test('14: fluxo de caixa',async()=>{mount();await loaded();expect(screen.getByText('Entradas reais')).toBeTruthy();expect(screen.getByText(/R\$\s*3\.900,00/)).toBeTruthy()})
test('15: transferência e seu estorno não distorcem caixa',()=>{const original=movement({id:'transfer-out',origin_type:'transfer',transfer_group_id:'g1'}),reversal=movement({id:'reverse-transfer',type:'in',origin_type:'reversal',reversal_of_movement_id:original.id});expect(getCashFlowSummary([original,reversal],new Map([[original.id,original]]))).toEqual({incoming:0,outgoing:0,net:0})})
test('16: pagamento de fatura entra no caixa',()=>{expect(getCashFlowSummary([movement({origin_type:'credit_card_payment',amount:700})],new Map())).toEqual({incoming:0,outgoing:700,net:-700})})
test('17: pagamento de fatura não duplica despesa de competência',()=>{const summary=getDashboardSummary([transaction({amount:700,credit_card_invoice_id:'f1'})],[],700,0);expect(summary.expense).toBe(700)})
test('compras no cartão não duplicam contas a pagar',()=>{const cardPurchase=transaction({amount:700,planned_payment_method:'credit_card',credit_card_invoice_id:'f1'});expect(getDashboardSummary([cardPurchase],[cardPurchase],700,0)).toMatchObject({expense:700,payable:0,openInvoices:700})})
test('18: saldo por conta',async()=>{mount();await loaded();expect(screen.getByRole('heading',{name:'Saldo por conta'})).toBeTruthy();expect(screen.getByText('Itaú')).toBeTruthy()})
test('19: próximos vencimentos',async()=>{mount();await loaded();expect(screen.getByText('Aluguel')).toBeTruthy();expect(screen.getByText(/Moradia/)).toBeTruthy()})
test('20: próximas faturas',async()=>{mount();await loaded();expect(screen.getByText('Cartão Nubank')).toBeTruthy();expect(screen.getByText(/Fechada/)).toBeTruthy()})
test('21: recebimentos previstos',async()=>{mount();await loaded();expect(screen.getByText('Freela')).toBeTruthy();expect(screen.getByText(/Trabalho/)).toBeTruthy()})
test('22: erro parcial preserva outras seções',async()=>{vi.mocked(getDashboardData).mockResolvedValue({...full,sectionErrors:['cash'],cashFlow:{incoming:0,outgoing:0,net:0}});mount();await loaded();expect(screen.getByRole('alert').textContent).toContain('Algumas seções');expect(screen.getByText('Alimentação')).toBeTruthy()})
test('23: loading',()=>{vi.mocked(getDashboardData).mockReturnValue(new Promise(()=>undefined));mount();expect(screen.getByText('Carregando dados financeiros…')).toBeTruthy()})
test('24: estrutura responsiva usa grids próprios',async()=>{const{container}=mount();await loaded();expect(container.querySelector('.dashboard-summary-grid')).toBeTruthy();expect(container.querySelectorAll('.dashboard-two-columns').length).toBe(2);expect(container.querySelector('.dashboard-list-grid')).toBeTruthy()})
