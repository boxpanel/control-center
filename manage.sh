#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-control-center}"
SERVICE_PORT="${SERVICE_PORT:-3000}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACTION="${1:-info}"

run_root() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

print_info() {
  local local_ips
  printf "Service name     : %s\n" "$SERVICE_NAME"
  printf "Install path     : %s\n" "$ROOT_DIR"
  printf "Base port        : %s\n" "$SERVICE_PORT"
  printf "Default username : admin\n"
  printf "Default password : admin\n"
  printf "Local access     : http://127.0.0.1:%s/login.html\n" "$SERVICE_PORT"
  local_ips="$(hostname -I 2>/dev/null || true)"
  for ip in $local_ips; do
    [[ -n "$ip" ]] && printf "LAN access       : http://%s:%s/login.html\n" "$ip" "$SERVICE_PORT"
  done
}

uninstall_service() {
  run_root systemctl stop "$SERVICE_NAME" || true
  run_root systemctl disable "$SERVICE_NAME" || true
  run_root rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
  run_root systemctl daemon-reload
  printf "Service removed: %s\n" "$SERVICE_NAME"
}

case "$ACTION" in
  start)
    run_root systemctl start "$SERVICE_NAME"
    ;;
  stop)
    run_root systemctl stop "$SERVICE_NAME"
    ;;
  restart)
    run_root systemctl restart "$SERVICE_NAME"
    ;;
  status)
    run_root systemctl status "$SERVICE_NAME" --no-pager
    ;;
  logs)
    run_root journalctl -u "$SERVICE_NAME" -f
    ;;
  info)
    print_info
    ;;
  uninstall)
    uninstall_service
    ;;
  *)
    printf "Usage: %s {start|stop|restart|status|logs|info|uninstall}\n" "$0" >&2
    exit 1
    ;;
esac
