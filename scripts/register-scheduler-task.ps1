# Registers a Windows Scheduled Task that starts the Beauty Researcher cron
# scheduler at user login. The schedule itself (when research runs, when reports
# generate) is controlled by RESEARCH_CRON and REPORT_CRON in your .env file —
# this script only ensures the scheduler process is *running* so those crons fire.
#
# Run once: right-click → "Run with PowerShell" (or `pwsh ./scripts/register-scheduler-task.ps1`).
# Re-run safely; it'll overwrite the existing task.

$ErrorActionPreference = "Stop"

# The .bat lives one directory up from this script.
$projectRoot = Split-Path -Parent $PSScriptRoot
$batPath = Join-Path $projectRoot "run-scheduler.bat"

if (-not (Test-Path $batPath)) {
    Write-Error "run-scheduler.bat not found at $batPath. Run this script from inside the project."
    exit 1
}

$taskName = "BeautyResearcher_Scheduler"
$description = "Runs the Beauty Researcher in-app cron scheduler. Schedule controlled via .env (RESEARCH_CRON / REPORT_CRON)."

# Action: launch the .bat in a hidden cmd window so it doesn't pop up on login.
$action = New-ScheduledTaskAction `
    -Execute "cmd.exe" `
    -Argument "/c `"$batPath`"" `
    -WorkingDirectory $projectRoot

# Trigger: at user login. Add a 30-second delay so the network/credential manager are ready.
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$trigger.Delay = "PT30S"

# Run as the current user, hidden, do not stop on battery, retry once on failure.
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 1 `
    -RestartInterval (New-TimeSpan -Minutes 5) `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) ` # 0 = no time limit (long-running daemon)
    -Hidden

# Remove any prior registration so re-running this script is idempotent.
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask `
    -TaskName $taskName `
    -Description $description `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings | Out-Null

Write-Host ""
Write-Host "Registered scheduled task: $taskName" -ForegroundColor Green
Write-Host "  Trigger:     at user login (30s delay)"
Write-Host "  Project:     $projectRoot"
Write-Host "  Schedule:    controlled by RESEARCH_CRON and REPORT_CRON in .env"
Write-Host ""
Write-Host "Manage it via: taskschd.msc → Task Scheduler Library → BeautyResearcher_Scheduler"
Write-Host "Start it now (without waiting for next login):"
Write-Host "  Start-ScheduledTask -TaskName $taskName"
Write-Host "Stop it:"
Write-Host "  Stop-ScheduledTask -TaskName $taskName"
Write-Host "Remove it:"
Write-Host "  pwsh ./scripts/unregister-scheduler-task.ps1"
