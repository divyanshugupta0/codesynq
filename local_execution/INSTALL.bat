@echo off
setlocal EnableDelayedExpansion
title CodeSynq Local Execution - Setup
color 0B

echo.
echo  ============================================================
echo       CodeSynq Local Execution Service - INSTALLER
echo.
echo       Automatic setup with language support detection
echo  ============================================================
echo.

cd /d "%~dp0"

:: ============================================================
:: 1. Check and Install Node.js (REQUIRED)
:: ============================================================
echo  [1/6] Checking Node.js (Required)...
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo        Node.js not found. Downloading...
    
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.10.0/node-v20.10.0-x64.msi' -OutFile '%TEMP%\node_installer.msi'" 2>nul
    
    if exist "%TEMP%\node_installer.msi" (
        echo        Installing Node.js silently...
        msiexec /i "%TEMP%\node_installer.msi" /qn /norestart
        set "PATH=%PATH%;C:\Program Files\nodejs"
        echo        [OK] Node.js installed!
    ) else (
        echo        [ERROR] Could not download Node.js
        echo        Please install manually from: https://nodejs.org/
        pause
        exit /b 1
    )
) else (
    for /f "tokens=*" %%v in ('node -v') do echo        [OK] Node.js %%v found
)

:: ============================================================
:: 2. Check Python (Optional - for Python execution)
:: ============================================================
echo  [2/6] Checking Python...
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo        Python not found.
    set /p installPython="        Install Python automatically? (Y/N): "
    if /i "!installPython!"=="Y" (
        echo        Downloading Python 3.12...
        powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.12.0/python-3.12.0-amd64.exe' -OutFile '%TEMP%\python_installer.exe'" 2>nul
        
        if exist "%TEMP%\python_installer.exe" (
            echo        Installing Python - this may take a minute...
            start /wait "" "%TEMP%\python_installer.exe" /quiet InstallAllUsers=1 PrependPath=1 Include_test=0
            echo        [OK] Python installed!
            set "PATH=%PATH%;C:\Program Files\Python312;C:\Program Files\Python312\Scripts"
        ) else (
            echo        [SKIP] Could not download. Install manually from python.org
        )
    ) else (
        echo        [SKIP] Python not installed - Python execution will not work
    )
) else (
    for /f "tokens=*" %%v in ('python --version 2^>^&1') do echo        [OK] %%v found
)

:: ============================================================
:: 3. Check Java (Optional - for Java execution)
:: ============================================================
echo  [3/6] Checking Java...
where java >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo        Java not found.
    set /p installJava="        Install Java OpenJDK automatically? (Y/N): "
    if /i "!installJava!"=="Y" (
        echo        Downloading OpenJDK 21...
        powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://download.java.net/java/GA/jdk21.0.1/415e3f918a1f4062a0074a2794853d0d/12/GPL/openjdk-21.0.1_windows-x64_bin.zip' -OutFile '%TEMP%\openjdk.zip'" 2>nul
        
        if exist "%TEMP%\openjdk.zip" (
            echo        Extracting Java...
            powershell -Command "Expand-Archive -Path '%TEMP%\openjdk.zip' -DestinationPath 'C:\Program Files\Java' -Force" 2>nul
            setx JAVA_HOME "C:\Program Files\Java\jdk-21.0.1" /M >nul 2>&1
            set "PATH=%PATH%;C:\Program Files\Java\jdk-21.0.1\bin"
            echo        [OK] Java installed to C:\Program Files\Java
        ) else (
            echo        [SKIP] Could not download. Install manually from java.com
        )
    ) else (
        echo        [SKIP] Java not installed - Java execution will not work
    )
) else (
    for /f "tokens=3" %%v in ('java -version 2^>^&1 ^| findstr /i "version"') do echo        [OK] Java %%v found
)

:: ============================================================
:: 4. Check GCC/G++ (Optional - for C/C++ execution)
:: ============================================================
echo  [4/6] Checking GCC/G++ MinGW...
where gcc >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo        GCC not found.
    echo        [INFO] For C/C++ support, install MinGW from: https://winlibs.com/
    echo        [SKIP] Skipping GCC installation - C/C++ execution will not work
) else (
    for /f "tokens=1-4" %%a in ('gcc --version 2^>^&1 ^| findstr /i "gcc"') do echo        [OK] GCC found
)

:: ============================================================
:: 5. Install CodeSynq Local Execution Service
:: ============================================================
echo  [5/6] Installing CodeSynq Local Service...
set INSTALL_DIR=%LOCALAPPDATA%\CodeSynq\LocalExecution
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
xcopy /Y /E /I "%~dp0*.*" "%INSTALL_DIR%\" >nul 2>&1
echo        Files installed to: %INSTALL_DIR%

:: Create silent startup script
set STARTUP_SCRIPT=%INSTALL_DIR%\start-silent.vbs
echo Set WshShell = CreateObject("WScript.Shell") > "%STARTUP_SCRIPT%"
echo WshShell.Run chr(34) ^& "%INSTALL_DIR%\start-service.bat" ^& chr(34), 0 >> "%STARTUP_SCRIPT%"
echo Set WshShell = Nothing >> "%STARTUP_SCRIPT%"

:: Add to startup registry
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "CodeSynqLocal" /t REG_SZ /d "\"%STARTUP_SCRIPT%\"" /f >nul 2>&1
echo        Added to Windows startup

:: Create desktop shortcut with icon
set ICON_PATH=%INSTALL_DIR%\codesynq.ico
powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%USERPROFILE%\Desktop\CodeSynq Local Service.lnk'); $Shortcut.TargetPath = '%INSTALL_DIR%\start-service.bat'; $Shortcut.WorkingDirectory = '%INSTALL_DIR%'; $Shortcut.IconLocation = '%ICON_PATH%,0'; $Shortcut.Description = 'Start CodeSynq Local Execution Service'; $Shortcut.Save()" 2>nul
echo        Desktop shortcut created

:: ============================================================
:: 6. Start the service
:: ============================================================
echo  [6/6] Starting service...

:: Kill any existing instance
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3001" ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)

:: Start service silently
start "" /B wscript.exe "%STARTUP_SCRIPT%"
timeout /t 3 /nobreak >nul

:: Verify
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3001" ^| findstr "LISTENING"') do (
    echo        [OK] Service is running on port 3001
    goto :success
)
echo        Service starting...

:success
echo.
echo  ============================================================
echo.
echo  INSTALLATION COMPLETE!
echo.
echo  The service is now running and will start automatically
echo  with Windows.
echo.
echo  Language Support:
where node >nul 2>&1 && echo    [OK] JavaScript - Ready || echo    [--] JavaScript - Not available
where python >nul 2>&1 && echo    [OK] Python     - Ready || echo    [--] Python - Not installed
where java >nul 2>&1 && echo    [OK] Java       - Ready || echo    [--] Java - Not installed  
where gcc >nul 2>&1 && echo    [OK] C/C++      - Ready || echo    [--] C/C++ - Not installed
echo.
echo  Next steps:
echo    1. Close this window
echo    2. Refresh CodeSynq in your browser
echo    3. Local execution will connect automatically
echo.
echo  To uninstall: Run Uninstall.bat
echo.
echo  ============================================================
echo.
pause
