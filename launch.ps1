<#
.SYNOPSIS
    CURA_SENSE / MigraGuard PowerShell Launcher
#>

[CmdletBinding()]
param(
    [switch]$Backend,
    [switch]$Frontend,
    [switch]$Merchant,
    [switch]$Support,
    [switch]$Demo,
    [switch]$TestWebhook,
    [switch]$Menu,
    [switch]$NoBrowser
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

$PythonExe = Join-Path $ScriptDir ".venv\Scripts\python.exe"
if (-not (Test-Path $PythonExe)) {
    $PythonExe = "python"
}

$Arguments = @()
if ($Backend) { $Arguments += "--backend" }
if ($Frontend) { $Arguments += "--frontend" }
if ($Merchant) { $Arguments += "--merchant" }
if ($Support) { $Arguments += "--support" }
if ($Demo) { $Arguments += "--demo" }
if ($TestWebhook) { $Arguments += "--test-webhook" }
if ($Menu) { $Arguments += "--menu" }
if ($NoBrowser) { $Arguments += "--no-browser" }

& $PythonExe "launch.py" @Arguments
