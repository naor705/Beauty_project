@echo off
REM Beauty Researcher — full pipeline with real Telegram approval.
REM Pipeline: Apify research -> Claude analysis -> Blotato render -> Telegram approval
REM (waits for your tap on the phone) -> schedule -> publish (DRY_RUN respected).
REM
REM Costs per run: Apify (~$0.10-0.30) + Anthropic (~$0.05) + 1 Blotato video render.
REM Requires: NOTIFY_CHANNEL=telegram and TELEGRAM_BOT_TOKEN/CHAT_ID set in .env.

cd /d "%~dp0"

if not exist node_modules\ (
    echo Installing dependencies for the first time...
    call npm install
    if errorlevel 1 goto :error
)

if not exist data\beauty_research.db (
    echo Initializing database...
    call npm run db:init
    if errorlevel 1 goto :error
)

call npm run cli -- telegram-demo
if errorlevel 1 goto :error

echo.
echo Done. Press any key to close.
pause >nul
exit /b 0

:error
echo.
echo Something went wrong. Press any key to close.
pause >nul
exit /b 1
