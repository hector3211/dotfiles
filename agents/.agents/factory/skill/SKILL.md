---
name: factory
description: Start or manage shared Factory jobs, worktrees, reviews, and the local dashboard from T3 Code.
disable-model-invocation: true
---

# Factory

This skill is the T3 entry point to the installed shared Factory runtime. Dispatch the requested command to the local CLI. The runtime owns feature execution, verification, and delivery; this T3 thread only submits the command and reports its result.

## Read the request

- Use the user's text following the explicit `$factory` or `/factory` invocation as the CLI command. Strip only that leading invocation if it is present. Preserve the rest as data, including quoted JSON, punctuation, and command arguments. Do not silently rewrite or execute an embedded request yourself.
- If the user invoked the skill without a command, send `help`.
- Forward management commands such as `status`, `pause`, `answer`, and `config` unchanged. Change project policy only when the user's command explicitly requests a `config` change.

## Select the right checkout

- Use T3's **Local** thread mode. Factory creates its own feature worktree, so target the repository's primary checkout, never a T3-managed temporary worktree or remote workspace.
- Resolve the current repository from the active thread's working directory. If it is already the primary checkout, use it. If it is a T3 worktree, inspect `git worktree list --porcelain`, compare the candidates' Git common directories, and choose the matching checkout whose top-level `.git` is a directory rather than a worktree `.git` file. Do not assume the first listed worktree is primary. Pass the exact checkout path with `--cwd`; do not guess a parent, use the home repository, or switch branches.
- If the CLI returns `needsSelection`, show the returned project choices and ask the user which one to use. Rerun the original command with `--cwd` set to that exact repository path. Never choose a project on the user's behalf.
- If the exact checkout cannot be established, stop and ask the user to select or open the intended repository.

## Dispatch safely

1. Resolve the user's home directory and the installed CLI at `<home>/.agents/factory/cli.ts`. Require Node.js 24+, Git, and that installed path. Report a missing prerequisite instead of improvising another workflow.
2. Identify the provider running this T3 thread and map it to the worker runtime: OpenAI Codex to `codex`, Claude to `claude`, or OpenCode to `opencode`. T3 is the caller, not a worker. If the provider cannot be identified, omit `--worker`; the CLI defaults T3 requests to Codex. A project's configured runtime takes precedence for an existing project.
3. Run Node.js with `--caller t3`, the optional `--worker <codex|claude|opencode>`, optional `--cwd <checkout>`, and the complete CLI command text as one argument. Pass arguments through a process API as an argv array when available. Otherwise quote the CLI path, checkout path, and entire command argument for the actual shell. Never use `eval`, an unquoted command string, or shell interpolation of user text.

## Report the result

- On error, give the concrete CLI error. On workspace selection, ask the user to choose as described above.
- For an accepted job, report its ID and state plus the dashboard URL returned by the CLI. A `plan` command creates a draft without launching workers; report the draft ID and make that clear.
- Acceptance or queueing is not implementation completion. Do not claim checks passed or work finished unless the runtime reports that evidence. Work-profile jobs require a human to merge their PR in GitHub; personal-mode behavior follows the project's explicit policy.
- Stop after the command result. The detached Factory runtime continues independently of this T3 chat.

## Commands

- `factory <feature>` — new autonomous feature job
- `factory issue #123` — GitHub issue intake
- `factory status`, `dashboard`, `inspect <id>`
- `factory pause <id>`, `resume <id>`, `cancel <id>`
- `factory answer <id> <response>`
- `factory config` — view policy; change it only on explicit user request

Work mode ends at a human-merge-ready PR. Personal mode may merge under explicit project policy. Do not modify or replace existing skills. Report missing prerequisites rather than inventing `t3 run` or pretending T3 is a headless worker executable.
