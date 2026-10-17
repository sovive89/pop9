# Instala o POP9 Print Server como tarefa do Windows que liga junto com o computador
# (não precisa ninguém fazer login) e reinicia sozinha se cair.
# Rode no PowerShell como Administrador, dentro da pasta print-server, depois de:
#   1) instalar o Node.js 20 ou mais novo;  2) npm install;  3) configurar o arquivo .env;
#   4) testar com: npm run test-print
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env"
if (!(Test-Path $envFile)) { throw "Configure o arquivo print-server\.env antes de instalar." }
$node = (Get-Command node -ErrorAction Stop).Source
$script = Join-Path $root "src\index.mjs"
$logDir = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "print-server.log"
# cmd /c para gravar a saída num arquivo de log.
$arguments = "/c `"`"$node`" --env-file=`"$envFile`" `"$script`" >> `"$log`" 2>&1`""
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument $arguments -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName "Pop9PrintServer" -Action $action -Trigger $trigger -Settings $settings `
  -Principal $principal -Description "POP9 - impressao automatica das comandas" -Force | Out-Null
Start-ScheduledTask -TaskName "Pop9PrintServer"
Write-Host "Pop9PrintServer instalado e ligado. Log: $log"
