<#
.SYNOPSIS
    Briefly states what the script does.

.DESCRIPTION
    Describes the intended outcome and important operational behavior.

.PARAMETER ExampleParameter
    Describes the parameter, accepted values, and default behavior. Remove
    this section when the script has no parameters.

.EXAMPLE
    .\script-template.ps1 -ExampleParameter 'Value'
    Describes the expected result.

.NOTES
    Author: <replace-with-author>
#>

[CmdletBinding()]
param(
    [string]$ExampleParameter
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Log {
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$Message,

        [ValidateSet('Info', 'Warning', 'Error', 'Verbose')]
        [string]$Level = 'Info'
    )

    # Never pass secrets to logging.
    switch ($Level) {
        'Info' { Write-Host $Message }
        'Warning' { Write-Warning $Message }
        'Error' { Write-Error -Message $Message -ErrorAction Continue }
        'Verbose' { Write-Verbose $Message }
    }
}

try {
    # Validate inputs and implement the requested automation here.
    Write-Log -Message 'Completed.'
}
catch {
    Write-Log -Level Error -Message 'Script failed.'
    exit 1
}
