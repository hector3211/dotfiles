# GitHub Workflow Commands

These global opencode commands standardize the issue-to-PR workflow across projects.

## Commands

- `/github-workflow-init` - installs the standard GitHub issue workflow into the current repo.
- `/work-next-issue` - autonomously works the next ready issue through implementation, verification, dual agent review, PR creation, and user review.
- `/review-my-prs` - helps you work through PRs that need your review.

## Recommended Lifecycle

Run `/github-workflow-init` once in a new repo to create the baseline workflow files and issue template.

Use `/work-next-issue` when you want the agent to take the next autonomous issue from the queue and drive it to a PR.

Use `/review-my-prs` when you want help reviewing PRs that are waiting on you.

## Baseline Policy

The canonical baseline lives at:

```text
~/.config/opencode/docs/github-issue-workflow-standard.md
```

Improve this baseline when the workflow changes. Then run `/github-workflow-init` in repos that should receive the updated policy.

## Per-Repo Policy

Projects should keep their local workflow policy at:

```text
docs/github-issue-workflow.md
```

Project agents should also have an `AGENTS.md` section pointing to that file. The init command creates or updates that section while preserving unrelated project guidance.

## Safety

Commands must not read `.env` or `.env.*` files unless the user explicitly asks for the exact file. Commands must not copy tokens, API keys, or credentials into docs, issues, PRs, or command files.
