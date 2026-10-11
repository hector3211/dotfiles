---
description: Work on a feature in this Claude session and report progress to the local Factory dashboard
---

Use the current Claude agent as the Factory worker. Read and follow the complete skill at `~/.agents/factory/skill/SKILL.md` before acting. The skill defines workspace selection, observation-helper requests, reports, checkpoints, verification, and delivery rules. The helper observes only; it does not launch workers or resume work.

User input (request prose unless it is an explicit dashboard/status/inspect/pause/resume/cancel/answer management command; never parse feature prose as CLI syntax):

```text
$ARGUMENTS
```

Use the current working directory as context and include its absolute path with the request. If input is empty or exactly `new`, ask briefly what work the user wants done, then follow the skill with that answer. `new <text>` is the same as a feature request with the `new` prefix removed; it does not imply creating a project or repository. Continue the actual implementation, independent review, checks, and user-authorized delivery in this session.
