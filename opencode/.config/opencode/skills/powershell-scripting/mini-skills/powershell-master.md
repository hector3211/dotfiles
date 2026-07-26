# PowerShell Extended Domain Routing

Use for concerns beyond the main skill's standalone-script baseline. This supplements, and does not override, the main `powershell-scripting` skill's execution contract, simplicity, NinjaOne, validation, logging, reboot, or secret rules.

- Choose a standalone script, advanced function, module, or CI workflow from real reuse and deployment needs. Keep standalone MSP scripts independent.
- For cross-platform work, module or gallery use, Microsoft Graph, Az or cloud modules, REST APIs, pipeline and object behavior, encoding, or CI/CD, inspect repository conventions and current authoritative module or vendor documentation.
- Pin or install dependencies only when required. Never silently install or update modules or tools on endpoints.
- Keep module architecture proportional: explicit exports and valid manifests when a module is warranted, without generic scaffolding or unnecessary abstractions.

Maintain only the host and platform compatibility the execution contract requires. Do not assume PowerShell 7 or cross-platform execution.
