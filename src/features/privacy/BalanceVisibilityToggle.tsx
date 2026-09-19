import { Eye, EyeOff } from 'lucide-react'
import { useBalanceVisibility } from './balance-visibility-context'

export function BalanceVisibilityToggle() {
  const { hidden, toggle } = useBalanceVisibility()
  const label = hidden ? 'Mostrar saldos e limites' : 'Ocultar saldos e limites'
  const Icon = hidden ? Eye : EyeOff
  return <button className="icon-button balance-visibility-toggle" type="button" onClick={toggle}
    aria-label={label} aria-pressed={hidden} title={label}>
    <Icon size={20} aria-hidden="true" />
  </button>
}
