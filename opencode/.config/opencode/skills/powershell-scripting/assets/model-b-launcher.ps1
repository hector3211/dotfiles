<#
.SYNOPSIS
    Launches a pinned PowerShell 7 target from Windows PowerShell 5.1.

.DESCRIPTION
    Model B reference launcher. Replace the organization path and both expected
    SHA-256 values before deployment. Do not pass secrets as arguments.

.NOTES
    Requirements: Windows PowerShell 5.1 or later on 64-bit Windows.
    Exit codes: propagates the target's exit code; uses 20 for launcher validation failure.
    Author: Replace with the project's established author.
#>

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$launcherFailureExitCode = 20
$approvedParent = 'C:\ProgramData\Company\Automation'
$targetPath = 'C:\ProgramData\Company\Automation\Target.ps1'
$expectedTargetSha256 = 'REPLACE_WITH_64_CHARACTER_SHA256'
$expectedPwshSha256 = 'REPLACE_WITH_64_CHARACTER_SHA256'

function Assert-NoReparseComponent {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$LiteralPath
    )

    $current = [System.IO.Path]::GetPathRoot($LiteralPath)
    $relative = $LiteralPath.Substring($current.Length)

    foreach ($component in $relative.Split([System.IO.Path]::DirectorySeparatorChar, [System.StringSplitOptions]::RemoveEmptyEntries)) {
        $current = Join-Path $current $component
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force
            if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "A reparse point is not allowed in the target path."
            }
        }
    }
}

function Assert-TrustedAcl {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$LiteralPath
    )

    $trustedSids = @(
        'S-1-5-18'
        'S-1-5-32-544'
        'S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464'
    )
    $acl = Get-Acl -LiteralPath $LiteralPath
    $ownerSid = $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value
    if ($trustedSids -notcontains $ownerSid) {
        throw 'A protected launcher path has an untrusted owner.'
    }

    $dangerousRights = [System.Security.AccessControl.FileSystemRights]::Write -bor
        [System.Security.AccessControl.FileSystemRights]::Modify -bor
        [System.Security.AccessControl.FileSystemRights]::FullControl -bor
        [System.Security.AccessControl.FileSystemRights]::Delete -bor
        [System.Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor
        [System.Security.AccessControl.FileSystemRights]::ChangePermissions -bor
        [System.Security.AccessControl.FileSystemRights]::TakeOwnership -bor
        [System.Security.AccessControl.FileSystemRights]0x10000000 -bor
        [System.Security.AccessControl.FileSystemRights]0x40000000

    foreach ($rule in $acl.Access) {
        if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow -or
            ($rule.PropagationFlags -band [System.Security.AccessControl.PropagationFlags]::InheritOnly) -ne 0 -or
            ($rule.FileSystemRights -band $dangerousRights) -eq 0) {
            continue
        }

        $ruleSid = $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
        if ($trustedSids -notcontains $ruleSid) {
            throw 'A protected launcher path permits untrusted modification or deletion.'
        }
    }
}

function Assert-TrustedAncestorAcls {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$LiteralPath
    )

    $trustedSids = @(
        'S-1-5-18'
        'S-1-5-32-544'
        'S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464'
    )
    $dangerousRights = [System.Security.AccessControl.FileSystemRights]::Delete -bor
        [System.Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor
        [System.Security.AccessControl.FileSystemRights]::ChangePermissions -bor
        [System.Security.AccessControl.FileSystemRights]::TakeOwnership -bor
        [System.Security.AccessControl.FileSystemRights]0x10000000 -bor
        [System.Security.AccessControl.FileSystemRights]0x40000000

    $current = [System.IO.Path]::GetPathRoot($LiteralPath)
    $ancestorPaths = New-Object 'System.Collections.Generic.List[string]'
    $ancestorPaths.Add($current)
    $components = $LiteralPath.Substring($current.Length).Split(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.StringSplitOptions]::RemoveEmptyEntries
    )

    foreach ($component in $components) {
        $current = Join-Path $current $component
        if (-not (Test-Path -LiteralPath $current -PathType Container)) {
            break
        }

        $ancestorPaths.Add($current)
    }

    foreach ($current in $ancestorPaths) {
        $acl = Get-Acl -LiteralPath $current
        $ownerSid = $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value
        if ($trustedSids -notcontains $ownerSid) {
            throw 'An ancestor has an untrusted owner.'
        }

        foreach ($rule in $acl.Access) {
            if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow -or
                ($rule.PropagationFlags -band [System.Security.AccessControl.PropagationFlags]::InheritOnly) -ne 0 -or
                ($rule.FileSystemRights -band $dangerousRights) -eq 0) {
                continue
            }

            $ruleSid = $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
            if ($trustedSids -notcontains $ruleSid) {
                throw 'An ancestor permits untrusted deletion or permission changes.'
            }
        }
    }
}

function Get-PortableExecutableMachine {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$LiteralPath
    )

    $stream = [System.IO.File]::Open(
        $LiteralPath,
        [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::Read,
        [System.IO.FileShare]::Read
    )
    $reader = New-Object System.IO.BinaryReader($stream)

    try {
        if ($reader.ReadUInt16() -ne 0x5A4D) {
            throw 'The PowerShell executable has an invalid DOS header.'
        }

        $stream.Position = 0x3C
        $peOffset = $reader.ReadInt32()
        $stream.Position = $peOffset
        if ($reader.ReadUInt32() -ne 0x00004550) {
            throw 'The PowerShell executable has an invalid PE header.'
        }

        return $reader.ReadUInt16()
    }
    finally {
        $reader.Dispose()
    }
}

function Assert-X64MicrosoftPowerShell {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$LiteralPath
    )

    if ((Get-PortableExecutableMachine -LiteralPath $LiteralPath) -ne 0x8664) {
        throw 'The PowerShell 7 executable is not x64.'
    }

    $signature = Get-AuthenticodeSignature -LiteralPath $LiteralPath
    if ($signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid -or
        $signature.SignerCertificate.Subject -notmatch '(?i)(^|,\s*)O=Microsoft Corporation(,|$)') {
        throw 'The x64 PowerShell 7 executable does not have the expected Microsoft signature.'
    }
}

try {
    if (-not [Environment]::Is64BitOperatingSystem) {
        throw 'This launcher requires 64-bit Windows.'
    }

    if ($expectedTargetSha256 -notmatch '^[A-Fa-f0-9]{64}$' -or
        $expectedPwshSha256 -notmatch '^[A-Fa-f0-9]{64}$') {
        throw 'Configure the pinned target and PowerShell SHA-256 values before deployment.'
    }

    $localMachine = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
        [Microsoft.Win32.RegistryHive]::LocalMachine,
        [Microsoft.Win32.RegistryView]::Registry64
    )
    try {
        $currentVersion = $localMachine.OpenSubKey('SOFTWARE\Microsoft\Windows\CurrentVersion', $false)
        if ($null -eq $currentVersion) {
            throw 'The 64-bit Windows CurrentVersion registry key is unavailable.'
        }
        try {
            $programFilesPath = [string]$currentVersion.GetValue('ProgramFilesDir', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
        }
        finally {
            $currentVersion.Dispose()
        }
    }
    finally {
        $localMachine.Dispose()
    }
    if ([string]::IsNullOrWhiteSpace($programFilesPath)) {
        throw 'The 64-bit Program Files path is unavailable.'
    }

    $pwshPath = Join-Path $programFilesPath 'PowerShell\7\pwsh.exe'

    $canonicalPwshPath = [System.IO.Path]::GetFullPath($pwshPath)
    $resolvedPwshPath = (Resolve-Path -LiteralPath $canonicalPwshPath -ErrorAction Stop).ProviderPath
    if (-not $resolvedPwshPath.Equals($canonicalPwshPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'The resolved PowerShell 7 path is outside the expected installation location.'
    }
    Assert-NoReparseComponent -LiteralPath $resolvedPwshPath
    Assert-TrustedAncestorAcls -LiteralPath (Split-Path -Parent $resolvedPwshPath)
    Assert-TrustedAcl -LiteralPath $resolvedPwshPath
    Assert-X64MicrosoftPowerShell -LiteralPath $resolvedPwshPath
    if (-not (Get-FileHash -LiteralPath $resolvedPwshPath -Algorithm SHA256).Hash.Equals(
            $expectedPwshSha256,
            [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'The PowerShell 7 hash does not match the pinned SHA-256.'
    }

    $canonicalParent = [System.IO.Path]::GetFullPath($approvedParent).TrimEnd('\')
    $canonicalTarget = [System.IO.Path]::GetFullPath($targetPath)
    $parentPrefix = $canonicalParent + [System.IO.Path]::DirectorySeparatorChar
    if (-not $canonicalTarget.StartsWith($parentPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'The target is outside the approved parent boundary.'
    }

    Assert-NoReparseComponent -LiteralPath $canonicalParent
    Assert-TrustedAncestorAcls -LiteralPath $canonicalParent
    $resolvedParent = (Resolve-Path -LiteralPath $canonicalParent -ErrorAction Stop).ProviderPath.TrimEnd('\')
    if (-not $resolvedParent.Equals($canonicalParent, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'The resolved approved parent does not match its canonical path.'
    }
    Assert-TrustedAcl -LiteralPath $resolvedParent

    Assert-NoReparseComponent -LiteralPath $canonicalTarget
    $resolvedTarget = (Resolve-Path -LiteralPath $canonicalTarget -ErrorAction Stop).ProviderPath
    if (-not $resolvedTarget.Equals($canonicalTarget, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'The resolved target does not match the canonical target path.'
    }

    Assert-TrustedAcl -LiteralPath $resolvedTarget

    $actualHash = (Get-FileHash -LiteralPath $resolvedTarget -Algorithm SHA256).Hash
    if (-not $actualHash.Equals($expectedTargetSha256, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'The target hash does not match the pinned SHA-256.'
    }

    # Revalidate the target immediately before launch.
    Assert-NoReparseComponent -LiteralPath $resolvedPwshPath
    Assert-TrustedAncestorAcls -LiteralPath (Split-Path -Parent $resolvedPwshPath)
    Assert-TrustedAcl -LiteralPath $resolvedPwshPath
    Assert-X64MicrosoftPowerShell -LiteralPath $resolvedPwshPath
    if (-not (Get-FileHash -LiteralPath $resolvedPwshPath -Algorithm SHA256).Hash.Equals(
            $expectedPwshSha256,
            [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'The PowerShell 7 executable changed before launch.'
    }
    Assert-TrustedAncestorAcls -LiteralPath $resolvedParent
    Assert-NoReparseComponent -LiteralPath $resolvedParent
    Assert-NoReparseComponent -LiteralPath $resolvedTarget
    Assert-TrustedAcl -LiteralPath $resolvedParent
    Assert-TrustedAcl -LiteralPath $resolvedTarget
    if (-not (Get-FileHash -LiteralPath $resolvedTarget -Algorithm SHA256).Hash.Equals(
            $expectedTargetSha256,
            [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'The target changed before launch.'
    }

    $pwshArguments = @(
        '-NoProfile'
        '-NonInteractive'
        '-ExecutionPolicy'
        'Bypass'
        '-File'
        $resolvedTarget
    )

    & $resolvedPwshPath @pwshArguments
    exit $LASTEXITCODE
}
catch {
    [Console]::Error.WriteLine('PowerShell 7 launcher validation failed. Run with verbose diagnostics only after confirming they cannot expose secrets.')
    Write-Verbose "Failure type: $($_.Exception.GetType().FullName)"
    exit $launcherFailureExitCode
}
