@echo off
REM Beauty Researcher — single research pass across configured sources
cd /d "%~dp0"

if not exist node_modules\ call npm install
if not exist data\beauty_research.db call npm run db:init

call npm run cli -- research --include-optional
echo.
echo Done. Press any key to close.
pause >nul
