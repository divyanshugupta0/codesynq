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
    echo  [WARNING] Node.js is not found!
    echo  The setup tool will attempt to download and install it automatically.
    echo.
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
