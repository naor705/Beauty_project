@echo off
REM Beauty Researcher — start the in-app cron scheduler.
REM Schedule is read from .env (RESEARCH_CRON, REPORT_CRON). Edit those to change timing.
REM Keeps this window open as long as the scheduler is running. Close to stop.
cd /d "%~dp0"

if not exist node_modules\ call npm install
if not exist data\beauty_research.db call npm run db:init

echo Scheduler starting. Press Ctrl+C or close this window to stop.
echo Edit .env (RESEARCH_CRON, REPORT_CRON) to change schedule, then restart.
echo.
call npm run scheduler
