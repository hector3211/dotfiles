# CIM Operations

PowerShell 7 does not provide the legacy WMI cmdlets. Use CIM; do not add a silent WMI or `wmic.exe` fallback.

## Supported Commands

Use `Get-CimInstance`, `Invoke-CimMethod`, `New-CimInstance`, `Set-CimInstance`, `Remove-CimInstance`, `New-CimSession`, and `Remove-CimSession`. Do not use `Get-WmiObject`, `Invoke-WmiMethod`, `Set-WmiInstance`, `Remove-WmiObject`, or `wmic.exe` in PowerShell 7 production scripts.

## Query And Mutation Sequence

1. Validate the namespace, class, target computer, and identity before opening a session or building a query.
2. Prefer server-side `-Filter` with strictly validated values and request only required properties when practical.
3. Set bounded operation timeouts below the RMM job timeout. Do not allow a provider or unreachable endpoint to hang the automation.
4. For repeated or remote work, create one explicit `CimSession`, reuse it, and remove it in `finally` after both success and failure.
5. Prefer WSMan for remote CIM. Use an explicit DCOM session only when a documented provider/environment requires it and security policy permits it.
6. Treat returned properties as untrusted external data; validate type, range, cardinality, and target identity before mutation.
7. Recheck mutation preconditions immediately before `Invoke-CimMethod`, `Set-CimInstance`, or `Remove-CimInstance`.
8. Verify resulting state independently before reporting success.

Do not use `Win32_Product` for software inventory or desired-state detection because it is slow and can trigger MSI consistency checks. Prefer validated uninstall registry views or a vendor-supported inventory source.

## Compatibility Exceptions

When no reliable CIM path exists, document the exact provider limitation, isolate the compatibility implementation, constrain it to the required host/version, and test it there. Never present a legacy fallback as PowerShell 7-compatible.

## Tests

Test missing namespace/class/instance, zero/one/multiple matches, malformed filter input, unreachable target, timeout, access denied, provider failure, mutation failure, final-state mismatch, and session removal after success and failure. Static review should reject legacy WMI cmdlets and `wmic.exe` in PowerShell 7 targets.
