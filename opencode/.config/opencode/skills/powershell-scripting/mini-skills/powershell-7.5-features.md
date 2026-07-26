# PowerShell 7.5 and Later Features

Use when considering version-specific PowerShell 7.x functionality, including 7.5 and later. This supplements, and does not override, the main `powershell-scripting` skill's execution contract, simplicity, NinjaOne, validation, logging, reboot, or secret rules.

Do not assume any release is current, latest, LTS, or supported. At task time, verify current stable, LTS, preview status, lifecycle, and exact feature availability from authoritative Microsoft documentation and the actual host; check `$PSVersionTable`, `Get-Command`, and `Get-Help` before selecting a feature.

Candidates to assess include `ConvertTo-CliXml` and `ConvertFrom-CliXml`, `Test-Path` `OlderThan` or `NewerThan`, web cmdlet `OutFile` and `PassThru` behavior, path-resolution improvements, JSON handling, runtime performance, and PSResourceGet. Do not adopt a feature for novelty.

Add `#Requires` only when the execution contract deliberately requires that version. Otherwise use a clear compatible implementation. Do not use preview features in production unless explicitly requested and tested.
