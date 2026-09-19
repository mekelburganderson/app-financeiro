export function ExpenseInstallmentFields({ checked, count, disabled, onChecked, onCount }: {
  checked: boolean; count: string; disabled: boolean
  onChecked: (value: boolean) => void; onCount: (value: string) => void
}) {
  return <div className="expense-extra-field">
    <label className="expense-checkbox"><input type="checkbox" checked={checked} disabled={disabled}
      onChange={(event) => onChecked(event.target.checked)} /> Parcelar despesa</label>
    {checked && <label htmlFor="expense-installments">Número de parcelas *
      <input id="expense-installments" type="text" inputMode="numeric" value={count} disabled={disabled}
        onChange={(event) => onCount(event.target.value)} placeholder="3" />
    </label>}
  </div>
}
