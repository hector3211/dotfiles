# global agent instructions

- Never use the em dash "--". Use plain dash "-" instead
- When writing commit messages, NEVER auto-add your agent name as co-author
- Never manually modify CHANGELOG.md files or any files that are marked as auto-generated
- When making technical decisions, do not give much weight to development cost.
  Instead, prefer quality, simplicity, robustness, scalability, and long term maintainability.
- When doing bug fixes, always start with reproducing the bug in an E2E setting as closely aligned with how an end
  user would experience it as possible.
  This makes sure you find the real problem so your fix will actually solve it.
- When end-to-end testing a product, be picky about the UI you see and be obsessed with pixel perfection.
  If something clearly looks off, even if it is not directly related to what you are doing, try to get it fixed along the way.
- Apply that same high standard to engineering excellence: lint, test failures, and test flakiness.
  If you see one, even if it is not caused by what you are working on right now, still get it fixed.

## subagent routing

- Use `explore` for simple lookups, targeted searches, file discovery, and small read-only data reviews.
- Use `general` for medium-complexity research, analysis, and self-contained implementation tasks.
- Keep complex, cross-cutting, ambiguous, or high-risk work in the primary agent unless a specialized subagent is a better fit.
- Delegate only when the handoff saves context or latency. Handle trivial direct reads and single-file checks locally.
- Give each subagent one bounded objective, the minimum necessary context, explicit constraints, and an exact return format.
- Launch independent subagent tasks in parallel. Do not duplicate their work in the primary agent.
- Prefer the smallest capable model and agent. Escalate only when the result is incomplete or the task proves more complex.

## Effect source of truth

Use the current Effect v4 / effect-smol source, not memory or older Effect v2/v3 examples.

1. If `.opencode/references/effect-smol` is missing, clone `https://github.com/Effect-TS/effect-smol` there. Do this in the project, not in the skill folder.
2. Search `.opencode/references/effect-smol` for exact APIs, examples, tests, and naming patterns before answering or implementing Effect-specific code.
3. Also inspect existing repo code for local house style before introducing new patterns.
4. Prefer answers and implementations backed by specific source files or nearby repo examples.
