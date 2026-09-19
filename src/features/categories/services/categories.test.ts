import { expect, test } from 'vitest'
import { categoryErrorKind } from './categories'

test('PostgREST error codes map duplicate, historical type and ownership errors', () => {
  expect(categoryErrorKind('23505')).toBe('duplicate')
  expect(categoryErrorKind('23503')).toBe('type_used')
  expect(categoryErrorKind('42501')).toBe('permission')
  expect(categoryErrorKind('PGRST116')).toBe('permission')
  expect(categoryErrorKind('XX000')).toBe('generic')
})
