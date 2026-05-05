@echo off
REM Beauty Researcher — full pipeline demo (research -> report -> generate -> approve -> publish)
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

call npm run cli -- demo
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
