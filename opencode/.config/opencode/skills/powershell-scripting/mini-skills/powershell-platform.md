# PowerShell Platform

This supplements, and does not override or expand, the main `powershell-scripting` skill.

- Detect the actual host, version, edition, architecture, OS, and child shell before choosing syntax, modules, or process behavior. Verify support, version, feature, and deprecation facts against current authoritative documentation and the actual host.
- Choose features compatible with every contracted host. Do not assume a current or latest PowerShell release, and do not add a compatibility path for an uncontracted host.
- Confirm migration semantics before replacing MSOnline, AzureAD, `wmic`, legacy WMI, or related tooling. Microsoft Graph replacements must preserve authentication, scopes, paging, schema, filtering, mutation, and error behavior. Use CIM where supported; never use `Win32_Product` for inventory.
- Use modules, galleries, cloud APIs, REST, and CI only when the contract requires them. Pin or otherwise control dependencies when the repository does so, and never silently install modules or package providers.
- Treat PowerShell, Windows PowerShell, `pwsh`, `powershell.exe`, Git Bash/MSYS, WSL, and `cmd.exe` as separate shell boundaries with their own quoting, paths, encodings, environment behavior, and exit codes.
- Use `$PSScriptRoot` and `Join-Path` for script-relative paths. Build explicit child-process argument arrays, inspect native exit codes, and verify the final state.
