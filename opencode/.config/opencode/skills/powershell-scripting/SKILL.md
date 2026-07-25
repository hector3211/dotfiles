---
name: powershell-scripting
description: Creates, fixes, reviews, and troubleshoots production PowerShell scripts, especially PowerShell 7/pwsh, x64 Windows, NinjaOne/RMM automation, software deployment, and device remediation. Use for .ps1 authoring, script failures, security reviews, NinjaOne variables or custom fields, and unattended Windows endpoint or server automation.
---

# PowerShell Scripting

Build safe, idempotent, unattended automation. Default to current PowerShell 7 on x64 Windows. Apply NinjaOne rules only when NinjaOne is the deployment platform.

## Route The Task

- **Create:** gather the execution contract, choose a deployment model, start from `assets/script-template.ps1`, implement desired-state detection and verification, then test.
- **Fix or troubleshoot:** reproduce the technician-visible failure first; capture the host, bitness, identity, inputs, output, exit code, and timeout; make the smallest root-cause fix; rerun the failing path and regression tests.
- **Review:** report findings first, ordered by severity with file and line references. Triage in this order: host/version, process and OS bitness, and deployment model; execution identity and run context; inputs and trust boundaries; secrets; native exit codes; idempotency and final-state verification; timeouts; cleanup. Use the focused references below instead of restating every rule.

If the workspace has local instructions or similar scripts, inspect them. Do not assume an `AGENTS.md`, repository, or established author exists.

## Establish The Contract

Before writing code, determine:

1. Required outcome and already-compliant state.
2. PowerShell host/version, process and OS bitness, Windows versions, and registry/filesystem views.
3. Execution identity: SYSTEM, administrator, current user, or stored credential.
4. Deployment mechanism, input sources, secrets, external systems, job timeout, and output encoding expectations.
5. Allowed disruption and how reboot-required state is reported. Never make a NinjaOne custom script reboot the device.
6. Stable exit codes, final-state checks, cleanup, rollback, and realistic E2E test path.

Separate required local work from optional reporting. Optional RMM/custom-field failures must not overwrite a successful required operation.

## Choose The Runtime

- Default new production scripts to x64 `pwsh` and declare `#Requires -Version 7.0`.
- Use **Model A** only when the agent-invoked host itself is verified x64 `pwsh`; it performs no relaunch.
- Use **Model B** whenever any launcher invokes `pwsh`. Start from `assets/model-b-launcher.ps1` and keep the PowerShell 7 target separate.
- Never place Windows PowerShell 5.1 bootstrap code in a file with `#Requires -Version 7.0`; PowerShell parses the file, then refuses execution before bootstrap logic can run when the requirement is not satisfied.
- Support Windows PowerShell 5.1, x86, or dual-host execution only when the deployment contract requires it and each path is tested.
- For full discovery, validation, relaunch, and registry-view rules, read `references/deployment-models.md`.

## Authoring Baseline

Start new targets from `assets/script-template.ps1`. Keep the smallest clear structure and include:

- Comment-based help, `[CmdletBinding()]`, an explicit `param` block, requirements, inputs, and an exit-code table.
- `Set-StrictMode -Version Latest` and `$ErrorActionPreference = 'Stop'`.
- `$PSNativeCommandUseErrorActionPreference = $true` on PowerShell 7.3 or later. Invoke a native command directly only when `0` is its sole success code; use `ProcessStartInfo` or an equivalent explicit wrapper when codes such as MSI `3010` are allowed.
- Explicit UTF-8 console/output encoding where RMM capture is part of the contract.
- Up-front validation, desired-state detection, early exits, bounded waits, post-change verification, and `finally` cleanup.
- `0` for success/already compliant and stable nonzero codes for actionable outcomes. Interpret an installer's MSI `3010` as successful installation with reboot required; this does not require the script itself to exit `3010`.

Preserve an existing `.AUTHOR`. For a new script, use an established project author or reliably configured full name; never invent a legal name from an OS username, and ask when attribution is required but unknown.

`$ErrorActionPreference = 'Stop'` affects PowerShell errors, not native executable failures. Invoke native programs with separately constructed arguments, account for `$PSNativeCommandUseErrorActionPreference`, inspect allowed exit codes, and verify resulting state. Never build a command string, execute an uninstall string opaquely, or put secrets in process arguments.

## Safety Rules

- Validate every trust boundary according to `references/input-validation.md`.
- Keep secrets out of logs, URLs, process arguments, exception text, and persistent files. Minimize and sanitize personal or tenant-identifying data.
- Use clear `if` checks for expected states and narrow `try`/`catch` around unsafe operations. Convert unexpected exceptions to concise output and a documented exit code at the top-level boundary.
- PowerShell 7 does not include the legacy WMI cmdlets. Use CIM without a silent WMI/`wmic.exe` fallback and follow `references/cim.md`.
- For APIs, downloads, and installers, follow `references/network-and-installers.md`.
- For privileged file operations, read `references/privileged-filesystem.md` before implementing mutations or cleanup.
- For NinjaOne variables, custom fields, logging, reboot handling, and current vendor links, read `references/ninjaone-contracts.md`.

## Destructive Work

- Fail closed on ambiguous identity or ownership, and prefer stable IDs over mutable names.
- Recheck target identity and destructive preconditions immediately before mutation.

## Verification

1. Reproduce the real execution path as closely as possible: same host, bitness, identity, inputs, and RMM context.
2. Parse each script without executing it under every supported PowerShell host using the commands in `references/deployment-models.md#parser-validation`.
3. Run Pester coverage for nontrivial logic and test missing, blank, malformed, boundary, false/zero, conflicting, already-compliant, failure, timeout, and successful-change paths.
4. Test native success, expected alternate success such as MSI `3010`, unexpected exit, final-state mismatch, and cleanup after success and failure.
5. Use Windows Sandbox, a disposable VM, or a designated endpoint for installers, services, registry, SYSTEM, and destructive behavior.
6. If realistic E2E access is unavailable, say so and provide a technician checklist with prerequisites, inputs, expected output/code, state verification, and rollback.

For review, focus on the applicable reference files rather than duplicating this workflow as a checklist.
