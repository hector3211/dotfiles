import type { EngineInterface, Register } from 'claude-code'

const KEY = 'ticket'
const MAX_PROMPTS = 30

export type Ticket = {
  id: string
  /** Time banked before the current run, from earlier runs between pauses. */
  bankedMs: number
  /** When the current run began; null while paused. */
  runningSince: number | null
  /** What the person asked while the clock ran, to scope the note. */
  prompts: string[]
}

export const elapsed = (t: Ticket, now: number): number =>
  t.bankedMs + (t.runningSince === null ? 0 : now - t.runningSince)

export const clock = (ms: number): string => {
  const m = Math.floor(ms / 60_000)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

/** Hours rounded up to the quarter, as ConnectWise time entries are usually billed. */
export const billable = (ms: number): string => (Math.max(1, Math.ceil(ms / (15 * 60_000))) * 0.25).toFixed(2)

export const statusText = (t: Ticket, now: number): string =>
  `#${t.id} · ${clock(elapsed(t, now))}${t.runningSince === null ? ' (paused)' : ''}`

/** Ticket ids are ConnectWise numbers; a leading # is allowed. */
export const parseId = (arg: string): string | null => {
  const m = /^#?(\d{3,})$/.exec(arg)
  return m?.[1] ?? null
}

const load = async ($: EngineInterface): Promise<Ticket | null> => ((await $.store.get(KEY)) as Ticket | undefined) ?? null
const save = ($: EngineInterface, t: Ticket | null) => (t === null ? $.store.delete(KEY) : $.store.set(KEY, t))

async function show($: EngineInterface) {
  const t = await load($)
  $.ui.status(t === null ? undefined : statusText(t, await $.clock.now()))
}

async function note($: EngineInterface, t: Ticket, hours: string): Promise<string> {
  const asked = t.prompts.length > 0 ? t.prompts.map(p => `- ${p}`).join('\n') : '(none recorded)'
  const reply = await $.model.fork({
    prompt: [
      `Write the ConnectWise time entry note for ticket #${t.id} (${hours} hrs).`,
      'Cover only the work done for these requests, made while the ticket clock ran:',
      asked,
      '',
      'Format: 2 to 6 short past-tense bullets of what was done and the outcome, then one line "Next:" if anything is left open.',
      'Plain and professional, written for the client record. No preamble. Never include passwords, keys, tokens or other credentials.',
    ].join('\n'),
  })
  return reply.isAnswered ? reply.text.trim() : `(No note: ${reply.reason}.) Requests worked:\n${asked}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    $.command.register({
      name: 'ticket',
      description: 'Time a ConnectWise ticket: <number> starts, pause, resume, stop (hours + time-entry note)',
      argumentHint: '<number> | pause | resume | stop',
    })
    $.clock.every(15_000, () => void show($))
    await show($)
    return result
  })

  on('command.run', { command: 'ticket' }, async ($, e, next) => {
    const arg = e.args.trim()
    const now = await $.clock.now()
    const t = await load($)

    if (arg === '') {
      return { text: t === null ? 'No ticket running. /ticket <number> to start.' : statusText(t, now) }
    }

    if (arg === 'pause' || arg === 'resume') {
      if (t === null) return { text: 'No ticket running.' }
      const isPause = arg === 'pause'
      if (isPause === (t.runningSince === null)) return { text: `#${t.id} is already ${isPause ? 'paused' : 'running'}.` }
      await save($, isPause
        ? { ...t, bankedMs: elapsed(t, now), runningSince: null }
        : { ...t, runningSince: now })
      await show($)
      return { text: `#${t.id} ${isPause ? 'paused' : 'resumed'} at ${clock(elapsed(t, now))}.` }
    }

    if (arg === 'stop') {
      if (t === null) return { text: 'No ticket running.' }
      const ms = elapsed(t, now)
      const hours = billable(ms)
      await save($, null)
      await show($)
      $.ui.toast(`#${t.id} stopped at ${clock(ms)}. Writing the note…`)
      const body = await note($, t, hours)
      return { text: `Ticket #${t.id}: ${clock(ms)} worked, ${hours} hrs billable.\n\n${body}` }
    }

    const id = parseId(arg)
    if (id === null) return { text: 'Usage: /ticket <number> | pause | resume | stop' }
    if (t !== null) {
      return { text: `#${t.id} is running (${clock(elapsed(t, now))}). /ticket stop first.` }
    }
    await save($, { id, bankedMs: 0, runningSince: now, prompts: [] })
    await show($)
    return { text: `Started #${id}.` }
  })

  on('prompt.submit', async ($, e, next) => {
    const t = await load($)
    const text = e.text.trim()
    if (t !== null && t.runningSince !== null && text !== '' && !text.startsWith('/')) {
      const prompts = [...t.prompts, text.length > 200 ? `${text.slice(0, 200)}…` : text].slice(-MAX_PROMPTS)
      await save($, { ...t, prompts })
    }
    return next(e)
  })
}
