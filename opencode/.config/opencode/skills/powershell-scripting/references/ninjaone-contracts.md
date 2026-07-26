# NinjaOne Automation

Apply this reference when NinjaOne runs or supplies data to the script. Choose the PowerShell host, architecture, execution identity, timeout, and output format for the specific automation. Test the actual agent path when those details affect behavior.

## Inputs And Secrets

- Script variables and environment variables are strings. Validate and convert them in the script, including `'true'` and `'false'` checkbox values.
- Treat Ninja-provided environment variables as external input. `NINJA_AGENT_PASSWORD` and secure custom fields are secrets: never log, enumerate, include in exceptions, or pass them as process arguments.
- Use a validated path beneath `NINJA_DATA_PATH` when persistent Ninja data or logs are needed.

## Custom Fields

- Use `Get-NinjaProperty` and `Set-NinjaProperty` when available. Use `Ninja-Property-Get` and `Ninja-Property-Set` when required by the installed environment.
- Handle unavailable commands, permissions, field mappings, and values clearly. Treat custom-field work as best-effort unless it is part of the core outcome.
- Validate field names and values for their field type. Do not assume an empty string clears a field or that an immediate read confirms an asynchronous write.

## Operations

- Keep normal output concise. Put diagnostic details behind `-Verbose` where practical.
- Never reboot implicitly from a custom script. Report reboot-required state and use only an exit-code contract the tenant automation explicitly supports.
- Return explicit, documented exit codes. `0` commonly means success or already compliant. Treat `3010` as reboot-required only when the tenant's automation handles it.

## Vendor Documentation

- [Automation Script Variable Types](https://www.ninjaone.com/docs/endpoint-management/scripting-and-automation/automation-script-variable-types/)
- [Automation Parameters](https://www.ninjaone.com/docs/scripting-and-automation/automation-parameters/)
- [Automation Library FAQ](https://www.ninjaone.com/docs/scripting-and-automation/automation-library-faq/)
- [PowerShell: Ninja Property Get](https://www.ninjaone.com/docs/endpoint-management/scripting-and-automation/command-line-interface-cli/powershell-ninja-property-get/)
- [PowerShell: Ninja Property Set](https://www.ninjaone.com/docs/endpoint-management/scripting-and-automation/command-line-interface-cli/powershell-ninja-property-set/)
- [CLI Custom Fields and Documentation Scripting](https://www.ninjaone.com/docs/endpoint-management/scripting-and-automation/command-line-interface-cli/cli-custom-fields-documentation-scripting/)
