@echo off
title BlitzProxy
echo.

:: Check Node.js
node -v >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js is not installed!
    echo  Please install Node.js 18+ from https://nodejs.org
    pause
    exit /b 1
)

:: Check if .env exists
if not exist ".env" (
    if exist ".env.example" (
        copy .env.example .env >nul
        echo  [INFO] Created .env — paste your API key and restart!
        notepad .env
        pause
        exit /b 0
    )
)

:: Check if setup was done (permanent env vars)
if "%ANTHROPIC_BASE_URL%"=="" (
    echo  [WARN] Run setup.bat first for one-time setup!
    echo         Or set env vars manually:
    echo         $env:ANTHROPIC_BASE_URL = "http://localhost:4819"
    echo         $env:ANTHROPIC_API_KEY = "blitz"
    echo.
)

echo  Starting BlitzProxy...
echo  Press Ctrl+C to stop.
echo.

node server.js
