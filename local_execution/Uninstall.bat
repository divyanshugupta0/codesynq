@echo off
setlocal EnableDelayedExpansion
title CodeSynq Local Execution - Uninstaller
color 0C

echo.
echo  ============================================================
echo       CodeSynq Local Execution Service - Uninstaller
echo  ============================================================
echo.

set INSTALL_DIR=%LOCALAPPDATA%\CodeSynq\LocalExecution

echo  This will:
echo    - Stop the running service
echo    - Remove from Windows startup
echo    - Delete all installed files
echo    - Remove desktop shortcut
echo.
set /p confirm="  Are you sure you want to uninstall? (Y/N): "
if /i not "%confirm%"=="Y" (
    echo.
    echo  Uninstall cancelled.
    timeout /t 2 >nul
    exit /b 0
)

echo.
echo  [1/5] Stopping service...

:: Kill any running instance on port 3001
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3001" ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
    echo        Service stopped.
)

echo  [2/5] Removing from Windows startup...

:: Remove from startup registry
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "CodeSynqLocal" /f >nul 2>&1

:: Remove startup shortcut if exists
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\CodeSynq Local Service.lnk" >nul 2>&1
echo        Startup entry removed.

echo  [3/5] Removing desktop shortcut...

:: Remove desktop shortcut
del "%USERPROFILE%\Desktop\CodeSynq Local Service.lnk" >nul 2>&1
echo        Desktop shortcut removed.

echo  [4/5] Deleting installed files...

:: Delete installation directory
if exist "%INSTALL_DIR%" (
    rmdir /S /Q "%INSTALL_DIR%" >nul 2>&1
    echo        Installation directory deleted.
) else (
    echo        No installation directory found.
)

:: Clean up CodeSynq folder if empty
if exist "%LOCALAPPDATA%\CodeSynq" (
    rmdir "%LOCALAPPDATA%\CodeSynq" >nul 2>&1
)

echo  [5/5] Cleaning up temp files...

:: Clean up temp execution files
if exist "%TEMP%\codesynq_local" (
    rmdir /S /Q "%TEMP%\codesynq_local" >nul 2>&1
)
echo        Temp files cleaned.

echo.
echo  ============================================================
echo.
echo  CodeSynq Local Execution Service has been uninstalled!
echo.
echo  Note: This uninstaller file will remain in the current folder.
echo  You can delete it manually if you extracted the ZIP here.
echo.

pause
