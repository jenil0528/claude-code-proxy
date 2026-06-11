@echo off
setlocal enabledelayedexpansion

:: ═══════════════════════════════════════════════════════════════
:: BlitzProxy — One Command To Rule Them All
::
::   blitz              → Start proxy + launch Claude Code
::   blitz add <key>    → Add an API key
::   blitz keys         → List saved keys
::   blitz switch <n>   → Switch active key
::   blitz rm <n>       → Delete a key
::   blitz status       → Show config
::   blitz help         → Show help
:: ═══════════════════════════════════════════════════════════════

set "BLITZ_DIR=%~dp0"

:: If no arguments → start proxy + claude
if "%~1"=="" goto :start_proxy

:: If first arg is a CLI command → route to cli.js
set "CMD=%~1"
if /i "%CMD%"=="add"       goto :cli
if /i "%CMD%"=="keys"      goto :cli
if /i "%CMD%"=="list"      goto :cli
if /i "%CMD%"=="switch"    goto :cli
if /i "%CMD%"=="use"       goto :cli
if /i "%CMD%"=="rm"        goto :cli
if /i "%CMD%"=="remove"    goto :cli
if /i "%CMD%"=="delete"    goto :cli
if /i "%CMD%"=="model"     goto :cli
if /i "%CMD%"=="provider"  goto :cli
if /i "%CMD%"=="providers" goto :cli
if /i "%CMD%"=="test"      goto :cli
if /i "%CMD%"=="status"    goto :cli
if /i "%CMD%"=="logs"      goto :cli
if /i "%CMD%"=="log"       goto :cli
if /i "%CMD%"=="help"      goto :cli
if /i "%CMD%"=="--help"    goto :cli
if /i "%CMD%"=="-h"        goto :cli

:: Unknown command — show help
goto :cli

:: ─── CLI commands (key management) ──────────────────────────────────────────
:cli
node "%BLITZ_DIR%cli.js" %*
goto :eof

:: ─── Start proxy + Claude Code ──────────────────────────────────────────────
:start_proxy

:: Ensure env vars are set for this session
set "ANTHROPIC_BASE_URL=http://localhost:4819"
set "ANTHROPIC_API_KEY=blitz"

echo.
echo   ══════════════════════════════════════════════
echo    ⚡ BlitzProxy — Starting...
echo   ══════════════════════════════════════════════
echo.

:: Start the proxy server in the background
start "BlitzProxy" /min cmd /c "node "%BLITZ_DIR%server.js""

:: Give the proxy a moment to initialize
timeout /t 2 /nobreak >nul

:: Launch Claude Code
echo   ⚡ Proxy running at http://localhost:4819
echo.
echo   Launching Claude Code...
echo.

claude

goto :eof
