#!/usr/bin/env bash
set -Eeuo pipefail

START_APP=0
ENABLE_SERVICE=0
SERVICE_NAME="${SERVICE_NAME:-control-center}"
SERVICE_PORT="${SERVICE_PORT:-3000}"
INSTALL_OK=0
SERVICE_FILE=""
SERVICE_CREATED=0

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
    --service-port)
      shift
      SERVICE_PORT="${1:-3000}"
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

cleanup_service() {
  if [[ "$SERVICE_CREATED" -eq 1 && -n "$SERVICE_FILE" ]]; then
    step "Rolling back systemd service"
    run_root systemctl stop "$SERVICE_NAME" >/dev/null 2>&1 || true
    run_root systemctl disable "$SERVICE_NAME" >/dev/null 2>&1 || true
    run_root rm -f "$SERVICE_FILE" >/dev/null 2>&1 || true
    run_root systemctl daemon-reload >/dev/null 2>&1 || true
  fi
}

on_error() {
  local exit_code=$?
  local line_no="${1:-unknown}"
  printf "\n[ERROR] Installation failed at line %s (exit code %s).\n" "$line_no" "$exit_code" >&2
  if [[ "$INSTALL_OK" -eq 0 ]]; then
    cleanup_service
    printf "[ROLLBACK] Partial service installation has been reverted.\n" >&2
  fi
  exit "$exit_code"
}

trap 'on_error $LINENO' ERR

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

sanitize_legacy_serial_config() {
  local config_path="$ROOT_DIR/.device-info.json"
  if [[ ! -f "$config_path" ]]; then
    return
  fi

  shopt -s nullglob
  local board_ports=(/dev/ttyAS*)
  shopt -u nullglob
  if [[ "${#board_ports[@]}" -eq 0 ]]; then
    return
  fi

  local result
  result="$(
    node --input-type=module - "$config_path" <<'EOF'
import fs from "node:fs";

const configPath = process.argv[2];
const raw = fs.readFileSync(configPath, "utf8");
const parsed = JSON.parse(raw);
const serial = parsed && typeof parsed.serial === "object" ? parsed.serial : null;
const backendPort = String(serial?.backendPort || "").trim();

if (!/^\/dev\/ttyS\d+$/i.test(backendPort)) {
  process.stdout.write("unchanged");
  process.exit(0);
}

parsed.serial = {
  baudRate: Number(serial?.baudRate || 115200) || 115200,
  forwardEnabled: false,
  backendPort: ""
};

fs.writeFileSync(configPath, JSON.stringify(parsed), "utf8");
process.stdout.write(`cleared:${backendPort}`);
EOF
  )"

  if [[ "$result" == cleared:* ]]; then
    step "Clearing stale serial port configuration"
    printf "Cleared legacy backend serial port: %s\n" "${result#cleared:}"
    printf "Detected board serial ports: %s\n" "${board_ports[*]}"
  fi
}

print_access_info() {
  local base_port="$1"
  local local_ips
  printf "\n==== Installation Summary ====\n"
  printf "Service name        : %s\n" "$SERVICE_NAME"
  printf "Install path        : %s\n" "$ROOT_DIR"
  printf "Base port           : %s\n" "$base_port"
  printf "Default username    : admin\n"
  printf "Default password    : admin\n"
  printf "Local access        : http://127.0.0.1:%s/login.html\n" "$base_port"
  local_ips="$(hostname -I 2>/dev/null || true)"
  for ip in $local_ips; do
    [[ -n "$ip" ]] && printf "LAN access          : http://%s:%s/login.html\n" "$ip" "$base_port"
  done
  printf "Manage service      : ./manage.sh status|restart|stop|start|logs|info|uninstall\n"
  printf "systemd status      : sudo systemctl status %s\n" "$SERVICE_NAME"
  printf "==============================\n"
}

write_systemd_service() {
  local node_bin service_user
  node_bin="$(command -v node)"
  service_user="${SUDO_USER:-$(id -un)}"
  SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

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
Environment=PORT=${SERVICE_PORT}

[Install]
WantedBy=multi-user.target
EOF

  run_root mv "/tmp/${SERVICE_NAME}.service" "$SERVICE_FILE"
  SERVICE_CREATED=1
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
sanitize_legacy_serial_config

step "Installing dependencies"
if [[ -f package-lock.json ]]; then
  npm ci --omit=dev
else
  npm install --omit=dev
fi

if [[ "$ENABLE_SERVICE" -eq 1 ]]; then
  write_systemd_service
fi

INSTALL_OK=1

step "Installation complete"
printf "Foreground start   : ./install.sh --start\n"
printf "Enable auto-start  : ./install.sh --enable-service\n"
print_access_info "$SERVICE_PORT"

if [[ "$START_APP" -eq 1 ]]; then
  step "Starting application"
  npm start
fi
