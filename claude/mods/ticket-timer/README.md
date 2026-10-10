# ticket-timer

Time ConnectWise tickets from inside Claude Code. Start a clock, pause it for breaks, and stop it to get billable hours and a time-entry note ready to paste.

## Commands

| Command | What it does |
| --- | --- |
| `/ticket 12345` | Starts the clock for ticket #12345. A leading `#` is fine. |
| `/ticket` | Shows the running ticket and its time. |
| `/ticket pause` | Stops the clock without ending the ticket. |
| `/ticket resume` | Restarts the clock. |
| `/ticket stop` | Ends the ticket. Prints time worked, billable hours and a time-entry note. |

While a ticket runs, the status line shows `#12345 · 0:42`, or `#12345 · 0:42 (paused)`. It updates every 15 seconds.

## Billing

Billable hours round up to the next quarter hour, with a 0.25 hr minimum.

| Worked | Billable |
| --- | --- |
| 0:01 – 0:15 | 0.25 |
| 0:16 – 0:30 | 0.50 |
| 0:42 | 0.75 |
| 1:00 | 1.00 |

Paused time is not counted.

## The time-entry note

On `/ticket stop`, Claude writes a short note for the client record: 2 to 6 past-tense bullets covering what was done and the outcome, plus a `Next:` line if anything is still open.

The note covers only the prompts sent while the clock was running. Slash commands are not counted. Up to the last 30 prompts are kept, each cut to 200 characters. The note is told never to include passwords, keys or tokens. Read it before pasting.

If the note can't be written (an API error, for example), you get the hours and the list of prompts worked instead.

Writing the note sends one request over the current conversation. It counts toward session usage like any other message.

## Behavior to know

- **One ticket at a time.** Starting a second one while another runs is refused. Stop the first.
- **Survives restarts.** The ticket is saved across sessions. A ticket left running keeps counting while Claude Code is closed. Pause before you walk away.
- **Shared across sessions.** Every Claude Code session on this machine sees the same running ticket.

## Install

This folder is loaded through `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`:

```json
"env": {
  "CLAUDE_CODE_PLUGIN_DIRS": "~/claude-mods/cache-meter:~/claude-mods/ticket-timer"
}
```

Folders are separated by `:` on Linux/macOS and `;` on Windows. The dotfiles linker configures the platform's separator automatically:

```sh
node scripts/link-claude.mjs
```

It preserves existing local mods and unrelated Claude settings. New sessions pick it up. To try it once without the setting:

```sh
claude --plugin-dir ~/claude-mods/ticket-timer
```

## Development

```sh
claude plugin validate ~/claude-mods/ticket-timer
claude plugin test ~/claude-mods/ticket-timer
```

| Path | Contents |
| --- | --- |
| `hooks/register.ts` | Command, status line, prompt capture and note writer |
| `tests/ticket-timer.test.ts` | Timing, billing and ticket-number parsing |
| `.claude-plugin/plugin.json` | Manifest |
