@echo off
title BlitzProxy — One-Time Setup
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   BlitzProxy — One-Time Setup            ║
echo  ║   You only need to run this ONCE!        ║
echo  ╚══════════════════════════════════════════╝
echo.

:: Check Node.js
node -v >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js is not installed!
    echo  Please install Node.js 18+ from https://nodejs.org
    echo.
    pause
    exit /b 1
)
echo  [OK] Node.js found.

:: Set permanent user environment variables
echo.
echo  Setting permanent environment variables...
echo.

setx ANTHROPIC_BASE_URL "http://localhost:4819" >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Failed to set ANTHROPIC_BASE_URL
    pause
    exit /b 1
)
echo  [OK] ANTHROPIC_BASE_URL = http://localhost:4819

setx ANTHROPIC_API_KEY "blitz" >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Failed to set ANTHROPIC_API_KEY
    pause
    exit /b 1
)
echo  [OK] ANTHROPIC_API_KEY  = blitz

:: Also set for current session
set "ANTHROPIC_BASE_URL=http://localhost:4819"
set "ANTHROPIC_API_KEY=blitz"

:: Add BlitzProxy dir to PATH so "blitz" works from anywhere
set "BLITZ_DIR=%~dp0"
set "BLITZ_DIR=%BLITZ_DIR:~0,-1%"

echo %PATH% | findstr /i /c:"%BLITZ_DIR%" >nul 2>&1
if errorlevel 1 (
    echo.
    echo  Adding BlitzProxy to system PATH...
    setx PATH "%PATH%;%BLITZ_DIR%" >nul 2>&1
    echo  [OK] "blitz" command now available everywhere
) else (
    echo  [OK] BlitzProxy already in PATH
)

echo.
echo  ========================================
echo   Setup Complete!
echo  ========================================
echo.
echo   How to use:
echo     blitz              Start proxy + Claude Code
echo     blitz add ^<key^>    Add an API key
echo     blitz keys         List saved keys
echo     blitz switch ^<n^>   Switch active key
echo     blitz rm ^<n^>       Delete a key
echo.
echo   Just type "blitz" from any terminal!
echo.
echo   NOTE: Close and reopen any existing terminals
echo   for the PATH change to take effect.
echo.
pause
