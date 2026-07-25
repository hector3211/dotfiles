---
description: Work the next ready GitHub issue through PR and user review
---

Work the next autonomous GitHub Issue in the current repository from queue selection through PR creation and user review.

First resolve workflow context in this order:

1. Read `AGENTS.md` if present.
2. Read `docs/github-issue-workflow.md` if present.
3. Read `~/.config/opencode/docs/github-issue-workflow-standard.md`.
4. Use the workflow below only as fallback if the files above are missing.

Default workflow:

- GitHub Issues are the work queue.
- Work only issues with `state:ready` and `agent:ready`.
- Skip `agent:pair` and `agent:needs-context` unless the user explicitly requested those.
- Priority order is `priority:p0`, `priority:p1`, `priority:p2`, `priority:p3`, then oldest ready issue.
- Create one branch per issue using `issue-<number>-<short-title>`.
- Move labels through `state:claimed`, `state:in-progress`, `state:agent-review`, and `state:user-review` as work progresses.
- Run local verification appropriate to the repo. For Node projects, prefer `npm run lint`, `npm run test`, and `npm run build` when present.
- Run both review gates before opening the PR: `code-reviewer` and `security-engineer`.
- Fix review findings, rerun verification, and rerun relevant reviews until both pass, the issue is blocked, or the user stops the work.
- Open a PR titled `Issue #<number>: <short title>` with Summary, Issue, Verification, Agent Reviews, and Notes For User Review sections.
- Reference `Closes #<number>` in the PR body.
- Request the user reviewer if the project workflow specifies one.
- Do not move issues to `state:done`; only the user does that unless explicitly delegated.

Operational rules:

- Use `gh` for GitHub issue and PR actions.
- Before committing, inspect `git status`, `git diff`, and `git log --oneline -10`.
- Stage only intended files.
- Never read, grep, print, summarize, or inspect `.env` files or `.env.*` files unless the user explicitly asks for that exact file.
- Never commit secrets or write secrets into issues, PRs, docs, or source files.
- If product decisions, credentials, unavailable services, or scope expansion are needed, move the issue to `state:blocked` and ask for input.
- If the current branch has unrelated user work, do not overwrite or revert it. Ask only if it directly conflicts with the issue work.

Proceed autonomously through implementation, verification, review gates, and PR creation unless blocked by the rules above.
