import { expect, test } from 'claude-code/testing'

import { bar, barSvg, contextColor, countdown, fmt, limitLabel, mode, modelName, parseBudget, usd } from '../hooks/register'

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

test('desktop bar is a rounded svg track', async () => {
  const svg = barSvg(0.5, '#a6e3a1', 100, 6)
  expect(svg).toContain('width="50"')
  expect(svg).toContain('fill="#a6e3a1"')
  expect(barSvg(0, '#a6e3a1')).not.toContain('#a6e3a1')
})

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 9 }, view: {} },
} as const

test('desktop band draws pills and no powerline glyphs', async $ => {
  const ui = await $.ui.mount({ plugin: 'cache-meter', surface: 'desktop', ...BAND } as never)
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /|/ })).toBeUndefined()
  await ui.unmount()
  const term = await $.ui.mount({ plugin: 'cache-meter', surface: 'terminal', ...BAND } as never)
  expect(await term.find({ type: 'Text', text: // })).toBeDefined()
  await term.unmount()
})
