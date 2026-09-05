@echo off
title Luminary Image Studio - Launcher
echo ======================================================
echo    Starting Luminary Image Studio...
echo ======================================================

where python >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo Launching with local Python HTTP server...
    python server.py
) else (
    echo Python not detected, opening index.html directly in your default browser...
    start "" index.html
)
pause
