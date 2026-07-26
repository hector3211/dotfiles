# Input Validation

Validate data when it crosses a trust boundary: parameters, environment or RMM values, files, registry values, API responses, native output, and discovered resource identifiers. Internal constants do not need the same treatment.

## Practical Rules

- Decide whether missing, null, blank, `$false`, and `0` have different meanings. Check them explicitly when they do.
- Convert to the expected type once, then validate its range, format, length, or allowlist before use.
- Validate dependent or mutually exclusive inputs together before mutation.
- Revalidate identity and preconditions immediately before destructive or privileged work.

```powershell
if ([string]::IsNullOrWhiteSpace($env:TargetName)) {
    throw 'TargetName is required.'
}

$port = 0
if (-not [int]::TryParse($env:Port, [ref]$port) -or $port -lt 1 -or $port -gt 65535) {
    throw 'Port must be between 1 and 65535.'
}

if ($env:Mode -notin @('Audit', 'Apply')) {
    throw 'Mode must be Audit or Apply.'
}
```

## Strings, Paths, And URLs

- Use narrow formats or allowlists for identifiers such as GUIDs, service names, hostnames, and product codes.
- For a path, resolve it, require the expected root and kind, and use `-LiteralPath`. Do not combine untrusted values into a command string or executable path.
- Parse URLs with `[uri]`, then allowlist the scheme, host, port, and expected path scope before sending credentials or making a request. For HTTPS, `$uri.Port` is `443` for an omitted or explicit default port; allow another port only when the endpoint requires it.

```powershell
$enabled = $false
if (-not [bool]::TryParse($env:Enabled, [ref]$enabled)) {
    throw 'Enabled must be true or false.'
}

$uri = [uri]$env:ServiceUrl
$approvedPath = '/v1/'
if (
    -not $uri.IsAbsoluteUri -or
    $uri.Scheme -ne 'https' -or
    $uri.Host -ne 'api.example.com' -or
    -not [string]::IsNullOrEmpty($uri.UserInfo) -or
    $uri.Port -ne 443 -or
    -not $uri.AbsolutePath.StartsWith($approvedPath, [System.StringComparison]::Ordinal)
) {
    throw 'ServiceUrl is not an approved HTTPS endpoint.'
}
```

## Secrets

Validate secrets only for presence and reasonable size or representation. Never include their values in output, errors, verbose logs, URLs, process arguments, or persistent files. Prefer in-memory authentication APIs, headers, stdin, or an approved restricted secret file over process arguments.
