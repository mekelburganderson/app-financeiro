import { expect, test } from 'vitest'
import { creditCardErrorKind } from './creditCards'

test('database errors map to validation, permission and historical-cycle messages', () => {
  expect(creditCardErrorKind('23514', 'credit_cards_due_day_valid')).toBe('validation')
  expect(creditCardErrorKind('23514', 'Card cycle is immutable after the first invoice')).toBe('history')
  expect(creditCardErrorKind('42501')).toBe('permission')
  expect(creditCardErrorKind('PGRST116')).toBe('permission')
  expect(creditCardErrorKind('XX000')).toBe('generic')
})
