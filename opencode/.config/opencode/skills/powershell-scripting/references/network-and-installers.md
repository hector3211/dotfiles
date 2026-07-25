# Network, APIs, And Installers

Bound all network and child-process operations below the configured RMM job timeout. Keep acquisition, trust validation, execution, and final-state verification as separate steps.

## Installation Preference Order

1. Use a suitable native or already-managed mechanism such as Windows servicing, an installed package manager, or a vendor-provided local updater.
2. Use `winget` only when it is available under the actual execution identity, the exact package ID and source are pinned, agreements are accepted non-interactively, and `winget.exe` is the expected Microsoft-signed App Installer binary.
3. Use a direct vendor download only when the managed options do not meet the deployment contract.

## Direct Download Sequence

1. Parse the download URL and allowlist HTTPS scheme, exact vendor host, expected port, and path boundary.
2. Set explicit connection/request timeouts. Follow redirects only when each destination is revalidated before credentials or content are sent.
3. Create a unique per-run staging directory beneath a controlled script-specific `ProgramData` parent.
4. Apply restrictive SYSTEM and Administrators ACLs and the checks in `privileged-filesystem.md`; reject pre-existing, attacker-writable, or reparse-point paths.
5. Download without executing. Never use `Invoke-Expression` or execute downloaded text.
6. Validate successful Authenticode status and the exact expected publisher for an executable, MSI, or script.
7. Validate a cryptographic hash when the vendor publishes one through a trustworthy channel independent of the payload.
8. Immediately before execution, revalidate canonical path, parent boundary, owner/ACL, reparse state, signature/publisher, and required hash.
9. Execute the validated absolute binary with separately constructed arguments, a bounded wait, and an explicit allowed-exit-code set.
10. Verify installed product/service/file/registry state independently before reporting success.
11. Clean up only revalidated paths created by the current run, including after failure, without following reparse points.

## Native Installers

- Treat executable success as an exit-code contract. `$ErrorActionPreference = 'Stop'` does not handle native failures; `$PSNativeCommandUseErrorActionPreference` can turn nonzero codes into errors before alternate success codes are inspected.
- Use `ProcessStartInfo.ArgumentList` under PowerShell 7 or another invocation API with unambiguous argument separation. Never concatenate variable data into a shell command string.
- For MSI, reconstruct a validated `msiexec.exe` invocation from a strictly validated MSI path or product code. Do not execute a registry uninstall string opaquely.
- Accept only documented outcomes. MSI `0` means success and `3010` means success with reboot required; all other accepted codes must be justified by vendor documentation.
- Record reboot-required state without rebooting from a NinjaOne custom script. The tenant automation must explicitly handle the chosen result code and invoke NinjaOne's native reboot automation separately.
- Verify desired state after a successful installer exit. Installer exit alone is insufficient proof.

## API Request Sequence

1. Parse and validate the base URI before attaching credentials: HTTPS, exact host, expected port, and base-path boundary.
2. Validate the configured expected tenant, organization, or account identifier.
3. Send credentials only through vendor-approved authentication headers or secure request bodies. Never place them in URI userinfo, paths, queries, logs, or redirect targets.
4. Disable automatic redirects for authenticated requests, or manually validate every redirect and never forward authentication across a changed scheme, host, port, or base-path boundary.
5. Set explicit request and overall operation timeouts below the job timeout.
6. Request only required fields and implement pagination whenever complete collection data affects safety or correctness.
7. Validate response status, media type, schema, collection bounds, tenant/account identity, and target resource identity before mutation.
8. Distinguish not-found, unauthorized/forbidden, rate-limited, timeout, transient server, conflict, and malformed-response outcomes when operator action differs.
9. Verify remote final state after mutation and verify both local and remote state when both were changed.

## Retries And Idempotency

- Retry only failures likely to be transient, commonly `408`, `429`, and selected `5xx` responses.
- Use capped exponential backoff with jitter, a strict attempt/elapsed-time bound, and a bounded valid `Retry-After` value.
- Retry reads and operations proven idempotent. Do not automatically retry create, delete, unenroll, or another mutation unless duplicate execution is safe or the API supports an idempotency key.
- Revalidate target identity and destructive preconditions before every mutation attempt.

## TLS And Certificates

- In PowerShell 7, use modern OS/.NET transport defaults. Do not mutate `[Net.ServicePointManager]::SecurityProtocol`; that legacy process-global Windows PowerShell pattern is not needed.
- Never bypass certificate validation, install permissive callbacks, suppress hostname checks, or force obsolete TLS protocols.
- Diagnose certificate chain, proxy, endpoint, clock, and OS policy failures rather than weakening transport security.

## Tests

Test redirects inside and outside the allowlist, certificate/signature/hash failure, timeout, partial download, unexpected content, every accepted installer code including `3010`, final-state mismatch, pagination, `429` and bounded `Retry-After`, exhausted retries, malformed JSON/schema, wrong tenant/resource, duplicate-mutation prevention, and cleanup after success and failure.
