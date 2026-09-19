import { expect, test } from 'vitest'
import { formatBRL, isValidDate, parseMoneyInput } from '../../lib/finance'

test('money parser uses integer cents and respects numeric(14,2)', () => {
  expect(parseMoneyInput('1.234,56')).toBe(1234.56)
  expect(parseMoneyInput('-0,01')).toBe(-0.01)
  expect(parseMoneyInput('0')).toBe(0)
  expect(parseMoneyInput('')).toBeNull()
  expect(parseMoneyInput('1,234')).toBeNull()
  expect(parseMoneyInput('1000000000000')).toBeNull()
  expect(formatBRL(1250.5)).toMatch(/R\$\s*1\.250,50/)
})

test('financial dates remain ISO strings and reject impossible days', () => {
  expect(isValidDate('2026-09-15')).toBe(true)
  expect(isValidDate('2026-02-29')).toBe(false)
})
