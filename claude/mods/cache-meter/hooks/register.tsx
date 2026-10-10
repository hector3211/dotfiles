import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Context, Limit, Totals } from '../types'

const ZERO: Totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
const BAR = 12

const totals = atom({ plugin: 'cache-meter', key: 'totals' } as const, ZERO)
const lastRequestAt = atom({ plugin: 'cache-meter', key: 'lastRequestAt' } as const, null)
const now = atom({ plugin: 'cache-meter', key: 'now' } as const, 0)
const context = atom({ plugin: 'cache-meter', key: 'context' } as const, null)
const isHidden = atom({ plugin: 'cache-meter', key: 'isHidden' } as const, false)
const model = atom({ plugin: 'cache-meter', key: 'model' } as const, null)
const effort = atom({ plugin: 'cache-meter', key: 'effort' } as const, null)
const limits = atom({ plugin: 'cache-meter', key: 'limits' } as const, [] as Limit[])
const costUsd = atom({ plugin: 'cache-meter', key: 'costUsd' } as const, null)
const hasNudged = atom({ plugin: 'cache-meter', key: 'hasNudged' } as const, false)

export const fmt = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n / 1_000)}k` : `${n}`

export const countdown = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(s / 60)
  return m >= 60
    ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
    : `${m}:${String(s % 60).padStart(2, '0')}`
}

/** `claude-opus-5-5` -> `Opus 5.5`; `opus[1m]` -> `Opus`; context suffixes dropped (the ctx block shows the window). */
export const modelName = (id: string): string => {
  const bare = id.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*context[^)]*\)/gi, '').trim()
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/i.exec(bare)
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  if (!m) return bare ? cap(bare) : id
  const [, fam = '', major, minor] = m
  return minor && minor.length <= 2 ? `${cap(fam)} ${major}.${minor}` : `${cap(fam)} ${major}`
}

/** Filled and empty runs of a thin line bar for a 0..1 fraction. */
export const bar = (fraction: number, width = BAR): [string, string] => {
  const filled = Math.round(Math.min(1, Math.max(0, fraction)) * width)
  return ['━'.repeat(filled), '━'.repeat(width - filled)]
}

// Catppuccin Mocha, the palette lualine themes usually lean on.
const C = { model: '#7aa2f7', green: '#a6e3a1', yellow: '#f9e2af', red: '#f38ba8', blue: '#89b4fa', surface: '#313244', text: '#cdd6f4', dim: '#7f849c', base: '#1e1e2e' }

const SEP_R = '\ue0b0'
const SEP_L = '\ue0b2'

export type Mode = { label: string; color: string }

/** The leftmost block, lualine's "mode": the cache state. */
export const mode = (left: number, ttlMs: number, hasRequests: boolean): Mode =>
  !hasRequests ? { label: 'IDLE', color: C.blue }
    : left <= 0 ? { label: 'COLD', color: C.red }
    : left / ttlMs < 0.2 ? { label: 'COOL', color: C.yellow }
    : { label: 'WARM', color: C.green }

/** `250k` -> 250000. */
export const parseBudget = (v: unknown): number => {
  const m = /^(\d+)k$/.exec(String(v ?? ''))
  return m ? Number(m[1]) * 1_000 : 275_000
}

/** `five_hour` -> `5h`, `seven_day` -> `7d`, anything else keeps its name. */
export const limitLabel = (kind: string): string =>
  kind === 'five_hour' ? '5h' : kind === 'seven_day' ? '7d' : kind === 'spend_limit' ? 'spend' : kind

export const limitColor = (pct: number): string => (pct >= 80 ? C.red : pct >= 50 ? C.yellow : C.dim)

export const usd = (n: number): string => (n >= 100 ? `$${Math.round(n)}` : `$${n.toFixed(2)}`)

/** `290k` -> 290000; `off` (or anything unreadable) -> null. */
export const parseCompactAt = (v: unknown): number | null => {
  const m = /^(\d+)k$/.exec(String(v ?? '290k'))
  return m ? Number(m[1]) * 1_000 : null
}

export const contextColor = (pct: number): string => (pct >= 85 ? C.red : pct >= 60 ? C.yellow : C.green)

/** A rounded progress track for the desktop, where box-drawing runs render unevenly. */
export const barSvg = (fraction: number, color: string, width = 96, height = 6): string => {
  const f = Math.min(1, Math.max(0, fraction))
  const r = height / 2
  const fill = f > 0 ? `<rect width="${Math.max(height, Math.round(f * width))}" height="${height}" rx="${r}" fill="${color}"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `<rect width="${width}" height="${height}" rx="${r}" fill="${C.surface}"/>${fill}</svg>`
}

async function refresh($: EngineInterface, budget: number) {
  const usage = await $.session.usage()
  const t = await $.clock.now()
  const ctx: Context | null = usage.context.tokens === undefined
    ? null
    : { tokens: usage.context.tokens, window: usage.context.window, percent: usage.context.percent ?? 0 }
  await update($, context, () => ctx)
  await update($, limits, () => usage.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed })))
  await update($, costUsd, () => usage.cost?.usd ?? null)
  const id = await $.session.model()
  await update($, model, () => modelName(id))
  await update($, now, () => t)

  // One nudge per crossing; a /compact that drops below the budget re-arms it.
  const isOver = ctx !== null && ctx.tokens >= Math.min(budget, ctx.window)
  let notify = false
  await update($, hasNudged, nudged => {
    notify = isOver && !nudged
    // An unavailable reading is not evidence that compaction lowered context.
    return ctx === null ? nudged : isOver
  })
  if (notify && ctx) {
    $.ui.toast(`Context at ${fmt(ctx.tokens)}, past ${fmt(budget)}. Run /compact.`)
  }
}

type RefreshState = { pending: Promise<void> }

function refreshUsage($: EngineInterface, budget: number, state: RefreshState) {
  state.pending = state.pending.catch(() => {}).then(() => refresh($, budget))
  return state.pending
}

type CompactState = { armed: boolean; running: boolean; announced: boolean }

async function autoCompact($: EngineInterface, at: number | null, state: CompactState) {
  if (at === null || state.running) return
  state.running = true
  try {
    const tokens = (await read($, context))?.tokens
    if (tokens === undefined) return
    if (tokens < at) {
      state.announced = false
      return
    }
    if (!state.armed) return
    state.armed = false
    if (!state.announced) {
      state.announced = true
      $.ui.toast(`Context at ${fmt(tokens)}, past ${fmt(at)}. Compacting…`)
    }
    try {
      const result = await $.session.compact()
      if ('skip' in result && result.skip) $.ui.toast(`Auto-compact skipped: ${result.skip}`)
    } catch {
      // Retry when idle, without repeating the announcement.
      state.armed = true
    }
  } finally {
    state.running = false
  }
}

export const register: Register = (on, options) => {
  const ttlMs = options.cacheTtl === '5m' ? 5 * 60_000 : 60 * 60_000
  const budget = parseBudget(options.contextBudget)
  const compactAt = parseCompactAt(options.autoCompactAt)
  const compactState: CompactState = { armed: false, running: false, announced: false }
  // Timer and turn completion can refresh concurrently; serialize state updates.
  const refreshState: RefreshState = { pending: Promise.resolve() }

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    // Earlier versions wrote a status line; clear what they left behind.
    $.ui.status(undefined)
    $.clock.every(1000, () => void refreshUsage($, budget, refreshState).then(() => autoCompact($, compactAt, compactState)).catch(() => {}))
    $.command.register({ name: 'cache-meter', description: 'Toggle the cache line' })
    await refreshUsage($, budget, refreshState)
    return result
  })

  on('command.run', { command: 'cache-meter' }, async ($, e, next) => {
    const hidden = await update($, isHidden, h => !h)
    return { text: hidden ? 'Cache line hidden.' : 'Cache line shown.' }
  })

  // Effort is only known once the main loop sends a request.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      const level = e.effort === undefined ? null : String(e.effort)
      await update($, effort, () => level)
    }
    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const u = result.usage ?? e.usage
    if (u) {
      await update($, totals, t => ({
        input: t.input + u.input_tokens,
        output: t.output + u.output_tokens,
        cacheRead: t.cacheRead + u.cache_read_input_tokens,
        cacheWrite: t.cacheWrite + u.cache_creation_input_tokens,
      }))
      // Only the main loop's requests keep the main cache warm.
      if (e.agentId === undefined) {
        compactState.armed = true
        const t = await $.clock.now()
        await update($, lastRequestAt, () => t)
      }
    }
    await refreshUsage($, budget, refreshState)
    return result
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      compactState.armed = false
      compactState.announced = false
      await update($, hasNudged, () => false)
      await update($, totals, () => ZERO)
      await update($, lastRequestAt, () => null)
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const cols = e.props.bodyColumns
    const tot = await read($, totals)
    const last = await read($, lastRequestAt)
    const t = await read($, now)
    const ctx = await read($, context)
    const mdl = await read($, model)
    const eff = await read($, effort)

    const left = last === null ? 0 : Math.max(0, last + ttlMs - t)
    const m = mode(left, ttlMs, last !== null)
    const timer = last === null ? '--:--' : countdown(left)
    const lim = await read($, limits)
    const cost = await read($, costUsd)
    const fed = tot.input + tot.cacheRead + tot.cacheWrite
    const hit = fed > 0 ? Math.round((tot.cacheRead / fed) * 100) : 0
    const all = tot.input + tot.output + tot.cacheRead + tot.cacheWrite

    // Context is measured against the working budget, not the model's full window.
    const limit = ctx ? Math.min(budget, ctx.window) : budget
    const pct = ctx ? Math.round((ctx.tokens / limit) * 100) : 0
    const ctxColor = contextColor(pct)
    const modelText = ` ${mdl ?? '…'}${eff ? ` · ${eff}` : ''} `
    const ctxText = ` ${ctx ? `${fmt(ctx.tokens)}/${fmt(limit)} ` : ''}${pct}% `
    const totalText = ` ${fmt(all)}${cost !== null ? ` · ${usd(cost)}` : ''} `
    const hitText = `${hit}% hit `
    const limitParts = lim.map(l => ({ text: `${limitLabel(l.kind)} ${Math.round(l.percentUsed)}% `, color: limitColor(l.percentUsed) }))
    const limitsWidth = limitParts.reduce((n, p) => n + p.text.length, 0)

    // The desktop draws a proportional font with no Nerd Font glyphs:
    // padded pills and an SVG bar instead of powerline separators.
    if (e.surface === 'desktop') {
      const { Svg } = $.ui.resolve(e)
      const pill = (bg: string, fg: string, text: string, bold = false) => (
        <Box backgroundColor={bg} paddingX={1} flexShrink={0}>
          <Text wrap="truncate" color={fg} bold={bold}>{text}</Text>
        </Box>
      )
      return (
        <Box width={cols} height={1} justifyContent="space-between" alignItems="center" overflow="hidden">
          <Box gap={1} alignItems="center" flexShrink={0}>
            {pill(m.color, C.base, m.label, true)}
            {pill(C.surface, C.text, timer)}
            {pill(C.model, C.base, modelText.trim(), true)}
            <Svg source={barSvg(pct / 100, ctxColor)} alt={`Context ${pct}% of budget`} width={96} height={6} />
          </Box>
          <Box gap={1} alignItems="center" flexShrink={0}>
            <Text wrap="truncate" color={C.dim}>{hitText.trim()}</Text>
            {limitParts.map(p => <Text wrap="truncate" color={p.color}>{p.text.trim()}</Text>)}
            {pill(C.surface, C.text, totalText.trim())}
            {pill(ctxColor, C.base, ctxText.trim(), true)}
          </Box>
        </Box>
      )
    }

    // Measure every block so nothing is squeezed: optional pieces drop out
    // least useful first, and the context bar takes whatever room is left.
    const core = ` ${m.label} `.length + 1 + ` ${timer} `.length + 1 + modelText.length + 1 + 1 + ctxText.length + 1
    let showHit = true
    let showTotal = true
    let showLimits = limitParts.length > 0
    const room = () =>
      cols - core - 2
      - (showHit ? hitText.length : 0)
      - (showLimits ? limitsWidth : 0)
      - (showTotal ? totalText.length + 1 : 0)
    if (room() < 4) showHit = false
    if (room() < 4) showTotal = false
    if (room() < 4) showLimits = false
    const barWidth = Math.max(0, Math.min(BAR, room()))
    const [filled, empty] = bar(pct / 100, barWidth)

    return (
      <Box width={cols} height={1} justifyContent="space-between" overflow="hidden">
        <Box flexShrink={0}>
          <Text wrap="truncate" backgroundColor={m.color} color={C.base} bold> {m.label} </Text>
          <Text wrap="truncate" color={m.color} backgroundColor={C.surface}>{SEP_R}</Text>
          <Text wrap="truncate" backgroundColor={C.surface} color={C.text}> {timer} </Text>
          <Text wrap="truncate" color={C.surface} backgroundColor={C.model}>{SEP_R}</Text>
          <Text wrap="truncate" backgroundColor={C.model} color={C.base} bold>{modelText}</Text>
          <Text wrap="truncate" color={C.model}>{SEP_R}</Text>
          {barWidth > 0 && <Text wrap="truncate"> </Text>}
          {barWidth > 0 && <Text wrap="truncate" color={ctxColor}>{filled}</Text>}
          {barWidth > 0 && <Text wrap="truncate" color={C.surface}>{empty}</Text>}
        </Box>
        <Box flexShrink={0}>
          {showHit && <Text wrap="truncate" color={C.dim}>{hitText}</Text>}
          {showLimits && limitParts.map(p => <Text wrap="truncate" color={p.color}>{p.text}</Text>)}
          {showTotal && <Text wrap="truncate" color={C.surface}>{SEP_L}</Text>}
          {showTotal && <Text wrap="truncate" backgroundColor={C.surface} color={C.text}>{totalText}</Text>}
          <Text wrap="truncate" color={ctxColor} backgroundColor={showTotal ? C.surface : undefined}>{SEP_L}</Text>
          <Text wrap="truncate" backgroundColor={ctxColor} color={C.base} bold>{ctxText}</Text>
        </Box>
      </Box>
    )
  })
}
