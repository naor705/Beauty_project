# Removes the BeautyResearcher_Scheduler task from Windows Task Scheduler.
# Safe to run even if the task doesn't exist.

$taskName = "BeautyResearcher_Scheduler"
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($null -eq $existing) {
    Write-Host "Task '$taskName' is not registered. Nothing to do." -ForegroundColor Yellow
    exit 0
}

Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
Write-Host "Removed scheduled task: $taskName" -ForegroundColor Green
