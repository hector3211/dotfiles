---
name: powershell-scripting
description: PowerShell and .ps1 authoring, reviews, fixes, and troubleshooting for NinjaOne, RMM, Windows automation, endpoint remediation, deployment, and unattended scripts. Use for new scripts, script failures, security reviews, execution-context issues, NinjaOne variables, custom fields, software deployment, and Windows endpoint or server automation.
---

# PowerShell Scripting

Build small, clear, maintainable PowerShell automation. Favor NinjaOne best practices when NinjaOne is the deployment platform. Do not add abstraction, features, or compatibility paths that the execution contract does not require.

Inspect local instructions and similar scripts first.

## Architecture

Establish the outcome, runtime, identity, and deployment contract before coding:

1. Define the required result, the already-compliant state, and the final-state verification.
2. Confirm the supported PowerShell host, Windows version, process and OS bitness, execution identity, deployment method, inputs, secrets, timeout, and allowed disruption.
3. Enforce host and bitness only where truly needed. Parse and realistically test every supported path.
4. Define explicit native and script exit codes, cleanup expectations, and how reboot-required state is reported. Never reboot automatically from a NinjaOne script.

Start every new script from `assets/script-template.ps1`. Preserve existing attribution. For a new script, use the known project author or the template placeholder. Never invent a legal name from a username.

Use the smallest structure that is clear:

- Validate parameters, environment variables, NinjaOne values, and other external values before use according to how they will be used.
- Required values should reject missing or blank input; convert and validate expected type, format, range, or allowed values where relevant; validate related variables together when they depend on each other.
- Review every URI used by a script. A hard-coded service URI should use HTTPS. A URI supplied through input is untrusted: parse and validate it, and require or prefer HTTPS whenever the endpoint supports it. If the execution contract truly requires a non-HTTPS endpoint, make that explicit and never send secrets over it.
- Use desired-state and idempotent checks, then early exits for compliant or inapplicable systems.
- Add small functions only when they make the code clearer or independently testable.
- Keep required local work separate from best-effort NinjaOne reporting. Reporting failures must not change a successful required operation.
- Prefer clear `if` conditions for expected optional configuration. Do not use `try`/`catch` as normal control flow; use one top-level error boundary for unexpected failures.
- Use CIM rather than legacy WMI. Construct native executable arguments explicitly, check allowed exit codes, and verify final state.
- Clean up temporary resources on success and failure. Keep normal output concise; place diagnostic detail behind `-Verbose`.
- Keep secrets out of output, URLs, process arguments, exception text, and persistent files. Avoid opaque command strings.

Avoid unnecessary abstraction, giant logging frameworks, excessive comments or step banners, and features not required by the execution contract.

## NinjaOne

For NinjaOne automation, explicitly choose the actual PowerShell host, architecture, execution identity, timeout, and output behavior. Test the real agent execution path whenever those details affect behavior.

- Script and environment variables are untrusted strings. Reject missing or blank required values; convert and validate expected types, formats, ranges, and allowed values, including `'true'` and `'false'` checkbox values.
- Treat Ninja-provided environment variables as external input. `NINJA_AGENT_PASSWORD` and secure custom fields are secrets: never log, enumerate, include in exception text, or pass them as process arguments.
- Default to concise console output and place diagnostics behind `-Verbose`. Persist logs or data only when genuinely needed, using a validated path under `NINJA_DATA_PATH`.
- Prefer `Get-NinjaProperty` and `Set-NinjaProperty` when available. Use legacy `Ninja-Property-Get` and `Ninja-Property-Set` only when required by the installed environment.
- Treat custom-field operations as best effort unless they are the core outcome. Handle unavailable commands, permissions, mappings, and values clearly; validate field names and field-type values. Do not assume a blank value clears a field or that an immediate read verifies an asynchronous write.
- Never reboot implicitly from a NinjaOne custom script. Report reboot-required state and use only exit codes explicitly supported by tenant automation. `0` commonly means success or already compliant; use `3010` for reboot-required only when tenant automation handles it.

Vendor documentation: [Automation Script Variable Types](https://www.ninjaone.com/docs/endpoint-management/scripting-and-automation/automation-script-variable-types/) and [CLI Custom Fields and Documentation Scripting](https://www.ninjaone.com/docs/endpoint-management/scripting-and-automation/command-line-interface-cli/cli-custom-fields-documentation-scripting/).

## Create

1. Establish the contract, including the NinjaOne execution details when applicable.
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
