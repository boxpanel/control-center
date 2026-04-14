#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/boxpanel/control-center.git}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/control-center}"

run_root() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

printf "\n==> Installing base packages\n"
run_root apt-get update
run_root apt-get install -y git curl ca-certificates gnupg

if [[ ! -d "$INSTALL_DIR/.git" ]]; then
  printf "\n==> Cloning repository into %s\n" "$INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
else
  printf "\n==> Updating repository in %s\n" "$INSTALL_DIR"
  git -C "$INSTALL_DIR" pull --ff-only
fi

printf "\n==> Running application installer\n"
chmod +x "$INSTALL_DIR/install.sh"
"$INSTALL_DIR/install.sh" --start
