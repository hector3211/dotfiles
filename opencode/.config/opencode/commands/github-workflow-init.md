---
description: Install the standard GitHub issue workflow in the current repo
---

Set up the standard GitHub Issue workflow in the current repository.

Use this global baseline as the source of truth:

```text
~/.config/opencode/docs/github-issue-workflow-standard.md
```

Tasks:

1. Read the global baseline document.
2. Inspect the current repo without reading `.env` or `.env.*` files.
3. Create or update `docs/github-issue-workflow.md` from the global baseline.
4. Create or update `.github/ISSUE_TEMPLATE/agent-task.md` from the Standard Issue Template section in the global baseline.
5. Create or update only the GitHub workflow section of `AGENTS.md`, preserving unrelated guidance. The section must point agents to `docs/github-issue-workflow.md` as the source of truth.
6. Detect likely verification commands from project tooling files such as `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, or existing docs. Do not invent commands. Add project-specific verification notes only when they are supported by the repo.
7. If GitHub CLI is available and the repo has a remote, inspect existing labels. Show the planned `state:*`, `agent:*`, `type:*`, `priority:*`, and baseline `area:*` label changes before creating or editing labels. Do not delete labels unless the user explicitly asks.

Rules:

- Never read, grep, print, summarize, or inspect `.env` files or `.env.*` files unless the user explicitly asks for that exact file.
- Never write secrets, tokens, credentials, or API keys into workflow files.
- Preserve existing project-specific content whenever possible.
- Keep changes minimal and focused on workflow setup.
- After writing files, summarize what changed and tell the user to restart opencode if they want newly created opencode config files loaded.
