export type Totals = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export type Context = { tokens: number; window: number; percent: number }

export type Limit = { kind: string; percentUsed: number }

declare module 'claude-code' {
  interface PluginState {
    'cache-meter': {
      totals: Totals
      lastRequestAt: number | null
      now: number
      context: Context | null
      isHidden: boolean
      model: string | null
      effort: string | null
      limits: Limit[]
      costUsd: number | null
      hasNudged: boolean
    }
  }
}
