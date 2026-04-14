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
- backs up local uncommitted changes before updating
- installs npm dependencies
- registers a `systemd` service
- enables auto-start on boot
- rolls back the service and incomplete install directory if setup fails
- stores local change backups under `.upgrade-backup-*` inside the install directory during upgrades

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

Install with a custom service port:

```bash
chmod +x ./install.sh
./install.sh --enable-service --service-port 3000
```

## Start

After installation:

```bash
npm start
```

## Service Management

```bash
chmod +x ./manage.sh
./manage.sh info
./manage.sh status
./manage.sh restart
./manage.sh stop
./manage.sh start
./manage.sh logs
./manage.sh uninstall
```

`./manage.sh uninstall` will stop the service, remove the `systemd` unit, and delete the whole install directory after confirmation.

## Notes

- Target environment: Ubuntu
- Requires Node.js 20 or newer.
- The installer automatically installs required Ubuntu packages and Node.js 20 if missing.
- The installer creates `data`, `uploads`, and `streams` automatically.
- The bootstrap installer enables a `systemd` service by default.
- Successful installation prints the base port, access URLs, default username, and default password.
- Default credentials are `admin / admin`.
- Default web port is `3000`; if occupied, the app will try the next ports automatically.
