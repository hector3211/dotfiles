<#
.SYNOPSIS
    Briefly states what the script does.

.DESCRIPTION
    Describes the intended outcome, execution context, supported systems, and
    any important operational behavior.

.PARAMETER ExampleParameter
    Describes the parameter, accepted values, and default behavior. Remove this
    section when the script has no parameters.

.EXAMPLE
    .\script-template.ps1 -ExampleParameter 'Value'
    Describes the expected result.

.NOTES
    Requirements: Document the required PowerShell version, architecture,
    execution identity, deployment platform, and permissions.

    Author: Replace with the established project or organization author.
#>

[CmdletBinding()]
param(
    [string]$ExampleParameter
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Implement the requested automation here.
