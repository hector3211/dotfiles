# PowerShell Security

Deep security detail. Secret handling is defined in `SKILL.md` and is not restated here.

## Secret sources for unattended execution

- RMM work uses the platform's secure values or credential facilities. Account for SYSTEM execution: SYSTEM has no user profile, no mapped drives, and no per-user certificate or DPAPI store.
- Cloud work uses managed identity, workload identity, or an external vault. Do not carry a client secret in a script.
- SecretManagement is appropriate only with an existing suitable vault or an explicitly scoped vault setup. Never blindly use local SecretStore for SYSTEM or unattended execution: its default configuration requires an interactive password prompt, and configuring it passwordless makes the store readable by anything running as that account.
- `Export-Clixml` DPAPI encryption is user-and-machine scoped. A credential exported by a technician cannot be read by SYSTEM, and one exported by SYSTEM is readable by anything running as SYSTEM. Neither is a secret store.

## Downloads and installers

- Validate the final HTTPS destination, including every redirect hop.
- Stage into a controlled path, never a user-writable or world-writable location.
- Set an explicit request or operation timeout.
- Treat `Content-Length` as an early rejection check only. Enforce the expected maximum byte size while streaming or writing, stopping and removing the file at the limit.
- If the chosen client or transport cannot enforce a trustworthy byte cap, use one that can or reject the download.
- Verify the publisher, and the vendor-published cryptographic hash where one exists, obtained from a separate trusted source.
- Revalidate immediately before launch, then verify the final installed state and clean up.

```powershell
$signature = Get-AuthenticodeSignature -LiteralPath $stagedPath
if ($signature.Status -ne 'Valid') {
    throw 'Package signature is not valid.'
}
if ($signature.SignerCertificate.Subject -notlike '*O=Expected Vendor,*') {
    throw 'Package signer does not match the expected vendor.'
}
```

`Status -eq 'Valid'` alone only proves the file is signed by someone trusted by the machine. Pin the expected subject or thumbprint, and confirm the trust chain is one you intend to rely on.

## Injection and command construction

Reject opaque command strings. Never build a command line by concatenating an untrusted value, and never pass untrusted input to `Invoke-Expression`, `iex`, `cmd /c`, or a scriptblock built from a string. Build argument arrays and let the caller pass values as data.

Untrusted values reaching a path, filter, or query need the matching escape, not general sanitizing: LDAP filters, WMI/CIM query strings, and `-like` wildcards each have their own metacharacters.

## Privilege and hardening

Apply least privilege. Validate trusted downloads, modules, and supply-chain controls when relevant. Consider code signing, JEA, WDAC or App Control, constrained language mode, audit policy, and script block logging only when applicable to the contract.

Never weaken TLS or certificate validation, and never disable revocation checking, to make a request succeed. A certificate failure in unattended automation is a finding, not an obstacle.

Do not change policy or hardening controls without explicit scope and rollback.

## Security review output

Findings first, ordered by severity, with file and line references. State explicitly when there are no findings, and name residual risks and untested paths.

Verify current product behavior, support, module commands, and deprecations against authoritative Microsoft or vendor documentation at task time.
