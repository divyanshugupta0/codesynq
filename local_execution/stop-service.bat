@echo off
title Stop CodeSynq Local Service
color 0C

echo.
echo  Stopping CodeSynq Local Execution Service...
echo.

:: Kill node process running on port 3001
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001" ^| findstr "LISTENING"') do (
    echo  Found process with PID: %%a
    taskkill /PID %%a /F >nul 2>nul
    echo  [OK] Process terminated
)

echo.
echo  Service stopped.
echo.
timeout /t 2 >nul
