# Standalone Runtime And Verification

Every generated script runs independently. Do not generate bootstrap scripts, launchers, chained target scripts, or self-relaunch logic.

## Runtime Contract

1. Determine the PowerShell host/version, process and OS architecture, execution identity, Windows versions, and deployment platform from the technician's context.
2. Write the script for the host that will execute it directly.
3. If PowerShell 7 is required, configure the deployment platform to invoke x64 `pwsh` directly and declare `#Requires -Version 7.0`.
4. If the platform cannot guarantee PowerShell 7, either target the actual supported host or fail deployment configuration review. Do not solve the mismatch by launching another script.
5. Support Windows PowerShell 5.1, x86, ARM64, or multiple hosts only when the stated contract requires and tests each path.

PowerShell parses a file before evaluating `#Requires`. When a requirement is not satisfied, it refuses execution before script control flow begins, so the script cannot convert that failure into a custom exit code.

## Architecture And Views

- Machine-scoped operating-system, service, installer, registry, or Program Files work should verify the architecture assumptions supplied by the technician.
- Select registry views explicitly with `.NET` `RegistryView.Registry64` or `RegistryView.Registry32` when redirection affects correctness.
- Select native versus redirected filesystem locations explicitly. Use `SysNative` only when a 32-bit process must access a native System32 binary.
- Preserve SYSTEM, current-user, administrator, or credential-store context as an explicit deployment decision.

## Parser Validation

From PowerShell, define this command once. It parses without executing the script, prints every error with its location, and exits nonzero when errors exist.

```powershell
$parserCommand = {
    param([string]$LiteralPath)

    $tokens = $null
    $errors = $null
    $resolvedPath = (Resolve-Path -LiteralPath $LiteralPath).Path
    [void][System.Management.Automation.Language.Parser]::ParseFile(
        $resolvedPath,
        [ref]$tokens,
        [ref]$errors
    )
    $errors | ForEach-Object {
        '{0}:{1} {2}' -f $_.Extent.StartLineNumber, $_.Extent.StartColumnNumber, $_.Message
    }
    if ($errors.Count -gt 0) {
        exit 1
    }
}
```

Invoke it under every host/version the standalone script declares or supports:

```powershell
& pwsh.exe -NoProfile -NonInteractive -Command $parserCommand -args '.\Script.ps1'
& powershell.exe -NoProfile -NonInteractive -Command $parserCommand -args '.\Script.ps1'
```

Parser validation checks syntax only. It does not replace Pester tests, security/correctness review, or realistic standalone execution testing.
