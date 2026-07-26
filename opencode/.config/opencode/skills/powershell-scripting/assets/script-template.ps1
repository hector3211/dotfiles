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
    Exit codes: 0 = completed or already compliant; 1 = failure.
    Verbose output: add -Verbose to the script parameters field when
    troubleshooting. It is off unless a technician passes it, so the default
    output is written to stand on its own.
#>

[CmdletBinding()]
param(
    [AllowEmptyString()]
    [string]$ExampleParameter
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

function Write-Log {
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Message,

        [ValidateSet('Info', 'Warning', 'Error', 'Verbose')]
        [string]$Level = 'Info'
    )

    <#
    This is the single RMM output surface. Never pass secrets, credential objects, or raw exceptions.
    Info is one line per meaningful found, changed, or verified outcome with no banners, narration, or echoed inputs.
    Error is one concise host line; the caller sets the exit code.
    Verbose is diagnostics and is assumed off.
    #>
    switch ($Level) {
        'Info' { Write-Host $Message } # RMM hosts reliably capture host output.
        'Warning' { Write-Warning $Message }
        'Error' { Write-Host "ERROR: $Message" }
        'Verbose' { Write-Verbose $Message }
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
    # Write-Log -Message 'Completed.'
    # exit 0
}
catch {
    Write-Log -Level Error -Message 'Script failed. Run again with -Verbose for diagnostic context.'
    # Log raw exception messages only after proving they cannot contain secrets or input values.
    # Write-Log -Level Verbose -Message $_.Exception.Message
    # Add task-specific sanitized verbose detail here only when it is safe.
    Write-Log -Level Verbose -Message "Exception type: $($_.Exception.GetType().FullName); script line: $($_.InvocationInfo.ScriptLineNumber)"
    exit 1
}
finally {
    # Clean up temporary files, sessions, and mounts on success, failure, or early exit.
}
