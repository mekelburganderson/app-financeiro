import { ArrowDownLeft, ArrowUpRight, CircleDollarSign, CreditCard, Landmark, ReceiptText, Scale } from 'lucide-react'
import { CategoryChart, MonthlyEvolutionChart } from '../features/dashboard/components/DashboardCharts'
import { AccountBalancesList, CardsSummary, UpcomingInvoices, UpcomingTransactions } from '../features/dashboard/components/DashboardLists'
import { DashboardPeriodFilter } from '../features/dashboard/components/DashboardPeriodFilter'
import { CashFlowSummary, SummaryCard } from '../features/dashboard/components/DashboardSummaries'
import { useDashboard } from '../features/dashboard/hooks/useDashboard'
import { useAuth } from '../hooks/useAuth'

export function DashboardPage(){
  const{user}=useAuth(),dashboard=useDashboard(user?.id??null),{data}=dashboard
  return <div className="dashboard-page"><div className="page-heading"><div><p className="eyebrow">VISÃO GERAL</p><h1>Dashboard</h1><p>Competência, caixa e saldos em uma visão clara.</p></div></div>
    <DashboardPeriodFilter preset={dashboard.preset} start={dashboard.customStart} end={dashboard.customEnd} valid={dashboard.valid} onPreset={dashboard.setPreset} onStart={dashboard.setCustomStart} onEnd={dashboard.setCustomEnd}/>
    {dashboard.loading&&<div className="dashboard-loading" role="status"><div className="loading-spinner"/> Carregando dados financeiros…</div>}
    {!dashboard.loading&&dashboard.failed&&<div className="account-state" role="alert"><p>Não foi possível carregar os dados financeiros.</p><button className="account-secondary-button" onClick={dashboard.refresh}>Tentar novamente</button></div>}
    {!dashboard.loading&&!dashboard.failed&&<>
      {!!data.sectionErrors.length&&<p className="account-notice account-notice-error" role="alert">Algumas seções não puderam ser atualizadas. Os demais dados continuam disponíveis.</p>}
      {!data.hasData&&<p className="dashboard-empty-note">Seu dashboard começará a ganhar vida conforme você registrar suas finanças.</p>}
      <section className="dashboard-summary-grid" aria-label="Resumo financeiro"><SummaryCard label="Saldo disponível" value={data.summary.availableBalance} icon={Landmark} tone="balance"/><SummaryCard label="Receitas do período" value={data.summary.income} icon={ArrowUpRight} tone="income"/><SummaryCard label="Despesas do período" value={data.summary.expense} icon={ArrowDownLeft} tone="expense"/><SummaryCard label="Resultado do período" value={data.summary.result} icon={Scale} tone={data.summary.result>=0?'income':'expense'}/><SummaryCard label="Contas a pagar" value={data.summary.payable} icon={ReceiptText}/><SummaryCard label="Contas a receber" value={data.summary.receivable} icon={CircleDollarSign}/><SummaryCard label="Faturas em aberto" value={data.summary.openInvoices} icon={CreditCard} tone="invoice"/></section>
      <div className="dashboard-two-columns"><CashFlowSummary cash={data.cashFlow}/><AccountBalancesList items={data.accountBalances}/></div>
      <div className="dashboard-two-columns"><CategoryChart title="Despesas por categoria" items={data.expensesByCategory} emptyText="Sem despesas no período."/><CategoryChart title="Receitas por categoria" items={data.incomesByCategory} emptyText="Sem receitas no período."/></div>
      <MonthlyEvolutionChart items={data.monthlyEvolution}/>
      <div className="dashboard-list-grid"><UpcomingTransactions title="Próximos vencimentos" items={data.upcomingExpenses} dateLabel="vence em"/><UpcomingInvoices items={data.upcomingInvoices}/><UpcomingTransactions title="Recebimentos previstos" items={data.upcomingIncomes} dateLabel="previsto para"/><CardsSummary items={data.cards}/></div>
    </>}
  </div>
}
