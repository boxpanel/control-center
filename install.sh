#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="${REPO_URL:-https://github.com/boxpanel/control-center.git}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/control-center}"

START_APP=0
ENABLE_SERVICE=0
SERVICE_NAME="${SERVICE_NAME:-control-center}"
SERVICE_PORT="${SERVICE_PORT:-3000}"
INSTALL_OK=0
SERVICE_FILE=""
SERVICE_CREATED=0
BOOTSTRAP_MODE=0
SKIP_BOOTSTRAP=0
CLONED_FRESH=0
BACKUP_DIR=""

PASS_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --start)
      START_APP=1
      PASS_ARGS+=("$1")
      ;;
    --enable-service)
      ENABLE_SERVICE=1
      PASS_ARGS+=("$1")
      ;;
    --service-name)
      shift
      SERVICE_NAME="${1:-control-center}"
      PASS_ARGS+=("--service-name" "$SERVICE_NAME")
      ;;
    --service-port)
      shift
      SERVICE_PORT="${1:-3000}"
      PASS_ARGS+=("--service-port" "$SERVICE_PORT")
      ;;
    --repo-url)
      shift
      REPO_URL="${1:-$REPO_URL}"
      ;;
    --install-dir)
      shift
      INSTALL_DIR="${1:-$INSTALL_DIR}"
      ;;
    --bootstrap)
      BOOTSTRAP_MODE=1
      ;;
    --skip-bootstrap)
      SKIP_BOOTSTRAP=1
      ;;
    -h|--help)
      cat <<'EOF'
Usage:
  ./install.sh [options]

Options:
  --start                 Install then start app in foreground (npm start)
  --enable-service        Install and register systemd service
  --service-name NAME     systemd service name (default: control-center)
  --service-port PORT     Service port (default: 3000)

Bootstrap options (for one-click installs / running outside repo dir):
  --bootstrap             Force clone/update repo then run installer
  --repo-url URL          Repo git URL (default: https://github.com/boxpanel/control-center.git)
  --install-dir PATH      Install directory (default: $HOME/control-center)

Examples:
  ./install.sh
  ./install.sh --start
  ./install.sh --enable-service --service-port 3000
  curl -fsSL https://raw.githubusercontent.com/boxpanel/control-center/main/install.sh | bash
EOF
      exit 0
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

rollback_bootstrap() {
  local exit_code=$?
  printf "\n[ERROR] Installation failed (exit code %s).\n" "$exit_code" >&2
  cleanup_service
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

repair_git_index_if_needed() {
  local repo_dir="$1"
  if git -C "$repo_dir" status --porcelain >/dev/null 2>&1; then
    return 0
  fi
  if git -C "$repo_dir" rev-parse --git-dir >/dev/null 2>&1; then
    local git_dir
    git_dir="$(git -C "$repo_dir" rev-parse --git-dir 2>/dev/null || true)"
    if [[ -n "$git_dir" && -f "$repo_dir/$git_dir/index" ]]; then
      printf "[WARN] Git index appears to be corrupt. Rebuilding repository index...\n"
      rm -f "$repo_dir/$git_dir/index"
      git -C "$repo_dir" reset --hard HEAD >/dev/null 2>&1 || true
    fi
  fi
}

is_control_center_root() {
  local dir="$1"
  [[ -f "$dir/server.js" ]] || return 1
  [[ -f "$dir/package.json" ]] || return 1
  [[ -f "$dir/public/index.html" ]] || return 1
  grep -q '"name":[[:space:]]*"onvif-ipcam"' "$dir/package.json"
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

bootstrap_repo_then_run() {
  trap rollback_bootstrap ERR

  step "Installing base packages"
  install_apt_packages git curl ca-certificates gnupg

  if [[ ! -d "$INSTALL_DIR/.git" ]]; then
    step "Cloning repository into ${INSTALL_DIR}"
    git clone "$REPO_URL" "$INSTALL_DIR"
    CLONED_FRESH=1
  else
    step "Updating repository in ${INSTALL_DIR}"
    repair_git_index_if_needed "$INSTALL_DIR"
    if [[ -n "$(git -C "$INSTALL_DIR" status --porcelain 2>/dev/null || true)" ]]; then
      BACKUP_DIR="$INSTALL_DIR/.upgrade-backup-$(date +%Y%m%d-%H%M%S)"
      printf "[WARN] Local changes detected. Backing them up to:\n"
      printf "       %s\n" "$BACKUP_DIR"
      mkdir -p "$BACKUP_DIR"
      git -C "$INSTALL_DIR" diff >"$BACKUP_DIR/local-changes.patch" || true
      git -C "$INSTALL_DIR" status --short >"$BACKUP_DIR/status.txt" || true
    fi
    repair_git_index_if_needed "$INSTALL_DIR"
    git -C "$INSTALL_DIR" fetch origin main
    git -C "$INSTALL_DIR" reset --hard origin/main
    git -C "$INSTALL_DIR" clean -fd
  fi

  step "Running application installer"

  local args=("${PASS_ARGS[@]}")
  if [[ "$START_APP" -eq 0 && "$ENABLE_SERVICE" -eq 0 ]]; then
    args+=("--enable-service")
  fi
  args+=("--skip-bootstrap")

  chmod +x "$INSTALL_DIR/install.sh"
  "$INSTALL_DIR/install.sh" "${args[@]}"

  if [[ -n "$BACKUP_DIR" ]]; then
    printf "\n[INFO] Previous local changes were backed up to:\n"
    printf "       %s\n" "$BACKUP_DIR"
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
  local preferred_port="/dev/ttyAS5"
  if [[ ! -e "$preferred_port" ]]; then
    preferred_port="${board_ports[0]}"
  fi

  local result
  result="$(
    node --input-type=module - "$config_path" "$preferred_port" <<'EOF'
import fs from "node:fs";

const configPath = process.argv[2];
const preferredPort = process.argv[3];
const raw = fs.readFileSync(configPath, "utf8");
const parsed = JSON.parse(raw);
const serial = parsed && typeof parsed.serial === "object" ? parsed.serial : null;
const backendPort = String(serial?.backendPort || "").trim();

if (backendPort === preferredPort && Number(serial?.baudRate || 0) === 115200) {
  process.stdout.write("unchanged");
  process.exit(0);
}

parsed.serial = {
  baudRate: 115200,
  forwardEnabled: Boolean(serial?.forwardEnabled),
  backendPort: preferredPort
};

fs.writeFileSync(configPath, JSON.stringify(parsed), "utf8");
process.stdout.write(`set:${backendPort}->${preferredPort}`);
EOF
  )"

  if [[ "$result" == set:* ]]; then
    step "Applying board serial defaults"
    printf "Updated backend serial port: %s\n" "${result#set:}"
    printf "Detected board serial ports: %s\n" "${board_ports[*]}"
    printf "Default baud rate         : 115200\n"
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

if [[ "$SKIP_BOOTSTRAP" -eq 0 ]]; then
  if [[ "$BOOTSTRAP_MODE" -eq 1 ]] || ! is_control_center_root "$ROOT_DIR"; then
    bootstrap_repo_then_run
    exit 0
  fi
fi

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
