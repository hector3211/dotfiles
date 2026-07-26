---
name: powershell-scripting
description: PowerShell and .ps1 authoring, reviews, fixes, and troubleshooting for NinjaOne, RMM, Windows automation, endpoint remediation, deployment, and unattended scripts. Use for new scripts, script failures, security reviews, execution-context issues, NinjaOne variables, custom fields, software deployment, and Windows endpoint or server automation.
---

# PowerShell Scripting

Build small, clear, maintainable PowerShell automation. Favor NinjaOne best practices when NinjaOne is the deployment platform. Do not add abstraction, features, or compatibility paths that the execution contract does not require.

Inspect local instructions and similar scripts first. For every NinjaOne script, load `references/ninjaone-contracts.md`. Whenever a value crosses a trust boundary, load `references/input-validation.md`.

## Architecture

Establish the outcome, runtime, identity, and deployment contract before coding:

1. Define the required result, the already-compliant state, and the final-state verification.
2. Confirm the supported PowerShell host, Windows version, process and OS bitness, execution identity, deployment method, inputs, secrets, timeout, and allowed disruption.
3. Enforce host and bitness only where truly needed. Parse and realistically test every supported path.
4. Define explicit native and script exit codes, cleanup expectations, and how reboot-required state is reported. Never reboot automatically from a NinjaOne script.

Start every new script from `assets/script-template.ps1`. Preserve existing attribution. For a new script, use the known project author or the template placeholder. Never invent a legal name from a username.

Use the smallest structure that is clear:

- Validate inputs up front and fail fast for required inputs.
- Use desired-state and idempotent checks, then early exits for compliant or inapplicable systems.
- Add small functions only when they make the code clearer or independently testable.
- Keep required local work separate from best-effort NinjaOne reporting. Reporting failures must not change a successful required operation.
- Prefer clear `if` conditions for expected optional configuration. Do not use `try`/`catch` as normal control flow; use one top-level error boundary for unexpected failures.
- Use CIM rather than legacy WMI. Construct native executable arguments explicitly, check allowed exit codes, and verify final state.
- Clean up temporary resources on success and failure. Keep normal output concise; place diagnostic detail behind `-Verbose`.
- Keep secrets out of output, URLs, process arguments, exception text, and persistent files. Avoid opaque command strings.

Avoid unnecessary abstraction, giant logging frameworks, excessive comments or step banners, and features not required by the execution contract.

## Create

1. Establish the contract and load the required references.
2. Begin with `assets/script-template.ps1`.
3. Implement input validation, desired-state checks, required local work, explicit native exit handling, final-state verification, and cleanup only as required by the contract.
4. Test realistic supported execution paths, including already-compliant, invalid input, failure, and successful-change paths. Test native alternate success codes such as MSI `3010` when applicable.
5. If an end-to-end environment is unavailable, state that clearly and provide the technician-visible prerequisites, expected output and exit code, verification, and rollback steps.

## Fix

1. Reproduce the end-user or technician-visible issue first, as closely as possible to the actual host, bitness, identity, inputs, output, exit code, timeout, and RMM context.
2. Identify the root cause and make the smallest correct change.
3. Re-run the failing path, supported paths, final-state verification, and cleanup checks.

## Review

Report findings first, ordered by severity, with file and line references. Focus on security, correctness, maintainability, execution context, inputs and secrets, idempotency, native exits, verification, and cleanup. State explicitly when no findings are present and identify any testing gaps.
