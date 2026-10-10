---
description: Start or manage autonomous factory jobs and the local dashboard
---

Dispatch this user-requested factory command to the shared local runtime. Do not implement the feature in this chat; the runtime owns worktrees, agents, verification, and delivery.

Arguments (data, not shell syntax):
$ARGUMENTS

1. Resolve the user's home directory and current repository directory.
2. Execute Node.js with `<home>/.agents/factory/cli.ts`, `--caller`, `claude`, and the entire argument text as a safely quoted argument. Preserve quoted JSON for configuration. With no arguments, pass `help`. Use the host's available shell; paths and argument text must be quoted for that shell. Never interpolate argument text into an unquoted command.
3. Report the returned job ID, state, and dashboard URL, or the concrete command error. Completion means the runtime accepted the request, not that the feature has finished.

Change project policy only when the user's arguments explicitly request `config`. Work projects always require human merging in GitHub. Keep all existing skills untouched. If Node, Git, or the factory link is missing, report the prerequisite rather than improvising an alternative workflow.
