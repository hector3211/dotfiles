#Requires -Version 5.1

<#
.SYNOPSIS
    Performs the requested automation.

.DESCRIPTION
    Reaches the intended outcome, reports when the system is already compliant, and verifies the final state.

.PARAMETER ExampleParameter
    Example value for the requested operation. Omitted or blank values are intentionally validated inside script control flow so those validation outcomes do not bypass stable error-output and exit-code handling. Other parameter-binding failures still occur before script control flow.

.EXAMPLE
    .\Set-Example.ps1 -ExampleParameter 'Value'
    Applies the requested change and verifies the final state.

.NOTES
    Author: <replace-with-author>
    Exit codes: 0 = completed or already compliant; 1 = failure;
    3010 = completed, reboot required. Emit 3010 only when the tenant
    automation contract defines it; otherwise report the pending reboot in
    output and exit 0. Delete the reboot path entirely if this script cannot
    require one.
    Do not raise #Requires -Version above 5.1 based on the development host.
#>

[CmdletBinding()]
param(
    # Deliberately unvalidated at bind time. See .PARAMETER and the check inside try.
    [string]$ExampleParameter
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

# Set to $true by any change that requires a reboot to reach the final state.
$script:RebootRequired = $false

function Write-Log {
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Message,

        [ValidateSet('Info', 'Warning', 'Error')]
        [string]$Level = 'Info'
    )

    <#
    This is the single RMM output surface. Never pass secrets, credential objects, or raw exceptions.
    Info is one line per meaningful found, changed, or verified outcome with no banners, narration, or echoed inputs.
    Error is one concise host line; the caller sets the exit code.

    Error deliberately writes to the host stream, not the error stream, because RMM
    consoles capture host output reliably and error records inconsistently. The
    tradeoff: a failing run leaves $Error and the error stream empty, so tests and CI
    must assert failure on the exit code. Do not "fix" this with Write-Error unless
    the delivery contract stops depending on RMM console capture.
    #>
    switch ($Level) {
        'Info' { Write-Host $Message }
        'Warning' { Write-Warning $Message }
        'Error' { Write-Host "ERROR: $Message" }
    }
}

try {
    if ([string]::IsNullOrWhiteSpace($ExampleParameter)) {
        Write-Log -Level Error -Message 'ExampleParameter is required.'
        exit 1
    }

    # Detect desired state and exit early when already compliant.
    # Perform the required change.
    # Verify final state.
    Write-Log -Level Error -Message 'Template is incomplete; implement the required change and final-state verification before deployment.'
    exit 1

    # Replace the two lines above with the verified success path:
    #
    # if ($script:RebootRequired) {
    #     Write-Log -Message 'Completed; reboot required to reach the final state.'
    #     exit 3010
    # }
    #
    # Write-Log -Message 'Completed.'
    # exit 0
}
catch {
    # Replace with the specific failure and whether any change was applied.
    # Do not tell the technician to re-run: a partially applied change makes that unsafe.
    Write-Log -Level Error -Message 'Script failed; final state was not verified.'
    exit 1
}
finally {
    # Clean up temporary files, sessions, and mounts on success, failure, or early exit.
}
