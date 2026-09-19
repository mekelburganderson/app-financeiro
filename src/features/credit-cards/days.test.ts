import { expect, test } from 'vitest'
import { formatCardDay, parseCardDay } from './days'

test('configured days accept 1..31 and keep the display as a day number', () => {
  expect(parseCardDay('03')).toBe(3)
  expect(parseCardDay('31')).toBe(31)
  expect(parseCardDay('0')).toBeNull()
  expect(parseCardDay('32')).toBeNull()
  expect(parseCardDay('2.5')).toBeNull()
  expect(formatCardDay(3)).toBe('03')
})
