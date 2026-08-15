---
description: Implement a task using the strict TDD subagent
argument-hint: "<task>"
---
Use the subagent tool in single mode with agent `tdd-engineer` for: $ARGUMENTS

Require strict TDD:
- No implementation before a failing test.
- Work in small cycles: red, green, refactor.
- Prefer the smallest relevant test scope.
- If no clear test harness exists, identify the smallest viable test seam first.
- If the requirement is ambiguous, state the assumption and proceed with the smallest testable interpretation.

For each cycle, report briefly:
- Red: failing test and why
- Green: minimal fix
- Refactor: cleanup, if any

End with:
- tests changed
- implementation changed
- remaining risks
