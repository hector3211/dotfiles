import { expect, test } from 'claude-code/testing'

import { billable, clock, elapsed, parseId, statusText } from '../hooks/register'

test('times and bills a ticket', async () => {
  const t = { id: '12345', bankedMs: 10 * 60_000, runningSince: 1_000, prompts: [] }
  expect(elapsed(t, 1_000 + 32 * 60_000)).toBe(42 * 60_000)
  expect(clock(42 * 60_000)).toBe('0:42')
  expect(clock(125 * 60_000)).toBe('2:05')
  expect(billable(42 * 60_000)).toBe('0.75')
  expect(billable(60_000)).toBe('0.25')
  expect(billable(60 * 60_000)).toBe('1.00')
  expect(statusText({ ...t, runningSince: null }, 0)).toBe('#12345 · 0:10 (paused)')
})

test('reads ticket numbers', async () => {
  expect(parseId('12345')).toBe('12345')
  expect(parseId('#12345')).toBe('12345')
  expect(parseId('stop')).toBe(null)
  expect(parseId('12')).toBe(null)
})
