$ErrorActionPreference = "Stop"
Unregister-ScheduledTask -TaskName "Pop9PrintServer" -Confirm:$false
Write-Host "Pop9PrintServer scheduled task removed."
