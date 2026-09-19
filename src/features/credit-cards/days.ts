export function parseCardDay(input: string): number | null {
  const value = input.trim()
  if (!/^\d{1,2}$/.test(value)) return null
  const day = Number(value)
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null
}

export function formatCardDay(day: number): string {
  return String(day).padStart(2, '0')
}
