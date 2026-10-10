---
name: factory
description: Start or manage autonomous feature jobs, worktrees, reviews, and the local factory dashboard.
disable-model-invocation: true
---

# Factory

Dispatch the user's request to the installed shared factory. The runtime owns execution; your current T3/provider thread is the entry point, not the implementation worker.

## Dispatch

1. Read the user's text following the `factory` skill mention. Remove only the leading invocation (`$factory` or `/factory`); preserve feature descriptions, quoted JSON and command arguments as data. With no arguments, use `help`.
2. Resolve the user's home and current project checkout. Execute Node.js with `<home>/.agents/factory/cli.ts`, `--caller`, `t3`, `--worker`, the underlying provider (`codex`, `claude`, or `opencode`), and the complete command text as one safely quoted argument. Choose the provider running this thread; if unavailable, omit `--worker` to use the factory's default Codex worker. Existing project runtime policy takes precedence. Use the machine's actual shell; never concatenate unquoted user text into shell syntax.
3. Report the accepted job ID/state and dashboard URL, or the concrete error. The job being queued is not a claim that implementation finished. Stop dispatching once the runtime accepts the request; it continues without this chat remaining open.

Run in the main checkout, not a T3-managed temporary worktree: T3's **Local** thread mode avoids nested feature isolation. If the current checkout is a T3 worktree, locate the original checkout using `git worktree list --porcelain` and the matching repository's primary checkout; do not guess another repository or switch branches.

## Commands

- `factory <feature>` — new autonomous feature job
- `factory issue #123` — GitHub issue intake
- `factory status`, `dashboard`, `inspect <id>`
- `factory pause <id>`, `resume <id>`, `cancel <id>`
- `factory answer <id> <response>`
- `factory config` — view policy; change it only on explicit user request

Work mode ends at a human-merge-ready PR. Personal mode may merge under explicit project policy. Preserve all existing skills. Report missing prerequisites rather than inventing `t3 run` or pretending T3 is a headless worker executable.
