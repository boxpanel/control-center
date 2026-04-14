# Control Center Web

Local device control center for camera discovery, streaming, serial forwarding, plate event ingestion, and system configuration.

## One-Click Ubuntu Install

Run this single command on Ubuntu:

```bash
curl -fsSL https://raw.githubusercontent.com/boxpanel/control-center/main/bootstrap.sh | bash
```

By default it installs to:

```bash
$HOME/control-center
```

This command now:

- installs required Ubuntu packages
- installs Node.js 20 if missing
- clones or updates the repository
- installs npm dependencies
- registers a `systemd` service
- enables auto-start on boot

## Manual Install

Run this in the project folder:

```bash
chmod +x ./install.sh
./install.sh
```

Install and run in foreground:

```bash
chmod +x ./install.sh
./install.sh --start
```

Install and enable auto-start:

```bash
chmod +x ./install.sh
./install.sh --enable-service
```

## Start

After installation:

```bash
npm start
```

## Service Management

```bash
sudo systemctl status control-center
sudo systemctl restart control-center
sudo systemctl stop control-center
sudo journalctl -u control-center -f
```

## Notes

- Target environment: Ubuntu
- Requires Node.js 20 or newer.
- The installer automatically installs required Ubuntu packages and Node.js 20 if missing.
- The installer creates `data`, `uploads`, and `streams` automatically.
- The bootstrap installer enables a `systemd` service by default.
- Default web port is `3000`; if occupied, the app will try the next ports automatically.
