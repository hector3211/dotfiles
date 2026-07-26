# PowerShell Security

Use for security reviews and hardening. This supplements, and does not override, the main `powershell-scripting` skill's execution contract, simplicity, NinjaOne, validation, logging, reboot, or secret rules.

- Use NinjaOne secure values or credential facilities for RMM; use managed identity, workload identity, or an external vault for unattended cloud work. Use SecretManagement only with an existing suitable vault or an explicitly scoped vault setup. Never blindly use local SecretStore for SYSTEM or unattended execution.
- Reject injection risks and opaque command strings. Apply least privilege and validate trusted downloads, modules, and supply-chain controls when relevant. Consider code signing, JEA, WDAC or App Control, constrained language, audit policy, and script block logging only when applicable.
- For downloads and installers, validate the final HTTPS destination, including redirects; use a controlled staging path; verify artifact authenticity before execution with a trusted publisher signature and/or vendor-published cryptographic hash from a separate trusted source as applicable; revalidate immediately before launch; then verify final installed state and cleanup.
- Never weaken TLS or certificate validation, log secrets, or place secrets in URLs or process arguments.
- Security reviews are findings-first, ordered by severity with file and line references. Do not change policy or hardening controls without explicit scope and rollback.

Verify current product behavior, support, module commands, and deprecations against authoritative Microsoft or vendor documentation at task time.
