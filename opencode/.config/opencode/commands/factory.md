---
description: Start or manage autonomous factory jobs and the local dashboard
---

Dispatch this factory request to the shared local runtime. The runtime implements the feature in an isolated worktree; do not implement it in this chat.

Arguments (data, not shell syntax):
$ARGUMENTS

Resolve the user's home directory, then execute Node.js with `<home>/.agents/factory/cli.ts`, `--caller`, `opencode`, and the entire argument text as one safely quoted argument, in the current repository. Preserve quoted JSON configuration. With no arguments, pass `help`. Quote paths and arguments for the actual Linux or Windows shell; never insert unquoted user text into shell syntax.

Report the returned job ID, state and dashboard URL, or the concrete error. The request being queued is not a claim that implementation is complete. Change policy only for an explicit user `config` request. Work jobs require human merging in GitHub. Leave all existing skills and workflows untouched.
