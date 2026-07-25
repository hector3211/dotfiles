# Input And Trust-Boundary Validation

Treat parameters, environment variables, RMM variables and custom fields, registry values, API responses, file content, native-process output, and discovered identifiers as untrusted until validated for their exact use.

## Validation Sequence

1. Inventory each input source, expected type, allowed format/range, sensitivity, and downstream use.
2. Apply strong parameter types and `ValidateSet`, `ValidateRange`, or `ValidatePattern` only when parameter-binding failure is compatible with the script's exit-code contract.
3. Perform semantic and cross-field checks in script control flow when failures must map to a documented code.
4. Reject missing, null, empty, or whitespace-only required strings. Bound string length and collection count before expensive parsing or iteration.
5. Trim, normalize, and parse once into a new value. Use only the normalized value afterward.
6. Validate again when data crosses into a more privileged or destructive operation, especially process execution, filesystem mutation, authenticated requests, or remote deletion.

## Types And Values

- Preserve distinctions among missing, null, blank, `$false`, and `0`. Do not use truthiness when those states have different meanings.
- Parse environment/RMM booleans with an explicit allowlist such as `'true'` and `'false'`; never cast an arbitrary nonempty string to `[bool]`.
- Parse numbers and dates with an explicit culture and exact format/range. Reject overflow, truncation, `NaN`, infinity, and ambiguous local time when relevant.
- Validate enums with an allowlist and reject unknown values rather than silently choosing a default.
- Validate IDs, GUIDs, hostnames, email/user identifiers, product codes, registry names, filenames, and service names against the narrow format required by the target system.
- For mutually exclusive or dependent parameters, reject conflicting and incomplete combinations before any mutation.

## URLs And Paths

- Parse URLs as absolute `System.Uri` values, then allowlist scheme, exact host, expected port, and separator-aware base-path boundary before requests or credentials are attached.
- URL-encode user-controlled path and query values. Never accept pre-encoded fragments as a substitute for validating their decoded meaning.
- For paths, require the expected path kind and root, canonicalize, enforce the approved parent boundary, and use `-LiteralPath`. Apply `privileged-filesystem.md` before privileged mutation, execution, logging, or cleanup.
- Do not combine untrusted values into executable paths, working directories, registry uninstall strings, or shell command text.

## Validation Attributes

- Keep `ValidateScript` deterministic, fast, and side-effect-free. Do not perform network calls, mutation, interactive work, or checks against changing external state during binding.
- Remember that parameter conversion and validation happen before script control flow. If the script promises a specific validation exit code, accept the raw representation and parse it explicitly inside the top-level boundary.
- Use common parameters such as `-Verbose`; do not define replacements that change normal PowerShell semantics.

## Secrets And Sensitive Data

- Validate secrets only for presence, expected representation, and a defensible maximum size. Avoid regex validation that echoes or transforms secret content.
- Never include a supplied sensitive value in validation errors, verbose output, exception text, URLs, process arguments, or telemetry.
- Do not enumerate the entire process environment during troubleshooting; it may contain live RMM credentials such as `NINJA_AGENT_PASSWORD`.
- Prefer in-memory APIs, approved authentication headers, stdin, or a vendor-supported restricted secret file over child-process arguments.

## External And Discovered Data

- Validate API schema, required properties, collection bounds, tenant/account identity, and resource identity before acting on a response.
- Validate native output and registry/file content independently of process success. Successful retrieval does not make returned data trustworthy.
- Require exactly one verified match before destructive work. Prefer stable immutable IDs over hostname, email, display name, or another mutable identifier.
- Recheck target identity and destructive preconditions immediately before mutation to reduce stale-state and replacement risk.

## Tests

Cover missing, null, blank, whitespace, malformed, oversized, boundary, overflow, valid false/zero, unknown enum, conflicting inputs, Unicode, control characters, traversal, ambiguous match, and valid input. Verify failures do not expose supplied secrets and return the documented code when the script contract promises one.
