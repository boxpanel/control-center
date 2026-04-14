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

## Manual Install

Run this in the project folder:

```bash
chmod +x ./install.sh
./install.sh
```

Install and start in one step:

```bash
chmod +x ./install.sh
./install.sh --start
```

## Start

After installation:

```bash
npm start
```

## Notes

- Target environment: Ubuntu
- Requires Node.js 20 or newer.
- The installer automatically installs required Ubuntu packages and Node.js 20 if missing.
- The installer creates `data`, `uploads`, and `streams` automatically.
- Default web port is `3000`; if occupied, the app will try the next ports automatically.
