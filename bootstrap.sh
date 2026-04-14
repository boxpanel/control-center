#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="${REPO_URL:-https://github.com/boxpanel/control-center.git}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/control-center}"
SERVICE_NAME="${SERVICE_NAME:-control-center}"
SERVICE_PORT="${SERVICE_PORT:-3000}"
CLONED_FRESH=0

run_root() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

rollback() {
  local exit_code=$?
  printf "\n[ERROR] Bootstrap failed (exit code %s).\n" "$exit_code" >&2
  run_root systemctl stop "$SERVICE_NAME" >/dev/null 2>&1 || true
  run_root systemctl disable "$SERVICE_NAME" >/dev/null 2>&1 || true
  run_root rm -f "/etc/systemd/system/${SERVICE_NAME}.service" >/dev/null 2>&1 || true
  run_root systemctl daemon-reload >/dev/null 2>&1 || true
  if [[ "$CLONED_FRESH" -eq 1 && -d "$INSTALL_DIR" ]]; then
    printf "[ROLLBACK] Removing incomplete install directory: %s\n" "$INSTALL_DIR" >&2
    rm -rf "$INSTALL_DIR"
  fi
  exit "$exit_code"
}

trap rollback ERR

printf "\n==> Installing base packages\n"
run_root apt-get update
run_root apt-get install -y git curl ca-certificates gnupg

if [[ ! -d "$INSTALL_DIR/.git" ]]; then
  printf "\n==> Cloning repository into %s\n" "$INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
  CLONED_FRESH=1
else
  printf "\n==> Updating repository in %s\n" "$INSTALL_DIR"
  git -C "$INSTALL_DIR" pull --ff-only
fi

printf "\n==> Running application installer\n"
chmod +x "$INSTALL_DIR/install.sh"
"$INSTALL_DIR/install.sh" --enable-service --service-name "$SERVICE_NAME" --service-port "$SERVICE_PORT"
