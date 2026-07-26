# PowerShell 2025 Changes

Use for modernization and deprecated-technology migrations. This supplements, and does not override, the main `powershell-scripting` skill's execution contract, simplicity, NinjaOne, validation, logging, reboot, or secret rules.

Treat support dates, retirements, deprecations, commands, and vendor guidance as facts to verify at task time against current authoritative Microsoft or vendor documentation.

- Inventory existing technology and behavior before changing it. For MSOnline or AzureAD, map behavior to Microsoft Graph or supported Entra tooling only after verifying authentication, scopes or roles, paging, returned schema, identifiers, and write semantics.
- Replace `wmic.exe` and legacy WMI with suitable native cmdlets or CIM. Never use `Win32_Product` for software inventory because it can trigger MSI side effects; use registry, provider, or vendor inventory appropriate to the execution contract.
- When encountered, assess PowerShell 2 references or removal, PSSnapin-to-module migration, PSResourceGet versus PowerShellGet only on supported hosts, and `Test-Json` or schema compatibility.
- Inventory, verify current vendor status and documentation, map semantics, implement the smallest change, test with the actual identity and host, then update relevant documentation.

Preserve the host compatibility required by the contract. Do not default every migration to PowerShell 7 or assume cross-platform support.
