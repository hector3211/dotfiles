# PowerShell Deployment Models

Use exactly one model for each production target and document it in the automation configuration.

## Model A: Verified Direct Host

Model A means the deployment system invokes the target directly under an already verified x64 `pwsh` process. No script or wrapper launches another PowerShell host.

1. Configure x64 execution where the platform supports it.
2. Verify the actual process path, `$PSVersionTable.PSVersion`, `[Environment]::Is64BitOperatingSystem`, and `[Environment]::Is64BitProcess` in the real tenant path.
3. Declare `#Requires -Version 7.0` in the target.
4. Fail clearly if the host or bitness contract is not met. Never fall back to `powershell.exe`.

An installed `pwsh.exe` does not prove that an RMM selected it.

## Model B: Separate Launcher And Target

Anything that invokes `pwsh`, including a script that directly calls an absolute `pwsh.exe`, is Model B.

1. Keep the launcher compatible with its declared starting host, commonly Windows PowerShell 5.1.
2. Keep the PowerShell 7 target in a separate file with `#Requires -Version 7.0`.
3. Locate x64 PowerShell 7 from a controlled path. From a 32-bit process, use `Join-Path $env:ProgramW6432 'PowerShell\7\pwsh.exe'`; do not claim PowerShell 7 exists under `SysNative`.
4. Resolve and verify the executable path, x64 location, file identity, and expected Microsoft Authenticode signer.
5. Treat the target as privileged executable content: use an immutable absolute allowlisted path, enforce its parent boundary, reject reparse components, validate owner/ACL, and verify an expected signature or pinned hash immediately before launch.
6. Build a fixed argument array containing `-NoProfile`, `-NonInteractive`, `-ExecutionPolicy`, `Bypass`, `-File`, and the validated target path. Append only strictly validated non-secret values.
7. Invoke the verified executable with the call operator and the argument array, then propagate `$LASTEXITCODE` unchanged.

The minimal launcher waits synchronously so it can preserve output and the exact child exit code. Configure the RMM job timeout as its outer bound, and require the target to bound every network, native-process, CIM, retry, and polling operation it controls.

Use `assets/model-b-launcher.ps1` as the starting implementation. Windows PowerShell 5.1 does not provide `ProcessStartInfo.ArgumentList`, so do not use it in that launcher. Never pass a raw command line or construct a shell command string.

## x86 PowerShell 7 Self-Relaunch

Allow this only for a target already running under PowerShell 7 on 64-bit Windows. Use `ProcessStartInfo.ArgumentList`, `UseShellExecute = $false`, a fixed internal relaunch marker, a post-launch x64 assertion, bounded waiting, and exit-code propagation. Prefer a separate Model B launcher when the starting host is not guaranteed.

## Architecture And Views

- Machine-scoped operating-system, service, installer, registry, or Program Files work must assert both 64-bit OS and 64-bit process.
- Select registry views explicitly with `.NET` `RegistryView.Registry64` or `RegistryView.Registry32` when redirection affects correctness.
- Select native versus redirected filesystem locations explicitly. Use `SysNative` only when a 32-bit process must access a native System32 binary.
- Preserve SYSTEM, current-user, or credential-store context as an explicit decision independent of language and architecture.

## Tests

- Model A: verify direct x64 `pwsh`, unsupported-host failure, process path, version, and bitness.
- Model B: test missing/invalid `pwsh`, signer mismatch, target path/boundary/ACL/reparse/hash failure, argument rejection, child success/failure, and exact exit propagation.
- Parse the launcher under every supported starting host and parse the target under PowerShell 7 without executing either file.

## Parser Validation

From PowerShell, define this parser command once. It parses without executing the target, prints every error with its location, and exits nonzero when errors exist.

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

Invoke it under every host/version the file declares or supports:

```powershell
& pwsh.exe -NoProfile -NonInteractive -Command $parserCommand -args '.\Target.ps1'
& powershell.exe -NoProfile -NonInteractive -Command $parserCommand -args '.\Launcher.ps1'
```

Parser validation checks syntax only. It does not replace Pester tests, security/correctness review, or realistic execution-path testing.
