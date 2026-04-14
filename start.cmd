@echo off
setlocal
cd /d "%~dp0"

if not exist node_modules (
  echo Dependencies are missing. Running npm install first...
  npm install || exit /b 1
)

npm start
