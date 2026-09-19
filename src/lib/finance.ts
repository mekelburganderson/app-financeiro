const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const maxCents = 99_999_999_999_999n // numeric(14,2)

export function formatBRL(value: number): string {
  return brl.format(value)
}

export function parseMoneyInput(input: string): number | null {
  const value = input.trim()
  if (!/^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(value)) return null
  const negative = value.startsWith('-')
  const unsigned = negative ? value.slice(1) : value
  const [whole = '0', fraction = ''] = unsigned.replaceAll('.', '').split(',')
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0') || '0')
  if (cents > maxCents) return null
  return Number(negative ? -cents : cents) / 100
}

export function moneyForInput(value: number): string {
  return value.toFixed(2).replace('.', ',')
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year = 0, month = 0, day = 0] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function formatBRDate(value: string): string {
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

export function todayISO(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function currentMonthBounds(): { start: string; end: string } {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth() + 1
  const prefix = `${year}-${String(month).padStart(2, '0')}-`
  const finalDay = new Date(year, month, 0).getDate()
  return { start: `${prefix}01`, end: `${prefix}${String(finalDay).padStart(2, '0')}` }
}
