---
name: powershell-scripting
description: PowerShell and .ps1 authoring, fixes, reviews, and troubleshooting for Pester/testing, CI/CD, modules, Microsoft Graph/AzureAD migrations, cross-platform host and shell detection, NinjaOne/RMM, Windows automation, endpoint remediation, deployment, unattended scripts, script failures, security reviews, execution context, NinjaOne variables, custom fields, and software deployment.
---

# PowerShell Scripting

Build small, clear, maintainable automation. Add nothing the execution contract does not require: no abstraction layers, logging frameworks, or compatibility paths for hosts that never run it. Inspect local instructions and similar scripts first; existing conventions win. Mini-skills supplement but never override or expand this main skill.

## Execution contract

1. **Outcome:** Define the required result, already-compliant state, final verification, allowed disruption, and stable exit codes.
2. **Runtime:** Define supported host/version, OS and process architecture, Windows version, and relevant registry or filesystem views. Context failures are more common than syntax failures; enforce host or bitness only where needed, then parse-validate every supported path.
3. **Identity:** Define the execution account, elevation, user-session need, credential source, and access boundaries.
4. **Delivery:** Define the deployment mechanism, inputs, secrets, timeout, output, external services, and reboot contract.
5. **Exits:** Define success, already-compliant, reboot-required, failure, native-process, cleanup, and reporting behavior.

Start standalone scripts from `assets/script-template.ps1`. Preserve existing attribution, resolve the project or organization attribution for new work, and never invent a legal name.

## Architecture

Use the smallest clear structure. Add functions only when they improve clarity or independent testability.

- **Validate every external input before use.** Reject missing or blank required values; convert and validate type, format, range, allowed values, and dependent inputs together.
- **Detect desired state first and exit early when already compliant or inapplicable.** Verify the final state after a required change.
- **Use clear `if` checks for expected absence or optional configuration, not `try`/`catch` as normal control flow.** Reserve a top-level boundary and narrow unsafe-operation handling for unexpected failures.
- Enable `SupportsShouldProcess` only when every mutation is guarded by `ShouldProcess`.
- Parameter-binding validation occurs before script control flow; validate inside the top-level boundary when stable RMM output and exit codes are required.
- **Handle native exits explicitly with argument arrays.** For example: `$arguments = @('/i', $msiPath, '/qn', '/norestart'); & msiexec.exe @arguments; $exitCode = $LASTEXITCODE`. Treat `0`, `3010`, and `1638` according to the contract, then verify the resulting state.
- Use CIM, not WMI. Never use `Win32_Product` for inventory.
- Keep required local work separate from best-effort reporting. A reporting failure cannot overwrite required-work success.
- Clean up temporary files, sessions, mounts, and staging locations on every exit path.
- Keep normal output concise and complete. Assume `Verbose` is off; use it only for diagnostics.
- Keep secrets out of output, URLs, process arguments, exception text, and persistent files.
- Hard-coded service URIs use HTTPS. Parse and validate supplied URIs and do not send secrets to non-HTTPS endpoints.
- Support a version, platform, architecture, path form, or compatibility behavior only when the contract requires it. Use `$PSScriptRoot` and `Join-Path` for script-relative paths.

## NinjaOne

Explicitly define the actual agent host, PowerShell architecture, execution identity, timeout, and output behavior. Test the actual agent path whenever those details affect behavior.

- NinjaOne values are untrusted strings. Checkbox values arrive as strings such as `'true'` and `'false'`; parse them explicitly. Do not directly cast them with `[bool]`: `[bool]'false'` is `$true`.
  ```powershell
  $enabled = $env:ExampleCheckbox -eq 'true'
  ```
- `NINJA_AGENT_PASSWORD` and secure fields are secrets. Never log, enumerate, persist, include them in exception text, or pass them in process arguments.
- Use a validated path under `NINJA_DATA_PATH` only when persistent data is required.
- Prefer `Get-NinjaProperty` and `Set-NinjaProperty`. Use legacy `Ninja-Property-Get` and `Ninja-Property-Set` only when the installed environment requires them.
- Treat custom-field work as best effort unless it is the outcome. Validate names and values, handle missing commands or permissions, and do not assume an immediate read confirms an asynchronous write.
- Never reboot implicitly. Use `0` and `3010` only under the tenant automation contract.

### Output

- `-Verbose` is not automatic; the technician must type it in NinjaOne script parameters or arguments. Write every script assuming it is absent.
- Default output is a handful of complete triage lines: what was found, what changed, and the verified final state.
- No banners, separators, progress chatter, Starting or Now checking narration, echoed inputs, or object/hashtable dumps.
- Exactly one line per meaningful outcome; normal output must identify success, change, or already compliant.
- Error uses one concise host line; the documented nonzero exit code communicates failure to automation.
- Verbose is diagnostics only: sanitized resolved paths, version comparisons, retries, and task-safe context. Do not print raw exception messages, invocation lines, stack traces, native output, or objects when they may contain secrets or inputs.

```text
Verbose output: add -Verbose to the script parameters field when troubleshooting.
```

Optional checkbox compatibility escape hatch:

```powershell
if ($env:verboseOutput -eq 'true') { $VerbosePreference = 'Continue' }
```

This sets the preference once and is not a second logging path.

Vendor documentation: [Automation Script Variable Types](https://www.ninjaone.com/docs/endpoint-management/scripting-and-automation/automation-script-variable-types/) and [CLI Custom Fields and Documentation Scripting](https://www.ninjaone.com/docs/endpoint-management/scripting-and-automation/command-line-interface-cli/cli-custom-fields-documentation-scripting/).

## Workflows

**Create:** Establish the execution contract, begin with the template for standalone scripts, implement only required validation, desired-state detection, change, native-exit handling, verification, and cleanup, then test realistic supported paths.

**Fix:** Reproduce the technician-visible failure first with the same host, architecture, identity, inputs, output, exit code, timeout, and RMM context. Make the smallest root-cause fix and rerun the failed and supported paths.

**Review:** Report findings first, by severity and file/line. Review execution context, inputs, secrets, injection, desired state, native exits, final verification, cleanup, and test gaps.

**Migrate:** Confirm deprecated or incompatible use first. For Microsoft Graph migrations, preserve authentication, scopes, pagination, schema, and operation semantics. Do not replace AzureAD/MSOnline behavior by name alone.

**Test:** Reproduce realistically first. Parser-validate supported hosts without execution and test meaningful input, desired-state, native-exit, final-state, failure, timeout, and cleanup paths. Use PSScriptAnalyzer only when existing or repository-supported.

**Module:** Keep module structure proportional to reuse. Define explicit exports, valid manifest metadata, public help, attribution, and tests only where the module contract needs them. Do not silently install dependencies.

**CI:** Follow repository evidence and the support matrix. Add parser, lint, Pester, coverage, publishing, or platform jobs only when supported and useful; make tool and publishing decisions from evidence.

## Mini-skills

Load at most one mini-skill. It supplements this skill and never expands the execution contract. Version, support, and deprecation facts must be verified against authoritative current documentation and the actual host.

- `mini-skills/powershell-platform.md`: host/version/module/shell question, consolidating 7.x features, deprecated migrations, module/gallery, cross-platform, shell boundaries, or CI beyond standalone.
- `mini-skills/powershell-security.md`: secret/download/privilege question, security review, secret providers, hardening, privileged access, artifact verification, or execution control.
