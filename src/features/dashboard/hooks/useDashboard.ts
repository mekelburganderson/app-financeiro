import { useCallback, useEffect, useMemo, useState } from 'react'
import { getDashboardData } from '../services/dashboard'
import type { DashboardData, DashboardPeriod, DashboardPreset } from '../types'

function iso(date:Date){const year=date.getFullYear(),month=String(date.getMonth()+1).padStart(2,'0'),day=String(date.getDate()).padStart(2,'0');return`${year}-${month}-${day}`}
function endOfMonth(year:number,month:number){return new Date(year,month+1,0)}
export function periodFor(preset:DashboardPreset,customStart:string,customEnd:string,now=new Date()):DashboardPeriod{
  const year=now.getFullYear(),month=now.getMonth()
  if(preset==='custom')return{start:customStart,end:customEnd,label:'Período personalizado'}
  if(preset==='last_month')return{start:iso(new Date(year,month-1,1)),end:iso(endOfMonth(year,month-1)),label:'Mês passado'}
  if(preset==='last_3_months')return{start:iso(new Date(year,month-2,1)),end:iso(endOfMonth(year,month)),label:'Últimos 3 meses'}
  if(preset==='last_6_months')return{start:iso(new Date(year,month-5,1)),end:iso(endOfMonth(year,month)),label:'Últimos 6 meses'}
  if(preset==='this_year')return{start:`${year}-01-01`,end:`${year}-12-31`,label:'Este ano'}
  return{start:iso(new Date(year,month,1)),end:iso(endOfMonth(year,month)),label:'Este mês'}
}
const empty:DashboardData={summary:{availableBalance:0,income:0,expense:0,result:0,payable:0,receivable:0,openInvoices:0},cashFlow:{incoming:0,outgoing:0,net:0},expensesByCategory:[],incomesByCategory:[],monthlyEvolution:[],accountBalances:[],upcomingExpenses:[],upcomingIncomes:[],upcomingInvoices:[],cards:[],sectionErrors:[],hasData:false}
export function useDashboard(userId:string|null){
  const[preset,setPreset]=useState<DashboardPreset>('this_month'),[customStart,setCustomStart]=useState(''),[customEnd,setCustomEnd]=useState(''),[data,setData]=useState(empty),[loadedKey,setLoadedKey]=useState<string|null>(null),[failed,setFailed]=useState(false),[revision,setRevision]=useState(0)
  const period=useMemo(()=>periodFor(preset,customStart,customEnd),[preset,customStart,customEnd]),valid=!!period.start&&!!period.end&&period.start<=period.end,refresh=useCallback(()=>setRevision((value)=>value+1),[])
  const requestKey=userId&&valid?`${userId}:${period.start}:${period.end}:${revision}`:null,loading=!!requestKey&&loadedKey!==requestKey
  useEffect(()=>{if(!userId||!valid||!requestKey)return;let cancelled=false;getDashboardData(userId,period).then((result)=>{if(!cancelled){setData(result);setFailed(result.sectionErrors.length===4)}}).catch(()=>{if(!cancelled)setFailed(true)}).finally(()=>{if(!cancelled)setLoadedKey(requestKey)});return()=>{cancelled=true}},[userId,period,valid,revision,requestKey])
  return{data,loading,failed,period,preset,customStart,customEnd,valid,setPreset,setCustomStart,setCustomEnd,refresh}
}
