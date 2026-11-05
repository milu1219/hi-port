@echo off
setlocal

title Port Killer - Uninstall Native Host

echo ========================================================
echo   PORT KILLER - UNINSTALL NATIVE HOST REGISTRY
echo ========================================================
echo.

:: Delete from Chrome
reg delete "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.portkiller.host" /f >nul 2>nul
if %errorlevel% equ 0 (
    echo [+] Removed from Google Chrome Registry
) else (
    echo [-] Google Chrome entry not found or already removed
)

:: Delete from Brave
reg delete "HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.portkiller.host" /f >nul 2>nul
if %errorlevel% equ 0 (
    echo [+] Removed from Brave Browser Registry
) else (
    echo [-] Brave entry not found or already removed
)

:: Delete from Edge
reg delete "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.portkiller.host" /f >nul 2>nul
if %errorlevel% equ 0 (
    echo [+] Removed from Microsoft Edge Registry
) else (
    echo [-] Edge entry not found or already removed
)

echo.
echo ========================================================
echo   UNINSTALLATION COMPLETE
echo ========================================================
pause

