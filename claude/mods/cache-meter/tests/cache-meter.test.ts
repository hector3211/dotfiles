import { expect, test } from 'claude-code/testing'

import { bar, contextColor, countdown, fmt, limitLabel, mode, modelName, parseBudget, usd } from '../hooks/register'

test('formats tokens, countdowns and bars', async () => {
  expect(fmt(950)).toBe('950')
  expect(fmt(84_200)).toBe('84k')
  expect(fmt(3_400_000)).toBe('3.4M')
  expect(countdown(272_000)).toBe('4:32')
  expect(countdown(59 * 60_000 + 1)).toBe('59:01')
  expect(countdown(-5)).toBe('0:00')
  expect(bar(0.5)).toEqual(['━━━━━━', '━━━━━━'])
  expect(bar(0.5, 8)).toEqual(['━━━━', '━━━━'])
  expect(bar(2, 4)).toEqual(['━━━━', ''])
  expect(contextColor(42)).toBe('#a6e3a1')
  expect(contextColor(90)).toBe('#f38ba8')
})

test('mode follows the cache state', async () => {
  const ttl = 60 * 60_000
  expect(mode(0, ttl, false).label).toBe('IDLE')
  expect(mode(50 * 60_000, ttl, true).label).toBe('WARM')
  expect(mode(5 * 60_000, ttl, true).label).toBe('COOL')
  expect(mode(0, ttl, true).label).toBe('COLD')
})

test('shortens model ids', async () => {
  expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  expect(modelName('opus')).toBe('Opus')
  expect(modelName('opus[1m]')).toBe('Opus')
  expect(modelName('Opus 4.7 (1M context)')).toBe('Opus 4.7')
  expect(modelName('claude-opus-5-5[1m]')).toBe('Opus 5.5')
})

test('budget, limits and cost', async () => {
  expect(parseBudget('250k')).toBe(250_000)
  expect(parseBudget(undefined)).toBe(275_000)
  expect(limitLabel('five_hour')).toBe('5h')
  expect(limitLabel('seven_day')).toBe('7d')
  expect(usd(4.123)).toBe('$4.12')
  expect(usd(212.6)).toBe('$213')
})
