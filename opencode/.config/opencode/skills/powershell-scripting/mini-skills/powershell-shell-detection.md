# PowerShell Shell Detection

Use for PowerShell host, platform, or shell boundaries. This supplements, and does not override, the main `powershell-scripting` skill's execution contract, simplicity, NinjaOne, validation, logging, reboot, or secret rules.

- Distinguish Windows PowerShell from `pwsh`, and PowerShell from Git Bash, MSYS2, WSL, and `cmd`. Prefer deployment configuration that invokes the intended host directly; do not add self-relaunch wrappers by default.
- Detect the PowerShell version with `$PSVersionTable`. Use `$IsWindows`, `$IsLinux`, and `$IsMacOS` only on hosts that support them; provide compatible alternatives when supporting Windows PowerShell 5.1.
- Address paths, environment variables, line endings, encoding, and child-shell invocation only at an actual shell boundary. For Git Bash or MSYS2 and WSL, consider `MSYSTEM`, `WSL_DISTRO_NAME`, and MSYS path conversion when relevant. Quote paths and construct arguments explicitly.
- Use `$PSScriptRoot` and `Join-Path` for script-relative paths. Do not require cross-shell adaptation unless the execution contract supports those shells.

Verify current host and platform behavior from supported-host documentation at task time, and preserve the compatibility required by the actual execution contract.
