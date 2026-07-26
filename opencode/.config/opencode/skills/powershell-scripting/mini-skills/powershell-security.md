# PowerShell Security

- Use NinjaOne secure values or credential facilities for RMM; account for NinjaOne SYSTEM execution. Use managed identity, workload identity, or an external vault for unattended cloud work. Use SecretManagement only with an existing suitable vault or an explicitly scoped vault setup. Never blindly use local SecretStore for SYSTEM or unattended execution.
- Reject injection risks and opaque command strings. Apply least privilege and validate trusted downloads, modules, and supply-chain controls when relevant. Consider code signing, JEA, WDAC or App Control, constrained language, audit policy, and script block logging only when applicable.
- For downloads and installers, validate the final HTTPS destination, including redirects; use a controlled staging path; set an explicit request or operation timeout; treat Content-Length only as an early rejection check; enforce the expected maximum byte size while streaming or writing the response, stopping and removing it at the limit; if the selected client or transport cannot enforce a trustworthy byte cap, use a controlled mechanism that can or reject the download; verify artifact publisher and/or vendor-published cryptographic hash from a separate trusted source as applicable; revalidate immediately before launch; then verify final installed state and cleanup.
- Never weaken TLS or certificate validation, log secrets, or place secrets in URLs or process arguments.
- Security reviews are findings-first, ordered by severity with file and line references. Do not change policy or hardening controls without explicit scope and rollback.

Verify current product behavior, support, module commands, and deprecations against authoritative Microsoft or vendor documentation at task time.
