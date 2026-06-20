# Standard GitHub Issue Workflow

This workflow uses GitHub Issues as the agent work queue. Labels are the source of truth for issue state, routing, priority, and area. Agent-worked issues use one branch per issue and one pull request for final user review.

## Agent Operating Policy

When asked to work the next issue, agents must query open issues labeled `state:ready` and `agent:ready`, skip issues labeled `agent:pair` unless pair work was requested, and choose the highest-priority issue.

Priority order is `priority:p0`, `priority:p1`, `priority:p2`, `priority:p3`, then oldest ready issue.

Agents may work autonomously only when an issue has `state:ready` and `agent:ready`, and does not have `agent:pair` or `agent:needs-context`.

Issues labeled `agent:pair` are collaborative work. Agents should inspect the issue, propose or confirm the next step, and avoid completing the whole issue end-to-end without checkpoints with the user.

After selecting an autonomous issue, agents should create an issue branch, implement and verify the change, pass both required agent review gates, open a pull request, and request user review on the PR.

Recommended labels for an issue agents can work autonomously:

- `state:ready`
- `agent:ready`
- `agent:review-required`
- one `priority:*` label
- one `type:*` label
- optional `area:*` labels

## State Labels

Each issue should have exactly one `state:*` label.

- `state:backlog` - captured, not ready yet.
- `state:ready` - ready to work.
- `state:claimed` - selected for work.
- `state:in-progress` - active implementation.
- `state:blocked` - waiting on input or dependency.
- `state:agent-review` - implementation complete, waiting for code-reviewer and security-engineer review.
- `state:user-review` - both agent reviews passed, PR is open, and user review was requested.
- `state:done` - user approved or explicitly marked complete.

Default state flow:

```text
state:backlog -> state:ready -> state:claimed -> state:in-progress -> state:agent-review -> state:user-review -> state:done
```

Blocked flow:

```text
state:claimed/state:in-progress/state:agent-review -> state:blocked -> state:ready or state:in-progress
```

## Routing Labels

- `agent:ready` - agents may pick this issue from the automated queue.
- `agent:pair` - user wants to work alongside the agent.
- `agent:review-required` - code-reviewer and security-engineer reviews are required before user review.
- `agent:needs-context` - the issue needs clarification before implementation.
- `agent:small` - isolated task suitable for quick agent work.
- `agent:large` - needs decomposition or planning before implementation.

## Type Labels

- `type:bug`
- `type:feature`
- `type:refactor`
- `type:test`
- `type:docs`
- `type:chore`

## Priority Labels

- `priority:p0` - urgent or blocking.
- `priority:p1` - high priority.
- `priority:p2` - normal priority.
- `priority:p3` - low priority.

## Area Labels

Use project-specific `area:*` labels for routing and review context. Common defaults:

- `area:auth`
- `area:onboarding`
- `area:billing`
- `area:dashboard`
- `area:inventory`
- `area:invoices`
- `area:jobs`
- `area:db`
- `area:ui`
- `area:api`
- `area:tests`

## Required Review Gates

Implementation work should move to `state:agent-review` after code changes and verification are complete. Two review gates are required before opening the PR for user review:

- Senior coding-agent review with `code-reviewer`.
- Security-focused review with `security-engineer`.

If either reviewer requests changes, the implementing agent should fix the findings, rerun verification, and request re-review. The fix, verify, and re-review loop continues until both reviews pass, the issue is blocked, or the user explicitly stops the work.

Rerun both reviews after broad, risky, auth-related, data-related, permission-related, or security-related changes. For narrow fixes, rerun at least the reviewer whose finding was addressed and rerun the other reviewer when there is plausible cross-impact.

Document each review round on the issue or PR:

```md
## Agent Review Round N
Status: passed / changes requested / blocked

Senior Coding-Agent Review:
- Status: passed / changes requested
- Findings: ...

Security-Focused Review:
- Status: passed / changes requested
- Findings: ...

Actions Taken:
- ...

Verification:
- npm run lint
- npm run test
- npm run build
```

If findings require product decisions, credentials, unavailable services, or scope expansion, move the issue to `state:blocked` and ask for input.

Only the user should move an issue to `state:done`, unless the user explicitly delegates that final transition. For PRs using `Closes #<issue>`, GitHub may close the issue automatically after merge.

## Branch And PR Policy

Create one branch per agent-worked issue by default. Do not work directly on `main` or an unrelated user branch unless explicitly instructed.

Use branch names like `issue-42-fix-auth-redirect` or `issue-58-inventory-validation`.

Keep one issue per branch. If implementation discovers larger unrelated work, create follow-up issues instead of expanding scope.

Open one pull request per issue after implementation is complete, local verification has run, and both agent reviews pass. The pull request should reference the issue with `Closes #42`, and the issue should remain in `state:user-review` until the user completes final review or the PR is merged.

PR title format:

```text
Issue #<number>: <short title>
```

PR body format:

```md
## Summary
- What changed

## Issue
Closes #<number>

## Verification
- npm run lint
- npm run test
- npm run build

## Agent Reviews
Senior coding-agent review: passed
Security-focused review: passed
Review rounds: N
Findings addressed: yes/no/not applicable

## Notes For User Review
Anything the user should pay attention to
```

If a project workflow doc specifies a reviewer, request that reviewer. If GitHub settings prevent reviewer assignment, mention the reviewer in a PR comment and state that the PR is ready for final review.

For very small local changes, the user may explicitly ask an agent to work in the current branch instead.

## Standard Issue Template

```md
---
name: Agent Task
about: Work item suitable for agent-assisted implementation
title: ""
labels: "state:backlog"
assignees: ""
---

## Goal

What should change?

## Context

Why is this needed? Link related files, bugs, screenshots, or user reports.

## Acceptance Criteria

- [ ] Observable behavior 1
- [ ] Observable behavior 2
- [ ] Tests or verification expected

## Constraints

Mention anything that should not change.

## Suggested Labels

State: `state:backlog` or `state:ready`

Agent routing: `agent:ready`, `agent:pair`, `agent:review-required`, or `agent:needs-context`

Type: `type:bug`, `type:feature`, `type:refactor`, `type:test`, `type:docs`, or `type:chore`

Priority: `priority:p0`, `priority:p1`, `priority:p2`, or `priority:p3`

Area: project-specific `area:*`

## Review Requirements

- [ ] Implementation complete
- [ ] Tests or verification run
- [ ] Senior coding-agent review passed
- [ ] Security-focused review passed
- [ ] PR opened and user requested as reviewer
- [ ] User final PR review complete
```

## Verification Defaults

Agents should inspect project tooling before choosing verification commands. For Node projects, prefer these when present:

- `npm run lint`
- `npm run test`
- `npm run build`

If a command is unavailable, inappropriate, or too broad for the change, document the narrower verification and why it is sufficient.

## Useful Queries

Show the autonomous agent queue:

```bash
gh issue list --state open --label "state:ready" --label "agent:ready"
```

Show collaborative pair-work issues:

```bash
gh issue list --state open --label "agent:pair"
```

Show blocked issues:

```bash
gh issue list --state open --label "state:blocked"
```

Show issues waiting for dual agent review:

```bash
gh issue list --state open --label "state:agent-review"
```

Show PR-backed issues waiting for user review:

```bash
gh issue list --state open --label "state:user-review"
```

## Security Rules

- Never commit `.env` files.
- Never read, grep, print, summarize, or inspect `.env` files or `.env.*` files unless the user explicitly asks for that exact file.
- Never hardcode API keys, tokens, or secrets in source files, workflow docs, commands, or issue comments.
- Use environment variables for sensitive data.
