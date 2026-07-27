# PowerShell Platform

Deep host detail. Rules stated in `SKILL.md` are not repeated here.

## Detect before choosing syntax

- `$PSVersionTable.PSVersion` and `$PSVersionTable.PSEdition` identify the engine. `Desktop` is Windows PowerShell 5.1; `Core` is 6+.
- `[Environment]::Is64BitProcess` and `[Environment]::Is64BitOperatingSystem` are distinct. A 32-bit process on 64-bit Windows is the case that breaks scripts.
- `$IsWindows`, `$IsLinux`, and `$IsMacOS` exist only in 6+. Under 5.1 they are undefined, and behavior splits on strict mode: with `Set-StrictMode` active, `if ($IsWindows)` throws a `RuntimeException`; without it, the reference silently evaluates false. Both are wrong, and the template sets `Set-StrictMode -Version 3.0`, so the throw is the case to expect. Test the edition instead:

```powershell
$isWindowsHost = ($PSVersionTable.PSEdition -eq 'Desktop') -or
                 ($PSVersionTable.PSEdition -eq 'Core' -and $IsWindows)
```

  Short-circuit order matters: `$IsWindows` is only reached once the edition is known to be `Core`, where it is guaranteed to exist.
- Verify support, version, feature, and deprecation facts against current authoritative documentation and the actual host.

## Bitness redirection

A 32-bit PowerShell process on 64-bit Windows sees redirected views. Both must be handled deliberately.

- Filesystem: `System32` redirects to `SysWOW64`. Reach the real 64-bit directory through `Sysnative`, which exists only from a 32-bit process. `$env:PROCESSOR_ARCHITEW6432` is set only in that case and is the reliable detection signal.
- Registry: a 32-bit process reads `HKLM:\SOFTWARE` as `HKLM:\SOFTWARE\WOW6432Node`. Do not hardcode `WOW6432Node`; open the intended view explicitly.

```powershell
$view = [Microsoft.Win32.RegistryView]::Registry64
$base = [Microsoft.Win32.RegistryKey]::OpenBaseKey('LocalMachine', $view)
$key  = $base.OpenSubKey('SOFTWARE\Vendor\Product')
try   { $installed = $key.GetValue('DisplayVersion') }
finally { if ($key) { $key.Dispose() }; $base.Dispose() }
```

Uninstall inventory lives in both views. Enumerate `SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall` under `Registry64` and `Registry32` and merge.

## Features absent from 5.1

Choose features compatible with every contracted host. Do not assume a current release, and do not add a compatibility path for an uncontracted host. Common 6+/7-only constructs that parse-fail or misbehave under 5.1:

- Ternary `? :`, null-coalescing `??` and `??=`, null-conditional `?.` and `?[]`
- Pipeline chain operators `&&` and `||`
- `ForEach-Object -Parallel`, `ConvertFrom-Json -AsHashtable`, `Test-Json`
- `Invoke-WebRequest`/`Invoke-RestMethod -SkipCertificateCheck`, `-Authentication`, `-ResponseHeadersVariable`
- `Get-Content -AsByteStream` (5.1 uses `-Encoding Byte`); `Remove-Item -Recurse` behavior differs on reparse points

Default encodings also differ: 5.1 cmdlets emit ANSI or UTF-16LE depending on the cmdlet, 6+ emits UTF-8 without BOM. Always pass `-Encoding` explicitly when a file is consumed by anything else.

5.1 additionally ships older `Invoke-WebRequest` behavior that depends on Internet Explorer engine availability; use `-UseBasicParsing` on 5.1 for any unattended request.

## Migration semantics

Confirm behavior before replacing MSOnline, AzureAD, `wmic`, or legacy WMI. Microsoft Graph replacements must preserve authentication, scopes, paging, schema, filtering, mutation, and error behavior. Name-level equivalence is not behavioral equivalence: Graph cmdlets page by default where the old modules returned complete sets, and `-All` is required to match prior results.

## Modules and dependencies

Use modules, galleries, cloud APIs, REST, and CI only when the contract requires them. Pin or otherwise control dependencies when the repository does so. Never silently install modules or package providers. Under 5.1, `Install-Module` may also require a TLS 1.2 opt-in and an updated PowerShellGet, both of which change the technician's environment and need approval.

## Shell boundaries

Treat Windows PowerShell, `pwsh`, `powershell.exe`, Git Bash/MSYS, WSL, and `cmd.exe` as separate boundaries with their own quoting, path translation, encodings, environment inheritance, and exit-code semantics. Git Bash rewrites arguments that look like POSIX paths. WSL does not share the Windows filesystem semantics a script assumes. Crossing a boundary is a contract change, not an implementation detail.
