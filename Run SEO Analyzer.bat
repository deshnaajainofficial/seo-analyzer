@echo off
setlocal

cd /d "%~dp0"

if "%PORT%"=="" set PORT=3000
set URL=http://localhost:%PORT%

echo Starting Auditline SEO Analyzer...
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Install Node.js from https://nodejs.org, then double-click this file again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing project dependencies. This may take a minute...
  call npm install
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

if not exist "%USERPROFILE%\AppData\Local\ms-playwright" (
  echo Installing Playwright Chromium browser...
  call npx playwright install chromium
)

echo.
echo Opening %URL%
start "" "%URL%"
echo.
echo Server is running at %URL%
echo Keep this window open while using the app.
echo Press Ctrl+C in this window to stop it.
echo.

call npm start

pause
