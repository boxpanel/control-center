#!/usr/bin/env bash
set -euo pipefail

START_APP=0
ENABLE_SERVICE=0
SERVICE_NAME="${SERVICE_NAME:-control-center}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --start)
      START_APP=1
      ;;
    --enable-service)
      ENABLE_SERVICE=1
      ;;
    --service-name)
      shift
      SERVICE_NAME="${1:-control-center}"
      ;;
    *)
      printf "Unknown option: %s\n" "$1" >&2
      exit 1
      ;;
  esac
  shift
done

step() {
  printf "\n==> %s\n" "$1"
}

run_root() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

install_apt_packages() {
  local packages=("$@")
  if ! command -v apt-get >/dev/null 2>&1; then
    printf "This installer currently supports Ubuntu/Debian systems with apt-get.\n" >&2
    exit 1
  fi
  run_root apt-get update
  run_root apt-get install -y "${packages[@]}"
}

ensure_base_packages() {
  local missing=()
  local required=(curl ca-certificates gnupg build-essential python3 make g++ pkg-config libudev-dev ffmpeg)
  for pkg in "${required[@]}"; do
    if ! dpkg -s "$pkg" >/dev/null 2>&1; then
      missing+=("$pkg")
    fi
  done
  if [[ "${#missing[@]}" -gt 0 ]]; then
    step "Installing Ubuntu packages"
    install_apt_packages "${missing[@]}"
  fi
}

ensure_nodejs() {
  local need_install=0
  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    need_install=1
  else
    local major
    major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
    if [[ "$major" -lt 20 ]]; then
      need_install=1
    fi
  fi

  if [[ "$need_install" -eq 1 ]]; then
    step "Installing Node.js 20"
    ensure_base_packages
    curl -fsSL https://deb.nodesource.com/setup_20.x | run_root bash
    run_root apt-get install -y nodejs
  fi
}

write_systemd_service() {
  local node_bin service_user service_file
  node_bin="$(command -v node)"
  service_user="${SUDO_USER:-$(id -un)}"
  service_file="/etc/systemd/system/${SERVICE_NAME}.service"

  step "Installing systemd service"
  cat <<EOF >/tmp/${SERVICE_NAME}.service
[Unit]
Description=Control Center Web
After=network.target

[Service]
Type=simple
User=${service_user}
WorkingDirectory=${ROOT_DIR}
ExecStart=${node_bin} ${ROOT_DIR}/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

  run_root mv "/tmp/${SERVICE_NAME}.service" "$service_file"
  run_root systemctl daemon-reload
  run_root systemctl enable "$SERVICE_NAME"
  run_root systemctl restart "$SERVICE_NAME"
  printf "Service enabled : %s\n" "$SERVICE_NAME"
  printf "Service status  : sudo systemctl status %s\n" "$SERVICE_NAME"
}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

step "Preparing Ubuntu dependencies"
ensure_base_packages
ensure_nodejs
printf "Node version: %s\n" "$(node -v)"
printf "Platform: Ubuntu/Linux\n"

step "Creating app folders"
mkdir -p data uploads uploads/ftp uploads/plates streams

step "Installing dependencies"
if [[ -f package-lock.json ]]; then
  npm ci --omit=dev
else
  npm install --omit=dev
fi

step "Installation complete"
printf "Start command: npm start\n"
printf "Quick start   : ./install.sh --start\n"
printf "Auto start    : ./install.sh --enable-service\n"

if [[ "$ENABLE_SERVICE" == "1" ]]; then
  write_systemd_service
fi

if [[ "$START_APP" == "1" ]]; then
  step "Starting application"
  npm start
fi
