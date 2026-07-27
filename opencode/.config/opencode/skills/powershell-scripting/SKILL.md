---
name: powershell-scripting
description: PowerShell and .ps1 scripting for safe unattended automation, NinjaOne/RMM, deployment, modules, testing, CI, migrations, and host context. Use when creating scripts, troubleshooting failures, reviewing security, diagnosing execution context, working with NinjaOne variables or custom fields, deploying software, building modules, adding CI/tests, or migrating PowerShell tooling.
---

# PowerShell Scripting

Build small, clear, maintainable automation. Add nothing the execution contract does not require: no abstraction layers, logging frameworks, or compatibility paths for hosts that never run it. Inspect local instructions and similar scripts first; existing conventions win.

## Execution contract

1. **Outcome:** Define the required result, already-compliant state, final verification, allowed disruption, and stable exit codes.
2. **Runtime:** Define supported host/version, OS and process architecture, Windows version, and relevant registry or filesystem views. Context failures are more common than syntax failures; enforce host or bitness only where needed, then parse-validate every supported path using the commands in the Validation section.
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
- **Handle native exits explicitly with argument arrays and exit-code contracts.** For MSI installation, build arguments explicitly and quote the validated MSI path within its argument value:
  ```powershell
  $arguments = @(
      '/i'
      "`"$msiPath`""
      '/qn'
      '/norestart'
  )
  # System32 redirects to SysWOW64 from a 32-bit process; Sysnative reaches the real
  # 64-bit directory and exists only in that case. See mini-skills/powershell-platform.md.
  $systemDir = if ($env:PROCESSOR_ARCHITEW6432) { 'Sysnative' } else { 'System32' }
  $msiexecPath = Join-Path -Path $env:SystemRoot -ChildPath "$systemDir\msiexec.exe"
  if (-not (Test-Path -LiteralPath $msiexecPath -PathType Leaf)) {
      throw 'Trusted Windows Installer executable was not found.'
  }

  $process = Start-Process -FilePath $msiexecPath -ArgumentList $arguments -Wait -PassThru

  switch ($process.ExitCode) {
      0 {
          Write-Log -Message 'Installed.'
      }
      3010 {
          $script:RebootRequired = $true
          Write-Log -Message 'Installed; reboot required.'
      }
      1638 {
          Write-Log -Level Warning -Message 'Another product version is installed; verifying requested state.'
      }
      default {
          throw "Windows Installer failed with exit code $($process.ExitCode)."
      }
  }
  ```
  Exit code `1638` is not proof of compliance; verify the requested product and version before reporting success.

  On `-Wait`:
  - It is required, so success is not reported before Windows Installer finishes.
  - It is unbounded. Configure the RMM job timeout for the worst-case installation duration.
  - When the contract requires a hard process timeout, use an explicitly bounded process-wait that fails cleanly and safely handles an installer still running at the limit.
  - Never use a pseudo-timeout, and never automatically terminate Windows Installer.
  - Verify the final state independently afterward, regardless of exit code.
- Use CIM, not WMI. Never use `Win32_Product` for inventory.
- Keep required local work separate from best-effort reporting. A reporting failure cannot overwrite required-work success.
- Clean up temporary files, sessions, mounts, and staging locations on every exit path.
- Keep normal output concise and complete.
- **Secret handling. This is the canonical rule; every other section defers to it.** Keep secrets out of output, URLs, process arguments, exception text, and persistent files. Raw exception messages or diagnostics are allowed only after confirming they cannot contain secrets, tokens, credentials, or echoed inputs. If safety is uncertain, use fixed technician-facing text. Never log raw exception objects.
- Hard-coded service URIs use HTTPS. Parse and validate supplied URIs and do not send secrets to non-HTTPS endpoints.
- Support a version, platform, architecture, path form, or compatibility behavior only when the contract requires it. Use `$PSScriptRoot` and `Join-Path` for script-relative paths.
- **Save `.ps1` files as UTF-8 with BOM, or keep them strictly ASCII.** Windows PowerShell 5.1 reads a BOM-less file as ANSI, so smart quotes, dashes, and accented characters corrupt at runtime rather than at author time. Pass `-Encoding` explicitly on every cmdlet that writes a file consumed by anything else; 5.1 and 7 do not share defaults.

## NinjaOne

Explicitly define the actual agent host, PowerShell architecture, execution identity, timeout, and output behavior. Test the actual agent path whenever those details affect behavior.

The host baseline for standard NinjaOne Windows PowerShell automations:

- Target 64-bit Windows PowerShell 5.1 (`powershell.exe`).
- Develop interactively under PowerShell 7 if you prefer, but parser validation, Pester, and end-to-end execution must all pass under 64-bit 5.1. A PowerShell 7 pass is secondary coverage, never the gate.
- Use PowerShell 7 only when the delivery contract guarantees it is installed, resolves a trusted `pwsh.exe`, and invokes that executable explicitly.
- Never raise `#Requires -Version` above 5.1 because the development host happens to be newer.

- NinjaOne values are untrusted strings. Checkbox values arrive as strings such as `'true'` and `'false'`; parse them explicitly. Do not directly cast them with `[bool]`: `[bool]'false'` is `$true`.
  ```powershell
  $enabled = $env:ExampleCheckbox -eq 'true'
  ```
- `NINJA_AGENT_PASSWORD` and secure fields are secrets. Never enumerate them; handle them under the secret-handling rule in Architecture.
- Use a validated path under `NINJA_DATA_PATH` only when persistent data is required.
- Prefer `Get-NinjaProperty` and `Set-NinjaProperty`. Use legacy `Ninja-Property-Get` and `Ninja-Property-Set` only when the installed environment requires them.
- Treat custom-field work as best effort unless it is the outcome. Validate names and values, handle missing commands or permissions, and do not assume an immediate read confirms an asynchronous write.
- Never reboot implicitly. Use `0` and `3010` only under the tenant automation contract.

### Output

- Default output is a handful of complete triage lines: what was found, what changed, and the verified final state.
- No banners, separators, progress chatter, Starting or Now checking narration, echoed inputs, or object/hashtable dumps.
- Exactly one line per meaningful outcome; normal output must identify success, change, or already compliant.
- Error uses one concise host line; the documented nonzero exit code communicates failure to automation.
- Never print invocation lines, stack traces, or native output. Exception and diagnostic text is governed by the secret-handling rule in Architecture.

Default output, correct:

```text
Agent 0.14.2 found; required 0.15.1.
Upgraded to 0.15.1.
Verified 0.15.1 installed and service running.
```

```text
Agent 0.15.1 already installed and running. No change required.
```

```text
ERROR: Installer package failed validation; no change made.
```

Default output, wrong:

```text
=== Agent Compliance Check ===          <- banner
Starting check...                       <- narration
Now checking installed version...       <- narration
Parameter TargetVersion = 0.15.1        <- echoed input
@{Name=Agent; Version=0.15.1; Status=4} <- object dump
Done!                                   <- no outcome stated
```

The wrong sample fails because a technician reading it cannot tell whether anything changed. Every correct sample answers found, changed, and verified in the fewest complete lines.

Vendor documentation: [Automation Script Variable Types](https://www.ninjaone.com/docs/endpoint-management/scripting-and-automation/automation-script-variable-types/) and [CLI Custom Fields and Documentation Scripting](https://www.ninjaone.com/docs/endpoint-management/scripting-and-automation/command-line-interface-cli/cli-custom-fields-documentation-scripting/).

## Validation

Run these before reporting any script complete. Parser validation is not optional and is not satisfied by the script "looking right" or by having run under PowerShell 7.

Parse-validate without executing:

```powershell
$parseErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile(
    $scriptPath, [ref]$null, [ref]$parseErrors) | Out-Null

if ($parseErrors) {
    $parseErrors | ForEach-Object {
        "{0}({1}): {2}" -f $scriptPath, $_.Extent.StartLineNumber, $_.Message
    }
    throw 'Parse validation failed.'
}
```

`ParseFile` reports only the parse errors of the host running it. A file that parses under PowerShell 7 can still fail under 5.1, so run the parse inside the target host as well, not just the development host.

Resolve and invoke 64-bit Windows PowerShell 5.1 explicitly:

```powershell
# 64-bit 5.1, correct from either a 64-bit or 32-bit parent process
$ps51 = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if ($env:PROCESSOR_ARCHITEW6432) {
    # Parent is 32-bit on 64-bit Windows; System32 would redirect to SysWOW64.
    $ps51 = Join-Path $env:SystemRoot 'Sysnative\WindowsPowerShell\v1.0\powershell.exe'
}

& $ps51 -NoProfile -ExecutionPolicy Bypass -File $scriptPath @scriptArgs
$LASTEXITCODE
```

Use `-NoProfile` so a developer profile cannot mask a missing dependency, and `-File` rather than `-Command` so arguments and the exit code behave as they do on the agent path.

Confirm the host you actually landed in:

```powershell
& $ps51 -NoProfile -Command '"{0} | 64-bit: {1}" -f $PSVersionTable.PSVersion, [Environment]::Is64BitProcess'
```

Run Pester against the target host the same way; a Pester run under PowerShell 7 is secondary compatibility coverage, not the required gate:

```powershell
& $ps51 -NoProfile -Command "Import-Module Pester -MinimumVersion 5.0; Invoke-Pester -Path '$testPath' -CI"
```

## Workflows

**Create:** Establish the execution contract, begin with the template for standalone scripts, implement only required validation, desired-state detection, change, native-exit handling, verification, and cleanup, then test realistic supported paths. If no realistic end-to-end environment exists, state that plainly and provide technician prerequisites, inputs, expected default output and exit code, final-state verification, and rollback.

**Fix:** Reproduce the technician-visible failure first with the same host, architecture, identity, inputs, output, exit code, timeout, and RMM context. Make the smallest root-cause fix and rerun the failed and supported paths.

**Review:** Report findings first, by severity and file/line. State explicitly when there are no findings, residual risks, and untested paths, especially when realistic execution was unavailable. Review execution context, inputs, secrets, injection, desired state, native exits, final verification, cleanup, and test gaps.

**Migrate:** Confirm deprecated or incompatible use first. For Microsoft Graph migrations, preserve authentication, scopes, pagination, schema, and operation semantics. Do not replace AzureAD/MSOnline behavior by name alone.

**Test:** Reproduce realistically first, then:

- Put new test files in `test/` in the current working directory, creating it if absent, so they stay consolidated.
- Parser-validate supported hosts without execution using the Validation section.
- Cover meaningful input, desired-state, native-exit, final-state, failure, timeout, and cleanup paths.
- Assert failure on the exit code, not the error stream. The template routes technician-facing errors to host output so RMM captures them, which leaves the error stream empty on a failing run.
- Require Pester 5 or later, detecting the installed and repository-supported version first. Prefer a repository-pinned 5+ version. If the repository pins something older, report the incompatibility rather than silently overriding it.
- If Pester is missing or below 5, recommend the technician install or upgrade it using the host's approved module-management method. Never install or upgrade silently, and get approval before changing their environment.
- Use PSScriptAnalyzer only when it already exists or the repository supports it.

**Module:** Keep module structure proportional to reuse. Define explicit exports, valid manifest metadata, public help, attribution, and tests only where the module contract needs them. Do not silently install dependencies.

**CI:** Follow repository evidence and the support matrix. Add parser, lint, Pester, coverage, publishing, or platform jobs only when supported and useful; make tool and publishing decisions from evidence.

## Mini-skills

Mini-skills supplement and never override or expand the main skill. Load every mini-skill the task requires and no others; a task can need both, and installing a downloaded vendor package under a fixed host baseline routinely does. Mini-skills carry detail this file deliberately omits and do not restate rules already stated here. Version, support, and deprecation facts must be verified against authoritative current documentation and the actual host.

- `mini-skills/powershell-platform.md`: host, version, or edition detection; 32-bit filesystem and registry redirection; constructs absent from 5.1; encoding defaults; deprecated-module migration; module and gallery handling; shell boundaries.
- `mini-skills/powershell-security.md`: secret sources for unattended and SYSTEM execution; download and installer validation; signature and publisher verification; injection and command construction; privilege and hardening controls; security-review output.
