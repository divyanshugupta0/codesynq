@echo off
title CodeSynq Local Service - Installer
color 0B

echo.
echo  ============================================================
echo       CodeSynq Local Execution Service - Installer
echo  ============================================================
echo.

:: Check for administrative privileges
net session >nul 2>&1
if %errorLevel% == 0 (
    echo  [INFO] Running with administrative privileges...
) else (
    echo  [WARNING] Not running as administrator. 
    echo  Shortcut creation and startup registration might require admin rights.
    echo.
)

:: Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo  [ERROR] Node.js is not found!
    echo  The local execution engine REQUIRES Node.js to run.
    echo  Please install it from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo  [INFO] Launching visual setup tool...
echo.

:: Start the HTA setup
start "" "Setup.hta"

echo  [SUCCESS] Visual setup tool opened.
echo  Please follow the instructions in the window to complete installation.
echo.
timeout /t 5
exit
