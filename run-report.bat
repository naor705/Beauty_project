@echo off
REM Beauty Researcher — generate the 3-day top-10 trend report
cd /d "%~dp0"

if not exist node_modules\ call npm install
if not exist data\beauty_research.db call npm run db:init

call npm run cli -- report
echo.
echo Done. Press any key to close.
pause >nul
