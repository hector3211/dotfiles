# NinjaOne Automation Contracts

Verified against public NinjaOne documentation on 2026-07-25. Recheck tenant behavior and current vendor documentation when agent/module behavior changes. NinjaOne guidance applies only when NinjaOne is an approved deployment platform for the work.

## Execution

- NinjaOne exposes the language `PowerShell`, but the agent determines the executing PowerShell version. Installed PowerShell 7 is not proof that the automation runs under `pwsh`.
- Set automation **Architecture = 64-bit** for deterministic x64 machine-scoped work. `All` follows the device's native architecture.
- Choose SYSTEM, current user, or credential-store execution explicitly and validate that identity's access.
- Custom scripts must not issue reboots. Detect reboot-required state, emit a concise status, return a code explicitly defined by the tenant automation, and let NinjaOne's native reboot automation perform the reboot.
- Bound network, child-process, CIM, synchronization, retry, and polling operations below the configured NinjaOne job timeout. A minimal Model B launcher's synchronous wait may use that configured job timeout as its outer bound, but the target must still bound each operation it controls. Do not confuse the queue's indefinite pending duration with a runtime budget.
- Set UTF-8 console/output encoding deliberately when Unicode must survive RMM output capture, and test the actual captured result.

## Script Variables And Parameters

- Script variables arrive as `$env:<name>` strings. Empty optional values arrive as `''`; checkboxes arrive as `'true'` or `'false'`. Validate required values again in code and strictly cast after retrieval.
- Limit an automation to 20 script variables. Treat this as a dated vendor limit and recheck before relying on it.
- String/text script variables reject ``&|;$><\`!`` and the documented page also lists `Å`, `Ä`, and `Ö`. Do not design inputs that require restricted characters.
- Preset parameters are positional, space-separated strings. Quote values containing spaces. Arrays and Boolean values are unsupported.
- The current Parameters page documents up to 50 preset parameter entries and 30,000 characters per parameter. Prefer script variables for named input and still impose a much smaller task-specific validation bound.

## Documented Environment Variables

Treat all environment values as untrusted strings:

- `NINJA_EXECUTING_PATH`
- `NINJA_AGENT_VERSION_INSTALLED`
- `NINJA_PATCHER_VERSION_INSTALLED`
- `NINJA_DATA_PATH`
- `NINJA_AGENT_PASSWORD`
- `NINJA_AGENT_MACHINE_ID`
- `NINJA_AGENT_NODE_ID`
- `NINJA_ORGANIZATION_NAME`
- `NINJA_ORGANIZATION_ID`
- `NINJA_COMPANY_NAME`
- `NINJA_LOCATION_ID`
- `NINJA_LOCATION_NAME`

`NINJA_AGENT_PASSWORD` is a live secret in the process environment. Never enumerate or dump the environment, log this value, forward it to a child process, or include it in diagnostic output.

For persistent logs, derive a validated path beneath `$env:NINJA_DATA_PATH` rather than hardcoding `C:\ProgramData\NinjaRMMAgent`. Keep logging console-first and best-effort unless an audit log is itself a required outcome. Protect privileged logs according to `privileged-filesystem.md`.

## Custom Fields

- Prefer `Get-NinjaProperty` and `Set-NinjaProperty`. Use legacy `Ninja-Property-Get` and `Ninja-Property-Set` only for a known compatibility requirement.
- Probe capability once and choose deliberately. Required integration fails clearly when the command, permission, field, mapping, or value is unavailable; optional integration warns without changing the required local result.
- Require appropriate Automation read/write permissions and validate exact field name, scope, type, format, and sensitivity.
- Preserve missing, inaccessible, unmapped, blank, false, and zero as distinct states. Reads vary by field type and may return strings, arrays, JSON, `1`, `0`, or no output.
- Secure fields are plaintext strings during authorized automation, are unavailable in local/web terminals, and have a documented 200-character limit. Never log them or pass them in child-process arguments.
- Do not assume setting `''` clears a field. Use the installed module's documented clear operation and verify final state.
- Writes synchronize asynchronously, typically within minutes. Use bounded polling or report synchronization pending; do not assume an immediate read is authoritative.

## Exit And Reboot Contract

- `0`: successful or already compliant.
- `3010`: conventional MSI success with reboot required; use it as the script result only when the tenant automation explicitly defines and handles that contract.
- Other stable nonzero codes: validation, unsupported runtime, operation failure, timeout, or verification failure as documented by the script.

MSI `3010` is not an installation failure, but NinjaOne's public documentation does not state that the platform interprets it specially. Record reboot-required state and do not invoke `Restart-Computer`, `shutdown.exe`, WMI/CIM reboot methods, or another reboot mechanism from a custom script.

## Official Documentation

- [Automation Script Variable Types](https://www.ninjaone.com/docs/endpoint-management/scripting-and-automation/automation-script-variable-types/)
- [Automation Parameters](https://www.ninjaone.com/docs/scripting-and-automation/automation-parameters/)
- [Automation Library FAQ](https://www.ninjaone.com/docs/scripting-and-automation/automation-library-faq/)
- [PowerShell: Ninja Property Get](https://www.ninjaone.com/docs/endpoint-management/scripting-and-automation/command-line-interface-cli/powershell-ninja-property-get/)
- [PowerShell: Ninja Property Set](https://www.ninjaone.com/docs/endpoint-management/scripting-and-automation/command-line-interface-cli/powershell-ninja-property-set/)
- [CLI Custom Fields and Documentation Scripting](https://www.ninjaone.com/docs/endpoint-management/scripting-and-automation/command-line-interface-cli/cli-custom-fields-documentation-scripting/)
