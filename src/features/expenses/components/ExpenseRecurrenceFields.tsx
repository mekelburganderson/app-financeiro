import type { RecurrenceFrequency } from '../types'

const frequencies: { value: RecurrenceFrequency; label: string }[] = [
  { value: 'daily', label: 'Diária' }, { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' }, { value: 'yearly', label: 'Anual' },
]

export function ExpenseRecurrenceFields({ checked, frequency, interval, ending, endDate, maxOccurrences,
  disabled, noun = 'Despesa', onChecked, onFrequency, onInterval, onEnding, onEndDate, onMaxOccurrences }: {
  checked: boolean; frequency: RecurrenceFrequency; interval: string
  ending: 'none' | 'date' | 'count'; endDate: string; maxOccurrences: string; disabled: boolean
  noun?: 'Despesa' | 'Receita'
  onChecked: (value: boolean) => void; onFrequency: (value: RecurrenceFrequency) => void
  onInterval: (value: string) => void; onEnding: (value: 'none' | 'date' | 'count') => void
  onEndDate: (value: string) => void; onMaxOccurrences: (value: string) => void
}) {
  return <div className="expense-extra-field">
    <label className="expense-checkbox"><input type="checkbox" checked={checked} disabled={disabled}
      onChange={(event) => onChecked(event.target.checked)} /> {noun} recorrente</label>
    {checked && <>
      <label htmlFor="expense-frequency">Periodicidade *
        <select id="expense-frequency" value={frequency} disabled={disabled}
          onChange={(event) => onFrequency(event.target.value as RecurrenceFrequency)}>
          {frequencies.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label htmlFor="expense-interval">Intervalo: a cada X unidades *
        <input id="expense-interval" type="text" inputMode="numeric" value={interval} disabled={disabled}
          onChange={(event) => onInterval(event.target.value)} />
      </label>
      <label htmlFor="expense-ending">Término
        <select id="expense-ending" value={ending} disabled={disabled}
          onChange={(event) => onEnding(event.target.value as 'none' | 'date' | 'count')}>
          <option value="none">Sem data final</option><option value="date">Até uma data</option>
          <option value="count">Quantidade de ocorrências</option>
        </select>
      </label>
      {ending === 'date' && <label htmlFor="expense-recurrence-end">Data final *
        <input id="expense-recurrence-end" type="date" value={endDate} disabled={disabled}
          onChange={(event) => onEndDate(event.target.value)} />
      </label>}
      {ending === 'count' && <label htmlFor="expense-recurrence-count">Ocorrências *
        <input id="expense-recurrence-count" type="text" inputMode="numeric" value={maxOccurrences} disabled={disabled}
          onChange={(event) => onMaxOccurrences(event.target.value)} />
      </label>}
    </>}
  </div>
}
