# Privileged Filesystem Operations

Apply this sequence to privileged create, overwrite, append, move, recursive delete, profile cleanup, payload staging, target launch, and persistent log writes. Also apply it whenever any path component comes from parameters, environment variables, the registry, an API, RMM data, files, or native output.

## Before Mutation

1. Define an immutable, absolute approved parent controlled by SYSTEM/Administrators.
2. Reject missing, relative, device, alternate-data-stream, and unexpected UNC paths unless explicitly required.
3. Canonicalize the candidate and nearest existing parent with filesystem-aware APIs.
4. Enforce a separator-aware parent boundary; never use a plain string-prefix check.
5. Inspect every existing path component and reject symbolic links, junctions, mount points, and other reparse points.
6. Validate expected owner and effective ACL. Reject locations writable by unprivileged users or attacker-controlled principals.
7. Use `-LiteralPath` for PowerShell filesystem cmdlets.

## During Sensitive Use

- Prefer a newly created, unique per-run directory under a script-specific `ProgramData` parent with restrictive SYSTEM and Administrators ACLs.
- Avoid privileged overwrite or append of an untrusted existing file.
- Account for hard links and replacement races where relevant; reject unexpected link counts when reliably available.
- Immediately before execution or replacement, revalidate canonical location, parent boundary, identity, owner, ACL, reparse state, expected signature, and required hash.
- Fail closed when PowerShell-level checks cannot provide the guarantees required by the operation. These checks reduce but cannot eliminate every time-of-check/time-of-use race.

## Downloads And Payloads

1. Use HTTPS with exact scheme/host/port/path allowlists and validate every redirect destination.
2. Download into the restricted per-run staging directory, never a user-writable temp directory for privileged execution.
3. Validate Authenticode status and exact expected publisher.
4. Validate a cryptographic hash when the vendor publishes it through an independent trusted channel.
5. Repeat signature and hash validation immediately before launch.

Never weaken certificate validation, execute downloaded text with `Invoke-Expression`, or run an unverified payload.

## Cleanup

- Track only paths created by the current run.
- Revalidate each cleanup target and approved boundary immediately before deletion.
- Never recursively follow reparse points.
- Never derive a cleanup root from untrusted data without repeating all canonicalization, boundary, owner/ACL, and reparse checks.
- Put required cleanup in `finally`; report cleanup failure without masking the primary result unless clean removal is itself a required outcome.

## Review Focus

- Canonical path and separator-aware boundary
- `-LiteralPath`
- Reparse component rejection
- Owner and ACL validation
- Attacker-writable location refusal
- Signature/hash revalidation
- Hard-link and replacement-race treatment where material
- Cleanup confined to revalidated paths
