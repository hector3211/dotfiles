---
name: powershell-scripting
description: PowerShell and .ps1 authoring, reviews, fixes, and troubleshooting for Pester/testing, CI/CD, modules, Microsoft Graph/AzureAD migrations, cross-platform host and shell detection, NinjaOne/RMM, Windows automation, endpoint remediation, deployment, and unattended scripts. Use for new scripts, script failures, security reviews, execution-context issues, NinjaOne variables, custom fields, software deployment, and Windows endpoint or server automation.
---

# PowerShell Scripting

Build small, clear, maintainable PowerShell automation. Favor NinjaOne best practices when NinjaOne is the deployment platform. Do not add abstraction, features, or compatibility paths that the execution contract does not require.

Inspect local instructions and similar scripts first.

## Task Workflows

These workflows follow the main execution contract. Load the applicable mini-skill when needed.

- **Analyze:** Remain read-only unless fixes are requested; use PSScriptAnalyzer only when already available or repository-supported. When feasible, parser-validate without executing under every supported PowerShell host. Report findings first by severity with file/line references, covering correctness, secrets and injection, host compatibility, NinjaOne execution, idempotency, native exits, verification and cleanup, maintainability and performance, and test gaps.
- **CI:** Inspect current CI and the support matrix first; choose GitHub Actions, Azure DevOps, or GitLab from an explicit requirement or repository evidence. Include parser, lint, Pester, coverage, and publish steps only when relevant; verify current official action, task, and tool versions; protect secrets, gate publishing, and validate configuration.
- **Migrate:** Detect actual deprecated or incompatible use before changing it. For Graph migrations, verify authentication, scopes, pagination, schema, and semantics; replace `wmic` or legacy WMI appropriately, never use `Win32_Product` for inventory, preserve actual compatibility, make the smallest change, and verify with relevant tests, documentation, and realistic execution.
- **Module:** Use architecture proportional to reuse; define explicit exports, valid manifest metadata, known attribution, and help for public commands. Add tests, analyzer checks, documentation, and CI only when relevant; do not mechanically apply the standalone script template, and validate import, manifest, and exports.
- **Secure:** Determine identity and the secret provider first, and never print secret values. For NinjaOne, use approved secure fields or credentials and account for SYSTEM; do not blindly configure SecretStore; inspect logging, arguments, persistence, and injection; verify remediation and document setup without secret values.
- **Test:** Detect the existing or pinned Pester version and conventions; reproduce the technician or end-user issue first. Validate parsing under supported hosts and add meaningful desired-state, input, error, native-exit, final-state, and cleanup tests; do not silently install or upgrade dependencies, apply coverage thresholds only when requested or configured, and report exact results and gaps.

Source acknowledgment: Adapted from MIT-licensed ideas in the [powershell-master command directory](https://github.com/JosiahSiegel/claude-plugin-marketplace/tree/main/plugins/powershell-master/commands).

## Mini-Skills

Load only the applicable supporting document. This `SKILL.md` remains authoritative, and mini-skills do not expand the execution contract.

- `mini-skills/powershell-2025-changes.md`: modernization work or migrations from deprecated PowerShell, identity, WMI, or package technologies.
- `mini-skills/powershell-7.5-features.md`: a task considers PowerShell 7.x, 7.5, later-version, or preview functionality.
- `mini-skills/powershell-master.md`: architecture, modules, cloud/API integrations, cross-platform support, or CI/CD design beyond a standalone script.
- `mini-skills/powershell-security.md`: security review, secret handling, hardening, privileged access, downloads, or execution-control work.
- `mini-skills/powershell-shell-detection.md`: host, shell, platform, path, encoding, or child-shell boundary work.

Source acknowledgment: Adapted from MIT-licensed ideas in the [upstream PowerShell Master skills](https://github.com/JosiahSiegel/claude-plugin-marketplace/tree/main/plugins/powershell-master/skills).

## Architecture

Establish the outcome, runtime, identity, and deployment contract before coding:

1. Define the required result, the already-compliant state, and the final-state verification.
2. Confirm the supported PowerShell host, Windows version, process and OS bitness, execution identity, deployment method, inputs, secrets, timeout, and allowed disruption.
3. Enforce host and bitness only where truly needed. Parse and realistically test every supported path.
4. Define explicit native and script exit codes, cleanup expectations, and how reboot-required state is reported. Never reboot automatically from a NinjaOne script.

Start every new script from `assets/script-template.ps1`. Preserve existing attribution. A production script must replace the template placeholder with a known project or organization author; if attribution is required but unknown, ask, and if it is not required, remove the placeholder line. Never invent a legal name from a username.

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

Report findings first, ordered by severity, with file and line references. When feasible, parser-validate without executing under every supported PowerShell host. Focus on security, correctness, maintainability, execution context, inputs and secrets, idempotency, native exits, verification, and cleanup. State explicitly when no findings are present and identify any testing gaps.
