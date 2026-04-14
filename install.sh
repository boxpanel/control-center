#!/usr/bin/env bash
set -euo pipefail

START_APP=0
if [[ "${1:-}" == "--start" ]]; then
  START_APP=1
fi

step() {
  printf "\n==> %s\n" "$1"
}

assert_command() {
  local name="$1"
  local hint="$2"
  if ! command -v "$name" >/dev/null 2>&1; then
    printf "%s is not installed. %s\n" "$name" "$hint" >&2
    exit 1
  fi
}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

step "Checking runtime"
assert_command node "Please install Node.js 20+ from https://nodejs.org/"
assert_command npm "Please install Node.js 20+ from https://nodejs.org/"
printf "Node version: %s\n" "$(node -v)"

step "Creating app folders"
mkdir -p data uploads uploads/ftp uploads/plates streams

step "Installing dependencies"
npm install

step "Installation complete"
printf "Start command: npm start\n"
printf "Quick start   : ./install.sh --start\n"

if [[ "$START_APP" == "1" ]]; then
  step "Starting application"
  npm start
fi
