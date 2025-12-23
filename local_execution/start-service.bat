@echo off
title CodeSynq Local Execution Service
color 0A

echo.
echo  ============================================================
echo       CodeSynq Local Execution Service
echo  ============================================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo  [ERROR] Node.js is not installed or not in PATH
    echo  Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Get the directory of this batch file
cd /d "%~dp0"

echo  [INFO] Starting local execution service...
echo.

:: Start the server
node local-server.js

:: If the server exits, pause so user can see any error messages
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  [ERROR] Service stopped unexpectedly
    pause
)
