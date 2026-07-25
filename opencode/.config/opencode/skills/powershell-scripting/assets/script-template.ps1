#Requires -Version 7.0

<#
.SYNOPSIS
    Applies one idempotent endpoint change under PowerShell 7.

.DESCRIPTION
    Production baseline for unattended Windows and NinjaOne automation. Replace
    the marked desired-state, operation, and verification sections.

.PARAMETER OperationTimeoutSeconds
    Maximum time allowed for a native child process. Keep this below the RMM job timeout.

.NOTES
    Requirements: x64 Windows, x64 PowerShell 7, and the deployment identity required by the operation.
    NinjaOne variables: document each consumed $env:<name>; treat every value as an untrusted string.
    Exit codes:
      0    Success or already compliant
      10   Input validation failed
      20   Unsupported architecture or execution context after PowerShell 7 starts
      30   Required operation failed or timed out
      40   Final-state verification failed
      3010 Success; reboot required. Use only when the tenant automation explicitly handles this code.
    An older host stops at #Requires before this script can return an exit code.
    Parser validation commands: references/deployment-models.md#parser-validation
    Author: Replace with the project's established author.
#>

[CmdletBinding()]
param(
    [string]$OperationTimeoutSeconds = '900'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSVersion -ge [version]'7.3') {
    $PSNativeCommandUseErrorActionPreference = $true
}

try {
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [Console]::OutputEncoding = $utf8NoBom
    $OutputEncoding = $utf8NoBom
}
catch {
    Write-Verbose "Console encoding could not be changed ($($_.Exception.GetType().FullName))."
}

$exitCode = 30

function Invoke-NativeProcess {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateScript({ [System.IO.Path]::IsPathFullyQualified($_) })]
        [string]$FilePath,

        [Parameter()]
        [string[]]$ArgumentList = @(),

        [Parameter(Mandatory)]
        [ValidateRange(1, 3600)]
        [int]$TimeoutSeconds
    )

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $FilePath
    $startInfo.UseShellExecute = $false

    foreach ($argument in $ArgumentList) {
        [void]$startInfo.ArgumentList.Add($argument)
    }

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo

    try {
        if (-not $process.Start()) {
            throw "Failed to start the required native process."
        }

        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            $process.Kill($true)
            if (-not $process.WaitForExit(5000)) {
                throw 'The timed-out native process did not terminate within five seconds.'
            }
            throw "The required native process exceeded the $TimeoutSeconds second timeout."
        }

        return $process.ExitCode
    }
    finally {
        $process.Dispose()
    }
}

function Invoke-Main {
    [CmdletBinding()]
    param()

    try {
        Write-Host 'Starting endpoint change.'

        if (-not [Environment]::Is64BitOperatingSystem -or -not [Environment]::Is64BitProcess) {
            [Console]::Error.WriteLine('This automation requires x64 Windows and an x64 PowerShell process.')
            return 20
        }

        # Validate and normalize all parameters and environment variables here.
        $parsedOperationTimeoutSeconds = 0
        $validTimeout = [int]::TryParse(
            $OperationTimeoutSeconds,
            [System.Globalization.NumberStyles]::Integer,
            [System.Globalization.CultureInfo]::InvariantCulture,
            [ref]$parsedOperationTimeoutSeconds
        )
        if (-not $validTimeout -or $parsedOperationTimeoutSeconds -lt 30 -or $parsedOperationTimeoutSeconds -gt 3300) {
            [Console]::Error.WriteLine('OperationTimeoutSeconds must be between 30 and 3300.')
            return 10
        }

        # Replace with an actual desired-state check.
        $alreadyCompliant = $false
        if ($alreadyCompliant) {
            Write-Host 'The endpoint is already compliant.'
            return 0
        }

        # Replace with the required operation. For an MSI, use a validated absolute
        # msiexec.exe path and separately constructed arguments, then allow 0 and 3010.
        # $nativeExitCode = Invoke-NativeProcess -FilePath $msiexecPath -ArgumentList $msiArguments -TimeoutSeconds $parsedOperationTimeoutSeconds
        $nativeExitCode = 0
        if ($nativeExitCode -notin 0, 3010) {
            throw "The required native process returned exit code $nativeExitCode."
        }
        $rebootRequired = $nativeExitCode -eq 3010

        # Replace with an independent final-state check.
        $verified = $true
        if (-not $verified) {
            [Console]::Error.WriteLine('The operation completed but final-state verification failed.')
            return 40
        }

        if ($rebootRequired) {
            Write-Host 'The change succeeded and a reboot is required. Use the native reboot automation.'
            return 3010
        }

        Write-Host 'The endpoint change succeeded and was verified.'
        return 0
    }
    catch {
        [Console]::Error.WriteLine('The endpoint change failed. Run with verbose diagnostics after confirming they cannot expose secrets.')
        Write-Verbose "Failure type: $($_.Exception.GetType().FullName)"
        return 30
    }
}

try {
    $exitCode = Invoke-Main
}
finally {
    # If the operation creates artifacts, implement cleanup here. Revalidate each
    # canonical path, approved boundary, ACL, and reparse state before removal.
}

exit $exitCode
