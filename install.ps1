param(
  [switch]$Start
)

$ErrorActionPreference = "Stop"

function Write-Step($text) {
  Write-Host ""
  Write-Host "==> $text" -ForegroundColor Cyan
}

function Assert-Command($name, $hint) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "$name is not installed. $hint"
  }
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Step "Checking runtime"
Assert-Command "node" "Please install Node.js 20+ from https://nodejs.org/"
Assert-Command "npm" "Please install Node.js 20+ from https://nodejs.org/"

$nodeVersionText = node -v
Write-Host "Node version: $nodeVersionText"

Write-Step "Creating app folders"
foreach ($dir in @("data", "uploads", "uploads\\ftp", "uploads\\plates", "streams")) {
  New-Item -ItemType Directory -Path (Join-Path $root $dir) -Force | Out-Null
}

Write-Step "Installing dependencies"
npm install

Write-Step "Installation complete"
Write-Host "Start command: npm start" -ForegroundColor Green
Write-Host "Quick start   : .\\start.cmd" -ForegroundColor Green

if ($Start) {
  Write-Step "Starting application"
  npm start
}
