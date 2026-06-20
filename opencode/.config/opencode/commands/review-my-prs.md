---
description: Review open PRs that are waiting on me
---

Help me work through pull requests in the current repository that need my review.

Resolve workflow context in this order:

1. Read `AGENTS.md` if present.
2. Read `docs/github-issue-workflow.md` if present.
3. Read `/home/drama321/.config/opencode/docs/github-issue-workflow-standard.md`.

Find PRs that need me by checking, in order:

1. Open PRs requesting my review.
2. Open PRs assigned to me.
3. Open PRs mentioning me in comments or body.
4. Open PRs linked to issues labeled `state:user-review`.

Use `gh` for GitHub operations. If the current repo does not have enough GitHub context, explain what is missing.

Prioritize PRs by linked issue priority labels in this order: `priority:p0`, `priority:p1`, `priority:p2`, `priority:p3`, then oldest waiting PR.

For each PR, provide a concise review packet:

- PR title and URL.
- Linked issue and current state label.
- Summary of intended behavior change.
- Verification that was reported by the agent.
- Agent review results, including `code-reviewer` and `security-engineer` status when available.
- Main risk areas in the diff.
- Recommendation: approve, request changes, or ask a question.

Review rules:

- Use a code-review mindset: prioritize bugs, regressions, security risks, missing tests, and unclear behavior.
- Inspect the PR diff and relevant comments before recommending approval.
- Do not approve, merge, close, or mark `state:done` unless I explicitly tell you to do so.
- If I approve in chat, help with the exact GitHub action requested, such as commenting, approving, merging, or updating labels.
- Never read, grep, print, summarize, or inspect `.env` files or `.env.*` files unless I explicitly ask for that exact file.
- Never expose secrets from any source.
