@echo off
setlocal enabledelayedexpansion

title Port Killer - Native Messaging Host Installer

echo ========================================================
echo   PORT KILLER - WINDOWS NATIVE HOST INSTALLER
echo ========================================================
echo.

:: 1. Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in PATH!
    echo Please install Node.js from https://nodejs.org and restart your terminal.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VERSION=%%v
echo [OK] Detected Node.js: %NODE_VERSION%

:: 2. Set Paths
set "CURRENT_DIR=%~dp0"
:: Get absolute path to host folder
pushd "%CURRENT_DIR%..\host"
set "HOST_DIR=%CD%"
popd

set "MANIFEST_FILE=%HOST_DIR%\com.portkiller.host.json"
set "BAT_FILE=%HOST_DIR%\run_host.bat"

:: Escape backslashes for JSON
set "ESCAPED_BAT=%BAT_FILE:\=\\%"

echo [OK] Host directory: %HOST_DIR%
echo [OK] Host launcher:  %BAT_FILE%
echo.

:: 3. Get Chrome Extension ID
set "DEFAULT_EXT_ID=ichfobjkfepeegfckcndecpdjhekdnpf"
set "EXT_ID=%~1"
if "%EXT_ID%"=="" (
    echo Please load the unpacked extension in Chrome first:
    echo  1. Open chrome://extensions (or brave://extensions)
    echo  2. Enable "Developer mode"
    echo  3. Click "Load unpacked" and select the "extension\dist" folder
    echo  4. Copy the Extension ID (a 32-character lowercase string)
    echo.
    echo Default Extension ID: %DEFAULT_EXT_ID%
    set /p "EXT_ID=Enter your Chrome Extension ID [Enter de dung mac dinh]: "
)

if "%EXT_ID%"=="" (
    set "EXT_ID=%DEFAULT_EXT_ID%"
)

:: Trim spaces if any
set "EXT_ID=%EXT_ID: =%"

echo.
echo [CONFIG] Using Extension ID: %EXT_ID%
echo.

:: 4. Write com.portkiller.host.json with exact paths and Extension ID
echo [INFO] Generating host manifest: %MANIFEST_FILE%
(
    echo {
    echo   "name": "com.portkiller.host",
    echo   "description": "Port Killer Windows Native Messaging Host",
    echo   "path": "%ESCAPED_BAT%",
    echo   "type": "stdio",
    echo   "allowed_origins": [
    echo     "chrome-extension://%EXT_ID%/"
    echo   ]
    echo }
) > "%MANIFEST_FILE%"

if not exist "%MANIFEST_FILE%" (
    echo [ERROR] Could not create manifest file!
    pause
    exit /b 1
)
echo [OK] Host manifest generated successfully.

:: 5. Add Windows Registry Keys
:: We register for Google Chrome, Brave Browser, and Microsoft Edge
echo.
echo [INFO] Registering Native Messaging Host in Windows Registry...

:: Google Chrome
reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.portkiller.host" /ve /t REG_SZ /d "%MANIFEST_FILE%" /f >nul 2>nul
if %errorlevel% equ 0 (
    echo  [+] Registered for Google Chrome
) else (
    echo  [-] Failed to register for Google Chrome
)

:: Brave Browser
reg add "HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.portkiller.host" /ve /t REG_SZ /d "%MANIFEST_FILE%" /f >nul 2>nul
if %errorlevel% equ 0 (
    echo  [+] Registered for Brave Browser
) else (
    echo  [-] Could not register for Brave (might not be installed or permission issue)
)

:: Microsoft Edge (Chromium)
reg add "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.portkiller.host" /ve /t REG_SZ /d "%MANIFEST_FILE%" /f >nul 2>nul
if %errorlevel% equ 0 (
    echo  [+] Registered for Microsoft Edge
) else (
    echo  [-] Could not register for Edge
)

echo.
echo ========================================================
echo   INSTALLATION COMPLETED SUCCESSFULLY!
echo ========================================================
echo Host name: com.portkiller.host
echo Manifest:  %MANIFEST_FILE%
echo Allowed:   chrome-extension://%EXT_ID%/
echo.
echo You can now open the Port Killer extension in your browser!
echo ========================================================
echo.
pause

