import { formatBRL } from '../../lib/finance'
import { useBalanceVisibility } from './balance-visibility-context'

export function PrivateAmount({ value }: { value: number }) {
  const { hidden } = useBalanceVisibility()
  return hidden
    ? <span className="private-amount" role="img" aria-label="Valor oculto"><span aria-hidden="true">••••</span></span>
    : <>{formatBRL(value)}</>
}
