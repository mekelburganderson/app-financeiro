import { ArrowDownLeft, ArrowDownUp, ArrowUpRight, CreditCard, Landmark, LayoutDashboard, ReceiptText, Tags } from 'lucide-react'

export const navigation = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/despesas', label: 'Despesas', icon: ArrowDownLeft },
  { to: '/receitas', label: 'Receitas', icon: ArrowUpRight },
  { to: '/transferencias', label: 'Transferências', icon: ArrowDownUp },
  { to: '/cartoes', label: 'Cartões', icon: CreditCard },
  { to: '/faturas', label: 'Faturas', icon: ReceiptText },
  { to: '/contas', label: 'Contas', icon: Landmark },
  { to: '/categorias', label: 'Categorias', icon: Tags },
] as const
