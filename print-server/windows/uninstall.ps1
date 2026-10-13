# Remove a tarefa do POP9 Print Server (rode no PowerShell como Administrador).
$ErrorActionPreference = "Stop"
Stop-ScheduledTask -TaskName "Pop9PrintServer" -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "Pop9PrintServer" -Confirm:$false
Write-Host "Pop9PrintServer removido."
