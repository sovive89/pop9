# Run in an elevated PowerShell after Node.js 20+ and dependencies are installed.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (!(Test-Path (Join-Path $root ".env"))) { throw "Configure print-server/.env before installing." }
$node = (Get-Command node -ErrorAction Stop).Source
$script = Join-Path $root "src\index.mjs"
$arguments = "--env-file=`"$(Join-Path $root '.env')`" `"$script`""
$action = New-ScheduledTaskAction -Execute $node -Argument $arguments -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "Pop9PrintServer" -Action $action -Trigger $trigger -Settings $settings -Description "POP9 local print agent" -Force | Out-Null
Write-Host "Task installed. Sign in to Windows to start the agent."
