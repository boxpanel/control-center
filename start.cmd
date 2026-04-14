@echo off
setlocal
cd /d "%~dp0"

if not exist node_modules (
  echo Dependencies are missing. Running install first...
  powershell -ExecutionPolicy Bypass -File ".\install.ps1" || exit /b 1
)

npm start
