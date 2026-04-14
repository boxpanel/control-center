import { spawn } from "node:child_process";
import crypto from "node:crypto";
import dgram from "node:dgram";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import os from "node:os";

import Database from "better-sqlite3";
import * as ftp from "basic-ftp";
import express from "express";
import FtpSrv from "ftp-srv";
import { SerialPort } from "serialport";
import onvif from "onvif";
import { nodeOnvifProbe, onvifDiscoveryProbe, wsDiscoveryMulticast, wsDiscoveryUnicast } from "./onvif-discovery.js";

const { Cam } = onvif;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "1mb" }));

const publicDir = path.join(__dirname, "public");
const streamsDir = path.join(__dirname, "streams");
const uploadsDir = path.join(__dirname, "uploads");
const ftpUploadRootDir = path.join(uploadsDir, "ftp");
const dataDir = path.join(__dirname, "data");
const plateDbPath = path.join(dataDir, "plates.sqlite3");
const platesUploadDir = path.join(uploadsDir, "plates");

await fs.mkdir(streamsDir, { recursive: true });
await fs.mkdir(ftpUploadRootDir, { recursive: true });
await fs.mkdir(dataDir, { recursive: true });
await fs.mkdir(platesUploadDir, { recursive: true });

const deviceInfoPath = path.join(__dirname, ".device-info.json");

const plateDb = new Database(plateDbPath);
plateDb.pragma("journal_mode = WAL");
plateDb.exec(`
  CREATE TABLE IF NOT EXISTS plate_records (
    id TEXT PRIMARY KEY,
    plate TEXT NOT NULL,
    receivedAt INTEGER NOT NULL,
    eventAt INTEGER NOT NULL,
    imagePath TEXT NOT NULL DEFAULT '',
    sourceEventKey TEXT NOT NULL DEFAULT '',
    ftpRemotePath TEXT NOT NULL DEFAULT '',
    serialSentAt INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_plate_records_receivedAt ON plate_records(receivedAt);
  CREATE INDEX IF NOT EXISTS idx_plate_records_plate ON plate_records(plate);

  CREATE TABLE IF NOT EXISTS auth_users (
    username TEXT PRIMARY KEY,
    salt TEXT NOT NULL,
    hash TEXT NOT NULL,
    iterations INTEGER NOT NULL,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );
`);
const plateTableColumns = plateDb.prepare(`PRAGMA table_info(plate_records)`).all();
if (!plateTableColumns.some((col) => String(col?.name || "") === "sourceEventKey")) {
  plateDb.exec(`ALTER TABLE plate_records ADD COLUMN sourceEventKey TEXT NOT NULL DEFAULT ''`);
}
plateDb.exec(`CREATE INDEX IF NOT EXISTS idx_plate_records_sourceEventKey ON plate_records(sourceEventKey)`);

const stmtPlateInsert = plateDb.prepare(`
  INSERT INTO plate_records (id, plate, receivedAt, eventAt, imagePath, sourceEventKey, ftpRemotePath, serialSentAt)
  VALUES (@id, @plate, @receivedAt, @eventAt, @imagePath, @sourceEventKey, @ftpRemotePath, @serialSentAt)
`);
const stmtPlateGet = plateDb.prepare(
  `SELECT id, plate, receivedAt, eventAt, imagePath, ftpRemotePath, serialSentAt FROM plate_records WHERE id = ?`
);
const stmtPlateGetBySourceEventKey = plateDb.prepare(
  `SELECT id, plate, receivedAt, eventAt, imagePath, ftpRemotePath, serialSentAt FROM plate_records WHERE sourceEventKey = ? LIMIT 1`
);
const stmtPlateListLatest = plateDb.prepare(
  `SELECT id, plate, receivedAt, eventAt, imagePath, ftpRemotePath, serialSentAt FROM plate_records ORDER BY receivedAt DESC LIMIT ?`
);
const stmtPlateUpdateSerialSent = plateDb.prepare(`UPDATE plate_records SET serialSentAt = ? WHERE id = ?`);

const stmtAuthGet = plateDb.prepare(`SELECT username, salt, hash, iterations FROM auth_users WHERE username = ?`);
const stmtAuthFirst = plateDb.prepare(`SELECT username, salt, hash, iterations FROM auth_users ORDER BY createdAt ASC LIMIT 1`);
const stmtAuthInsert = plateDb.prepare(
  `INSERT INTO auth_users (username, salt, hash, iterations, createdAt, updatedAt) VALUES (@username, @salt, @hash, @iterations, @ts, @ts)`
);
const stmtAuthUpdate = plateDb.prepare(
  `UPDATE auth_users SET salt = @salt, hash = @hash, iterations = @iterations, updatedAt = @ts WHERE username = @username`
);
const stmtAuthDeleteAll = plateDb.prepare(`DELETE FROM auth_users`);

function rowToPlateDto(row) {
  if (!row) return null;
  const id = String(row.id || "");
  const imagePath = String(row.imagePath || "");
  return {
    id,
    plate: String(row.plate || ""),
    receivedAt: Number(row.receivedAt || 0) || 0,
    eventAt: Number(row.eventAt || 0) || 0,
    imageDataUrl: imagePath ? `/api/plates/image/${encodeURIComponent(id)}` : "",
    ftpRemotePath: String(row.ftpRemotePath || ""),
    serialSentAt: Number(row.serialSentAt || 0) || 0
  };
}

function newPlateId(receivedAtMs) {
  const t = Number(receivedAtMs) || Date.now();
  return `${t}-${crypto.randomBytes(6).toString("hex")}`;
}

async function savePlateJpegToDisk({ jpegBuffer, eventDate, plate, id }) {
  const { y, m, day } = formatDateFolderParts(eventDate);
  const safePlate = sanitizeNamePart(plate);
  const dir = path.join(platesUploadDir, y, m, day);
  await fs.mkdir(dir, { recursive: true });
  const file = `${formatTimestampForFile(eventDate)}_${safePlate}_${String(id || "").slice(-6)}.jpg`;
  const abs = path.join(dir, file);
  await fs.writeFile(abs, jpegBuffer);
  return path.relative(uploadsDir, abs).split(path.sep).join("/");
}

function deletePlatesByIds(ids) {
  const arr = Array.isArray(ids) ? ids.map((x) => String(x || "").trim()).filter(Boolean) : [];
  if (!arr.length) return 0;
  const placeholders = arr.map(() => "?").join(",");
  const del = plateDb.prepare(`DELETE FROM plate_records WHERE id IN (${placeholders})`);
  return del.run(...arr).changes || 0;
}

function parseCookies(cookieHeader) {
  const header = String(cookieHeader || "");
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function base64urlEncode(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlDecodeToBuffer(text) {
  const s = String(text || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s + pad, "base64");
}

function signAuthToken(payloadObj, secret) {
  const payload = base64urlEncode(Buffer.from(JSON.stringify(payloadObj), "utf8"));
  const sig = base64urlEncode(crypto.createHmac("sha256", String(secret || "")).update(payload).digest());
  return `${payload}.${sig}`;
}

function verifyAuthToken(token, secret) {
  const t = String(token || "");
  const idx = t.lastIndexOf(".");
  if (idx <= 0) return null;
  const payload = t.slice(0, idx);
  const sig = t.slice(idx + 1);
  const expected = base64urlEncode(crypto.createHmac("sha256", String(secret || "")).update(payload).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  let obj = null;
  try {
    obj = JSON.parse(base64urlDecodeToBuffer(payload).toString("utf8"));
  } catch {
    obj = null;
  }
  if (!obj || typeof obj !== "object") return null;
  const exp = Number(obj.exp || 0);
  if (!Number.isFinite(exp) || exp <= Date.now()) return null;
  return obj;
}

function hashPasswordPbkdf2(password, { salt, iterations }) {
  const it = Math.max(10_000, Math.min(500_000, toPositiveInt(iterations, 120_000)));
  const s = String(salt || "");
  const dk = crypto.pbkdf2Sync(String(password || ""), s, it, 32, "sha256");
  return { hash: base64urlEncode(dk), iterations: it, salt: s };
}

function isValidAuthRow(row) {
  if (!row) return false;
  const u = String(row.username || "").trim();
  const s = String(row.salt || "").trim();
  const h = String(row.hash || "").trim();
  const it = toPositiveInt(row.iterations, 0);
  return Boolean(u && s && h && it);
}

function getPendingAuthFromInfo(info) {
  const auth = info?.auth && typeof info.auth === "object" ? info.auth : null;
  if (!auth || auth.applyOnNextStart !== true) return null;
  const row = {
    username: String(auth.username || "").trim(),
    salt: String(auth.salt || "").trim(),
    hash: String(auth.hash || "").trim(),
    iterations: toPositiveInt(auth.iterations, 0)
  };
  return isValidAuthRow(row) ? row : null;
}

async function applyPendingAuthFromInfo(info) {
  const pending = getPendingAuthFromInfo(info);
  if (!pending) return info;
  const ts = Date.now();
  try {
    const tx = plateDb.transaction((row) => {
      stmtAuthDeleteAll.run();
      stmtAuthInsert.run({
        username: row.username,
        salt: row.salt,
        hash: row.hash,
        iterations: row.iterations,
        ts
      });
    });
    tx(pending);
  } catch {}

  const nextInfo = {
    ...info,
    auth: {
      ...info.auth,
      username: pending.username,
      salt: pending.salt,
      hash: pending.hash,
      iterations: pending.iterations,
      applyOnNextStart: false
    }
  };
  try {
    await fs.writeFile(deviceInfoPath, JSON.stringify(nextInfo), "utf8");
  } catch {}
  return nextInfo;
}

function ensureAuthUserInDb({ info, defaultUsername = "admin" }) {
  const fromDb = stmtAuthFirst.get();
  if (isValidAuthRow(fromDb)) return fromDb;

  const fallback = info?.auth && typeof info.auth === "object" ? info.auth : null;
  const username = String(fallback?.username || defaultUsername).trim() || defaultUsername;
  const saltFromFile = String(fallback?.salt || "").trim();
  const hashFromFile = String(fallback?.hash || "").trim();
  const iterationsFromFile = toPositiveInt(fallback?.iterations, 0);

  if (saltFromFile && hashFromFile && iterationsFromFile > 0) {
    const ts = Date.now();
    try {
      stmtAuthInsert.run({
        username,
        salt: saltFromFile,
        hash: hashFromFile,
        iterations: iterationsFromFile,
        ts
      });
    } catch {}
    const inserted = stmtAuthGet.get(username);
    if (isValidAuthRow(inserted)) return inserted;
  }

  const salt = base64urlEncode(crypto.randomBytes(16));
  const hashed = hashPasswordPbkdf2("admin", { salt, iterations: 120_000 });
  const ts = Date.now();
  try {
    stmtAuthInsert.run({ username: defaultUsername, salt: hashed.salt, hash: hashed.hash, iterations: hashed.iterations, ts });
  } catch {}
  return stmtAuthGet.get(defaultUsername) || { username: defaultUsername, salt: hashed.salt, hash: hashed.hash, iterations: hashed.iterations };
}

async function readAuthConfig() {
  const loadedInfo = await loadOrInitDeviceInfo();
  const info = await applyPendingAuthFromInfo(loadedInfo);
  const authRow = ensureAuthUserInDb({ info, defaultUsername: "admin" });
  return {
    secret: String(info?.secret || ""),
    username: String(authRow?.username || ""),
    salt: String(authRow?.salt || ""),
    hash: String(authRow?.hash || ""),
    iterations: toPositiveInt(authRow?.iterations, 120_000)
  };
}

async function requireAuth(req, res, next) {
  const urlPath = String(req.path || "");
  if (urlPath === "/login.html" || urlPath === "/login.js") return next();
  if (urlPath === "/style.css" || urlPath.startsWith("/vendor/")) return next();
  if (urlPath.startsWith("/api/auth/")) return next();

  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.cc_token || "";
  let ok = false;
  try {
    const { secret } = await readAuthConfig();
    ok = Boolean(secret && verifyAuthToken(token, secret));
  } catch {
    ok = false;
  }
  if (ok) return next();

  if (urlPath.startsWith("/api/")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.redirect("/login.html");
}

app.use((req, res, next) => {
  Promise.resolve(requireAuth(req, res, next)).catch(() => {
    try {
      res.status(500).end();
    } catch {}
  });
});

app.post("/api/auth/login", async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  const cfg = await readAuthConfig();
  if (!username || !password) {
    res.status(400).json({ error: "Bad request" });
    return;
  }
  if (username !== cfg.username) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const hashed = hashPasswordPbkdf2(password, { salt: cfg.salt, iterations: cfg.iterations });
  if (hashed.hash !== cfg.hash) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = signAuthToken({ sub: username, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 }, cfg.secret);
  res.setHeader("Set-Cookie", `cc_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`);
  res.json({ ok: true });
});

app.post("/api/auth/logout", (req, res) => {
  res.setHeader("Set-Cookie", "cc_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
  res.json({ ok: true });
});

app.get("/api/auth/me", async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.cc_token || "";
  const cfg = await readAuthConfig();
  const payload = verifyAuthToken(token, cfg.secret);
  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json({ ok: true, username: String(payload.sub || "") });
});

app.post("/api/auth/change-password", async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.cc_token || "";
  const cfg = await readAuthConfig();
  const payload = verifyAuthToken(token, cfg.secret);
  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const oldPassword = String(req.body?.oldPassword || "");
  const newPassword = String(req.body?.newPassword || "");
  if (!oldPassword || !newPassword) {
    res.status(400).json({ error: "Bad request" });
    return;
  }
  const oldHashed = hashPasswordPbkdf2(oldPassword, { salt: cfg.salt, iterations: cfg.iterations });
  if (oldHashed.hash !== cfg.hash) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const salt = base64urlEncode(crypto.randomBytes(16));
  const nextHashed = hashPasswordPbkdf2(newPassword, { salt, iterations: cfg.iterations });
  try {
    stmtAuthUpdate.run({
      username: cfg.username,
      salt: nextHashed.salt,
      hash: nextHashed.hash,
      iterations: nextHashed.iterations,
      ts: Date.now()
    });
  } catch {}
  const nextToken = signAuthToken({ sub: String(payload.sub || cfg.username), exp: Date.now() + 7 * 24 * 60 * 60 * 1000 }, cfg.secret);
  res.setHeader("Set-Cookie", `cc_token=${encodeURIComponent(nextToken)}; Path=/; HttpOnly; SameSite=Lax`);
  res.json({ ok: true });
});

app.use(express.static(publicDir));

let ftpServer = null;
let ftpServerKey = "";

let backendSerialPort = null;
let backendSerialKey = "";
let backendSerialSendChain = Promise.resolve();

let discoveryReporter = null;
let discoveryProbe = null;
let discoveryKey = "";
let currentHttpPort = 0;
const DEFAULT_SERIAL_BAUD_RATE = 115200;
const DEFAULT_FIXED_LINUX_BOARD_SERIAL_PORT = "/dev/ttyAS5";

function normalizeBackendSerialConfig(raw) {
  const baudRate = toPositiveInt(raw?.baudRate, DEFAULT_SERIAL_BAUD_RATE);
  const forwardEnabled = Boolean(raw?.forwardEnabled);
  const backendPort = String(raw?.backendPort || "").trim();
  return { baudRate, forwardEnabled, backendPort };
}

function backendSerialConfigKey(cfg) {
  if (!cfg) return "";
  return JSON.stringify({
    baudRate: Number(cfg.baudRate || 0) || 0,
    forwardEnabled: Boolean(cfg.forwardEnabled),
    backendPort: String(cfg.backendPort || "")
  });
}

async function stopBackendSerial() {
  if (!backendSerialPort) return;
  const p = backendSerialPort;
  backendSerialPort = null;
  backendSerialKey = "";
  backendSerialSendChain = Promise.resolve();
  try {
    await new Promise((resolve) => p.close(() => resolve()));
  } catch {}
}

async function ensureBackendSerial(cfg) {
  const conf = normalizeBackendSerialConfig(cfg);
  const nextKey = backendSerialConfigKey(conf);
  if (backendSerialPort && backendSerialKey === nextKey) return;

  await stopBackendSerial();
  backendSerialKey = nextKey;
  if (!conf.backendPort) return;

  const port = new SerialPort({ path: conf.backendPort, baudRate: conf.baudRate, autoOpen: false });
  await new Promise((resolve, reject) => {
    port.open((err) => {
      if (err) {
        const openErr = new Error(`打开后端串口失败：${conf.backendPort} @ ${conf.baudRate}，${String(err.message || err || "unknown error")}`);
        openErr.statusCode = 502;
        reject(openErr);
      }
      else resolve();
    });
  });
  backendSerialPort = port;
  backendSerialSendChain = Promise.resolve();
}

function backendSerialEnqueueWrite(text) {
  const msg = String(text ?? "");
  const task = backendSerialSendChain
    .then(async () => {
      const p = backendSerialPort;
      if (!p || !p.isOpen) throw new Error("backend serial not open");
      await new Promise((resolve, reject) => {
        p.write(msg, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      return true;
    })
    .catch(() => false);
  backendSerialSendChain = task.then(() => {});
  return task;
}

function getBackendSerialStatus(cfg) {
  const conf = normalizeBackendSerialConfig(cfg);
  return {
    enabled: conf.forwardEnabled,
    configuredPort: conf.backendPort,
    baudRate: conf.baudRate,
    isOpen: Boolean(backendSerialPort?.isOpen),
    activePort: backendSerialPort?.path || conf.backendPort || ""
  };
}

function discoveryConfigKeyFromClientConfig(cfg, port) {
  const system = cfg?.system || {};
  const probe = cfg?.probe || {};
  const clientMode = Boolean(system?.clientMode);
  return JSON.stringify({
    clientMode,
    port: Number(port || 0) || 0,
    system: {
      name: String(system?.name || ""),
      ipMode: String(system?.ipMode || ""),
      preferredIp: String(system?.preferredIp || ""),
      manualIp: String(system?.manualIp || "")
    },
    probe: {
      enabled: Boolean(probe?.enabled),
      group: String(probe?.group || ""),
      port: Number(probe?.port || 0) || 0
    }
  });
}

async function applyDiscoveryServices({ port }) {
  const cfg = await getClientConfig();
  const enabled = Boolean(cfg?.system?.clientMode);
  const nextKey = discoveryConfigKeyFromClientConfig(cfg, port);
  if (enabled && discoveryReporter && discoveryProbe && discoveryKey === nextKey) return;
  if (!enabled && !discoveryReporter && !discoveryProbe) return;

  if (discoveryProbe) {
    try {
      discoveryProbe.stop?.();
    } catch {}
    discoveryProbe = null;
  }
  if (discoveryReporter) {
    try {
      discoveryReporter.stop?.();
    } catch {}
    discoveryReporter = null;
  }
  discoveryKey = "";

  if (!enabled) return;

  discoveryReporter = await startRegistryReporter({ port });
  discoveryProbe = await startProbeResponder({ port, reporter: discoveryReporter });
  discoveryKey = nextKey;
}

function normalizeFtpServerConfig(raw) {
  const enabled = Boolean(raw?.enabled);
  const port = toPort(raw?.port, 21);
  const rootDir = String(raw?.rootDir || "").trim();
  const username = String(raw?.username || "").trim();
  const password = String(raw?.password || "");
  return { enabled, port: port || 21, rootDir, username, password };
}

function ftpConfigKey(cfg) {
  if (!cfg) return "";
  return JSON.stringify({
    enabled: Boolean(cfg.enabled),
    port: Number(cfg.port || 0) || 0,
    rootDir: String(cfg.rootDir || ""),
    username: String(cfg.username || ""),
    password: String(cfg.password || "")
  });
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
  const st = await fs.stat(p);
  if (!st.isDirectory()) throw new Error("Not a directory");
}

function resolveFtpRootDir(rootDir) {
  const v = String(rootDir || "").trim();
  if (!v) return ftpUploadRootDir;
  if (path.isAbsolute(v)) return v;
  return path.join(__dirname, v);
}

async function stopFtpServer() {
  if (!ftpServer) return;
  const srv = ftpServer;
  ftpServer = null;
  ftpServerKey = "";
  try {
    await srv.close();
  } catch {}
}

async function ensureFtpServer(cfg) {
  const conf = normalizeFtpServerConfig(cfg);
  const nextKey = ftpConfigKey(conf);
  if (ftpServer && ftpServerKey === nextKey) return;

  await stopFtpServer();
  ftpServerKey = nextKey;
  if (!conf.enabled) return;
  if (conf.port < 1024 && typeof process.getuid === "function" && process.getuid() !== 0) {
    throw new Error("FTP 端口小于 1024 需要 root 权限，建议改用 2121，或给 node 授予 cap_net_bind_service");
  }

  const url = `ftp://0.0.0.0:${conf.port}`;
  const resolvedRoot = resolveFtpRootDir(conf.rootDir);
  await ensureDir(resolvedRoot);
  const srv = new FtpSrv({ url, anonymous: !conf.username });
  srv.on("login", ({ username, password }, resolve, reject) => {
    if (conf.username) {
      if (String(username || "") !== conf.username || String(password || "") !== conf.password) {
        reject(new Error("Invalid credentials"));
        return;
      }
    }
    resolve({ root: resolvedRoot });
  });
  srv.on("client-error", () => {});
  await srv.listen();
  ftpServer = srv;
}

async function runCommandCapture(command, args, { timeoutMs = 1800 } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    const chunks = [];
    const errChunks = [];
    let done = false;
    const t = setTimeout(() => {
      if (!done) {
        try {
          child.kill();
        } catch {}
      }
    }, timeoutMs);
    child.stdout.on("data", (d) => chunks.push(Buffer.from(d)));
    child.stderr.on("data", (d) => errChunks.push(Buffer.from(d)));
    child.on("error", (e) => {
      done = true;
      clearTimeout(t);
      reject(e);
    });
    child.on("close", (code) => {
      done = true;
      clearTimeout(t);
      const out = Buffer.concat(chunks).toString("utf8").trim();
      const err = Buffer.concat(errChunks).toString("utf8").trim();
      if (code === 0) resolve(out);
      else reject(new Error(err || out || `Command failed: ${command}`));
    });
  });
}

async function readFirstExistingText(paths) {
  for (const p of paths) {
    try {
      const v = (await fs.readFile(p, "utf8")).trim();
      if (v) return v;
    } catch {}
  }
  return "";
}

async function getCpuSerialBestEffort() {
  if (process.platform === "win32") {
    try {
      const out = await runCommandCapture(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          "(Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty ProcessorId)"
        ],
        { timeoutMs: 2200 }
      );
      const v = out.replace(/\s+/g, "");
      return v || "";
    } catch {
      return "";
    }
  }

  try {
    const cpuinfo = await fs.readFile("/proc/cpuinfo", "utf8");
    const m = cpuinfo.match(/^\s*Serial\s*:\s*([0-9a-fA-F]+)\s*$/m);
    if (m?.[1]) return m[1].trim();
  } catch {}

  return await readFirstExistingText([
    "/sys/devices/virtual/dmi/id/product_uuid",
    "/sys/class/dmi/id/product_uuid",
    "/etc/machine-id"
  ]);
}

async function getDiskSerialBestEffort() {
  if (process.platform === "win32") {
    try {
      const out = await runCommandCapture(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          "(Get-CimInstance Win32_DiskDrive | Select-Object -First 1 -ExpandProperty SerialNumber)"
        ],
        { timeoutMs: 2600 }
      );
      const v = out.replace(/\s+/g, "");
      return v || "";
    } catch {
      return "";
    }
  }

  try {
    const entries = await fs.readdir("/sys/block");
    for (const name of entries) {
      if (!name) continue;
      const v = await readFirstExistingText([`/sys/block/${name}/device/serial`]);
      if (v) return v;
    }
  } catch {}

  try {
    const out = await runCommandCapture("sh", ["-lc", "lsblk -dn -o SERIAL 2>/dev/null | head -n 1"], {
      timeoutMs: 1800
    });
    const v = out.replace(/\s+/g, "");
    return v || "";
  } catch {
    return "";
  }
}

async function listLinuxBoardSerialPorts() {
  if (process.platform !== "linux") return [];
  try {
    const entries = await fs.readdir("/dev");
    return entries
      .filter((name) => /^ttyAS\d+$/i.test(String(name || "")))
      .map((name) => `/dev/${name}`)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function getPreferredLinuxBoardSerialPort(boardPorts) {
  if (!Array.isArray(boardPorts) || boardPorts.length === 0) return "";
  return boardPorts.includes(DEFAULT_FIXED_LINUX_BOARD_SERIAL_PORT) ? DEFAULT_FIXED_LINUX_BOARD_SERIAL_PORT : boardPorts[0];
}

function shouldMigrateLinuxSerialPort(port, boardPorts) {
  const current = String(port || "").trim();
  const preferred = getPreferredLinuxBoardSerialPort(boardPorts);
  if (!preferred) return false;
  if (!current) return true;
  if (/^\/dev\/ttyS\d+$/i.test(current)) return true;
  return current !== preferred;
}

function shouldMigrateLinuxSerialBaud(baudRate, boardPorts) {
  if (!Array.isArray(boardPorts) || boardPorts.length === 0) return false;
  return toPositiveInt(baudRate, DEFAULT_SERIAL_BAUD_RATE) !== DEFAULT_SERIAL_BAUD_RATE;
}

async function loadOrInitDeviceInfo() {
  try {
    const raw = await fs.readFile(deviceInfoPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed?.installDate && parsed?.secret) {
      const linuxBoardPorts = await listLinuxBoardSerialPorts();
      const preferredBoardSerialPort = getPreferredLinuxBoardSerialPort(linuxBoardPorts);
      const patch = {};
      if (!parsed.connection || typeof parsed.connection !== "object") {
        patch.connection = { host: "", port: 80, username: "", password: "" };
      }
      const probeDefaults = { enabled: true, group: "239.255.255.250", port: 10086 };
      if (!parsed.probe || typeof parsed.probe !== "object") {
        patch.probe = probeDefaults;
      } else {
        const p = parsed.probe;
        const needs =
          !Object.prototype.hasOwnProperty.call(p, "enabled") ||
          !Object.prototype.hasOwnProperty.call(p, "group") ||
          !Object.prototype.hasOwnProperty.call(p, "port") ||
          Number(p.port) === 3702 || Number(p.port) === 37020;
        if (needs) patch.probe = { ...probeDefaults, ...p, port: Number(p.port) === 3702 || Number(p.port) === 37020 ? 10086 : p.port };
      }
      const serialDefaults = { baudRate: DEFAULT_SERIAL_BAUD_RATE, forwardEnabled: false, backendPort: preferredBoardSerialPort };
      if (!parsed.serial || typeof parsed.serial !== "object") {
        patch.serial = serialDefaults;
      } else {
        const s = parsed.serial;
        const needs =
          !Object.prototype.hasOwnProperty.call(s, "baudRate") ||
          !Object.prototype.hasOwnProperty.call(s, "forwardEnabled") ||
          !Object.prototype.hasOwnProperty.call(s, "backendPort");
        const mergedSerial = { ...serialDefaults, ...s };
        if (
          shouldMigrateLinuxSerialPort(mergedSerial.backendPort, linuxBoardPorts) ||
          shouldMigrateLinuxSerialBaud(mergedSerial.baudRate, linuxBoardPorts)
        ) {
          patch.serial = {
            ...mergedSerial,
            baudRate: DEFAULT_SERIAL_BAUD_RATE,
            backendPort: preferredBoardSerialPort
          };
        } else if (needs) {
          patch.serial = mergedSerial;
        }
      }
      const systemDefaults = { name: "", clientMode: false, ipMode: "auto", preferredIp: "", manualIp: "" };
      if (!parsed.system || typeof parsed.system !== "object") {
        patch.system = systemDefaults;
      } else {
        const s = parsed.system;
        const needs =
          !Object.prototype.hasOwnProperty.call(s, "name") ||
          !Object.prototype.hasOwnProperty.call(s, "clientMode") ||
          !Object.prototype.hasOwnProperty.call(s, "ipMode") ||
          !Object.prototype.hasOwnProperty.call(s, "preferredIp") ||
          !Object.prototype.hasOwnProperty.call(s, "manualIp");
        if (needs) patch.system = { ...systemDefaults, ...s };
      }
      const ingestDefaults = { ftpServer: { enabled: false, port: 21, rootDir: "", username: "", password: "" } };
      if (!parsed.ingest || typeof parsed.ingest !== "object") {
        patch.ingest = ingestDefaults;
      } else {
        const ingest = parsed.ingest;
        const ftpServerRaw = ingest?.ftpServer;
        if (!ftpServerRaw || typeof ftpServerRaw !== "object") {
          patch.ingest = { ...ingestDefaults, ...ingest, ftpServer: ingestDefaults.ftpServer };
        }
      }
      if (Object.keys(patch).length) {
        const next = { ...parsed, ...patch };
        try {
          await fs.writeFile(deviceInfoPath, JSON.stringify(next), "utf8");
        } catch {}
        return next;
      }
      return parsed;
    }
  } catch {}

  const info = {
    installDate: new Date().toISOString().slice(0, 10),
    secret: crypto.randomBytes(32).toString("base64"),
    createdAtMs: Date.now(),
    connection: { host: "", port: 80, username: "", password: "" },
    probe: { enabled: true, group: "239.255.255.250", port: 10086 },
    serial: { baudRate: DEFAULT_SERIAL_BAUD_RATE, forwardEnabled: false, backendPort: getPreferredLinuxBoardSerialPort(await listLinuxBoardSerialPorts()) },
    system: { name: "", clientMode: false, ipMode: "auto", preferredIp: "", manualIp: "" },
    ingest: { ftpServer: { enabled: false, port: 21, rootDir: "", username: "", password: "" } }
  };
  try {
    await fs.writeFile(deviceInfoPath, JSON.stringify(info), "utf8");
  } catch {}
  return info;
}

async function computeDeviceFingerprint() {
  const info = await loadOrInitDeviceInfo();
  const [cpuSerial, diskSerial] = await Promise.all([getCpuSerialBestEffort(), getDiskSerialBestEffort()]);
  const raw = `${cpuSerial}|${info.installDate}|${diskSerial}|${info.secret}`;
  const fingerprint = crypto.createHash("sha256").update(raw).digest("hex");
  return { fingerprint, installDate: info.installDate };
}

function toPositiveInt(v, fb) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fb;
  const x = Math.floor(n);
  if (x <= 0) return fb;
  return x;
}

function toBooleanLoose(value) {
  const text = String(value || "").trim().toLowerCase();
  return text === "1" || text === "true" || text === "yes" || text === "on";
}

function decodeBufferText(buf) {
  return Buffer.isBuffer(buf) ? buf.toString("utf8").replace(/^\uFEFF/, "") : String(buf || "");
}

function getMultipartBoundary(contentType) {
  const text = String(contentType || "");
  const m = text.match(/boundary="?([^";]+)"?/i);
  return m?.[1] ? m[1].trim() : "";
}

function parseMultipartParts(rawBody, contentType) {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) return [];
  const boundary = getMultipartBoundary(contentType);
  if (!boundary) return [];

  const marker = Buffer.from(`--${boundary}`);
  const parts = [];
  let cursor = rawBody.indexOf(marker);
  if (cursor < 0) return [];

  while (cursor >= 0) {
    let partStart = cursor + marker.length;
    if (rawBody[partStart] === 45 && rawBody[partStart + 1] === 45) break;
    if (rawBody[partStart] === 13 && rawBody[partStart + 1] === 10) partStart += 2;
    else if (rawBody[partStart] === 10) partStart += 1;

    const nextMarker = rawBody.indexOf(marker, partStart);
    if (nextMarker < 0) break;

    let partEnd = nextMarker;
    if (rawBody[partEnd - 2] === 13 && rawBody[partEnd - 1] === 10) partEnd -= 2;
    else if (rawBody[partEnd - 1] === 10) partEnd -= 1;

    const partBuffer = rawBody.subarray(partStart, partEnd);
    let headerEnd = partBuffer.indexOf(Buffer.from("\r\n\r\n"));
    let headerSepLength = 4;
    if (headerEnd < 0) {
      headerEnd = partBuffer.indexOf(Buffer.from("\n\n"));
      headerSepLength = 2;
    }
    if (headerEnd >= 0) {
      const headerText = decodeBufferText(partBuffer.subarray(0, headerEnd));
      const body = partBuffer.subarray(headerEnd + headerSepLength);
      const headers = {};
      for (const line of headerText.split(/\r?\n/)) {
        const idx = line.indexOf(":");
        if (idx <= 0) continue;
        const key = line.slice(0, idx).trim().toLowerCase();
        const value = line.slice(idx + 1).trim();
        if (!key) continue;
        headers[key] = value;
      }
      parts.push({ headers, body });
    }

    cursor = nextMarker;
  }

  return parts;
}

function parseContentDisposition(value) {
  const out = {};
  const text = String(value || "");
  for (const m of text.matchAll(/([a-zA-Z0-9_-]+)="([^"]*)"/g)) {
    out[String(m[1] || "").toLowerCase()] = m[2] || "";
  }
  return out;
}

function extractXmlTagValue(xml, names) {
  const source = String(xml || "");
  const list = Array.isArray(names) ? names : [names];
  for (const name of list) {
    const safe = String(name || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`<(?:(?:\\w+:)?${safe})>([\\s\\S]*?)<\\/(?:(?:\\w+:)?${safe})>`, "i");
    const match = source.match(re);
    if (match?.[1] != null) return String(match[1]).trim();
  }
  return "";
}

function extractJsonStringValue(text, keys) {
  const source = String(text || "");
  const list = Array.isArray(keys) ? keys : [keys];
  for (const key of list) {
    const safe = String(key || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`"${safe}"\\s*:\\s*"([^"]+)"`, "i");
    const match = source.match(re);
    if (match?.[1]) return match[1];
  }
  return "";
}

function normalizePlateText(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function pickPreferredJpegPart(imageParts) {
  if (!Array.isArray(imageParts) || !imageParts.length) return null;
  const rankPart = (part) => {
    const headerText = `${part?.headers?.["content-disposition"] || ""} ${part?.headers?.["content-type"] || ""}`.toLowerCase();
    if (headerText.includes("license") || headerText.includes("plate")) return 0;
    if (headerText.includes("detection")) return 1;
    if (headerText.includes("scene") || headerText.includes("vehicle") || headerText.includes("overview")) return 2;
    return 3;
  };
  return imageParts
    .map((part, idx) => ({ part, idx, rank: rankPart(part) }))
    .sort((a, b) => a.rank - b.rank || a.idx - b.idx)[0]?.part || null;
}

function buildSourceEventKey({ uuid, plate, eventType, eventAt, channelId, ipAddress }) {
  const uuidText = String(uuid || "").trim();
  if (uuidText) return `hikvision:${uuidText}`;
  const eventAtText = String(eventAt || "").trim();
  const plateText = normalizePlateText(plate);
  if (!plateText || !eventAtText) return "";
  const base = [plateText, String(eventType || "").trim(), eventAtText, String(channelId || "").trim(), String(ipAddress || "").trim()].join("|");
  const digest = crypto.createHash("sha1").update(base).digest("hex");
  return `hikvision:${digest}`;
}

function parseHikvisionIsapiEvent(rawBody, contentType) {
  const parts = parseMultipartParts(rawBody, contentType);
  const xmlTexts = [];
  const jsonTexts = [];
  const imageParts = [];

  for (const part of parts) {
    const type = String(part.headers["content-type"] || "").toLowerCase();
    const dispo = parseContentDisposition(part.headers["content-disposition"]);
    const filename = String(dispo.filename || "").toLowerCase();
    const fieldName = String(dispo.name || "").toLowerCase();

    if (type.includes("xml") || filename.endsWith(".xml") || fieldName.endsWith(".xml")) {
      xmlTexts.push(decodeBufferText(part.body));
      continue;
    }
    if (type.includes("json") || filename.endsWith(".json")) {
      jsonTexts.push(decodeBufferText(part.body));
      continue;
    }
    if (type.includes("image/jpeg") || type.includes("image/jpg") || filename.endsWith(".jpg") || filename.endsWith(".jpeg")) {
      imageParts.push(part);
    }
  }

  const bodyText = decodeBufferText(rawBody);
  if (!xmlTexts.length && /<[\w:]*EventNotificationAlert[\s>]/i.test(bodyText)) xmlTexts.push(bodyText);
  if (!jsonTexts.length && bodyText.trim().startsWith("{")) jsonTexts.push(bodyText);

  const xmlText = xmlTexts.find((text) => /<(?:\w+:)?ANPR[\s>]/i.test(text) || /<(?:\w+:)?EventNotificationAlert[\s>]/i.test(text)) || xmlTexts[0] || "";
  const jsonText = jsonTexts[0] || "";
  const plate = normalizePlateText(
    extractXmlTagValue(xmlText, ["licensePlate", "plateNumber", "plate"]) ||
      extractJsonStringValue(jsonText, ["licensePlate", "plateNumber", "plate"])
  );
  const eventType = extractXmlTagValue(xmlText, "eventType") || extractJsonStringValue(jsonText, "eventType");
  const eventState = extractXmlTagValue(xmlText, "eventState") || extractJsonStringValue(jsonText, "eventState");
  const eventTimeText = extractXmlTagValue(xmlText, ["dateTime", "eventTime", "time"]) || extractJsonStringValue(jsonText, ["dateTime", "eventTime", "time"]);
  const uuid =
    extractXmlTagValue(xmlText, ["UUID", "uuid", "eventID", "eventId"]) ||
    extractJsonStringValue(jsonText, ["UUID", "uuid", "eventID", "eventId"]);
  const channelId = extractXmlTagValue(xmlText, ["channelID", "channelId"]) || extractJsonStringValue(jsonText, ["channelID", "channelId"]);
  const ipAddress = extractXmlTagValue(xmlText, "ipAddress") || extractJsonStringValue(jsonText, "ipAddress");
  const isRetransmissionText =
    extractXmlTagValue(xmlText, "isDataRetransmission") || extractJsonStringValue(jsonText, "isDataRetransmission");
  const eventDate = eventTimeText ? new Date(eventTimeText) : null;
  const preferredJpeg = pickPreferredJpegPart(imageParts);
  const jpegBuffer = Buffer.isBuffer(preferredJpeg?.body) && preferredJpeg.body.length ? preferredJpeg.body : null;
  const sourceEventKey = buildSourceEventKey({
    uuid,
    plate,
    eventType,
    eventAt: Number.isFinite(eventDate?.getTime()) ? eventDate.toISOString() : "",
    channelId,
    ipAddress
  });

  return {
    plate,
    eventType: String(eventType || "").trim(),
    eventState: String(eventState || "").trim(),
    eventDate: Number.isFinite(eventDate?.getTime()) ? eventDate : null,
    jpegBuffer,
    imageBase64: jpegBuffer ? `data:image/jpeg;base64,${jpegBuffer.toString("base64")}` : "",
    sourceEventKey,
    isRetransmission: toBooleanLoose(isRetransmissionText),
    hasMultipart: parts.length > 0,
    xmlText
  };
}

async function postJsonWithTimeout(url, body, { timeoutMs } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), toPositiveInt(timeoutMs, 4000));
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal: ac.signal
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

function buildSelfHttpBase({ port, ipMode, preferredIp, manualIp }) {
  const explicit = String(process.env.PUBLIC_BASE_URL || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const ifaces = listPrivateIPv4();
  const mode = String(ipMode || "auto").trim().toLowerCase() === "manual" ? "manual" : "auto";
  const manual = String(manualIp || "").trim();
  const preferred = String(preferredIp || "").trim();
  const ip =
    (mode === "manual" && manual ? manual : "") ||
    (preferred && ifaces.some((i) => i.address === preferred) ? preferred : "") ||
    ifaces[0]?.address ||
    "127.0.0.1";
  return `http://${ip}:${port}`;
}

async function saveDeviceInfoPatch(patch) {
  if (!patch || typeof patch !== "object") return;
  const info = await loadOrInitDeviceInfo();
  const next = { ...info, ...patch };
  if (patch.serial && typeof patch.serial === "object") {
    const base = info.serial && typeof info.serial === "object" ? info.serial : {};
    next.serial = { ...base, ...patch.serial };
  }
  if (patch.system && typeof patch.system === "object") {
    const base = info.system && typeof info.system === "object" ? info.system : {};
    next.system = { ...base, ...patch.system };
  }
  if (patch.ingest && typeof patch.ingest === "object") {
    const base = info.ingest && typeof info.ingest === "object" ? info.ingest : {};
    next.ingest = { ...base, ...patch.ingest };
    if (patch.ingest.ftpServer && typeof patch.ingest.ftpServer === "object") {
      const ftpBase = base.ftpServer && typeof base.ftpServer === "object" ? base.ftpServer : {};
      next.ingest.ftpServer = { ...ftpBase, ...patch.ingest.ftpServer };
    }
  }
  try {
    await fs.writeFile(deviceInfoPath, JSON.stringify(next), "utf8");
  } catch {}
}

async function resolveRegistryBaseUrl({ clientId, installDate }) {
  const explicit = String(process.env.REGISTRY_BASE_URL || "").trim().replace(/\/+$/, "");
  if (explicit) return explicit;

  const info = await loadOrInitDeviceInfo();
  const saved = String(info?.registryBaseUrl || "").trim().replace(/\/+$/, "");
  if (saved) return saved;

  const provisionBase = String(process.env.PROVISION_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!provisionBase) return "";

  const provisionPath = String(process.env.PROVISION_REGISTRY_PATH || "/api/provision/registry-base-url");
  const provisionUrl = `${provisionBase}${provisionPath.startsWith("/") ? "" : "/"}${provisionPath}`;
  const requestTimeoutMs = toPositiveInt(process.env.PROVISION_REQUEST_TIMEOUT_MS, 3500);

  const payload = {
    clientId: String(clientId || ""),
    installDate: String(installDate || ""),
    ipList: listPrivateIPv4().map((i) => i.address),
    ts: Date.now()
  };

  const r = await postJsonWithTimeout(provisionUrl, payload, { timeoutMs: requestTimeoutMs });
  if (!r.ok) return "";
  const discovered = String(r.data?.registryBaseUrl || "").trim().replace(/\/+$/, "");
  if (!discovered) return "";
  await saveDeviceInfoPatch({ registryBaseUrl: discovered, registryProvisionedAtMs: Date.now() });
  return discovered;
}

async function startRegistryReporter({ port }) {
  const registerPath = String(process.env.REGISTRY_REGISTER_PATH || "/api/registry/register");
  const heartbeatPath = String(process.env.REGISTRY_HEARTBEAT_PATH || "/api/registry/heartbeat");
  const heartbeatIntervalSec = toPositiveInt(process.env.REGISTRY_HEARTBEAT_INTERVAL_SEC, 300);
  const requestTimeoutMs = toPositiveInt(process.env.REGISTRY_REQUEST_TIMEOUT_MS, 3500);

  const { fingerprint, installDate } = await computeDeviceFingerprint();
  const clientId = fingerprint;
  const getCurrentAnnounce = async () => {
    try {
      const info = await loadOrInitDeviceInfo();
      const system = normalizeSystemConfig(info?.system);
      const name = system.name || os.hostname();
      const httpBase = buildSelfHttpBase({
        port,
        ipMode: system.ipMode,
        preferredIp: system.preferredIp,
        manualIp: system.manualIp
      });
      return { name, httpBase };
    } catch {
      return { name: os.hostname(), httpBase: `http://127.0.0.1:${port}` };
    }
  };

  let base = "";
  let registerUrl = "";
  let heartbeatUrl = "";

  const capabilities = ["onvif-viewer", "hls"];

  let token = "";
  let registered = false;
  let timer = null;
  let stopped = false;
  let ticking = false;

  const register = async () => {
    const { name, httpBase } = await getCurrentAnnounce();
    const payload = {
      clientId,
      name,
      capabilities,
      service: { httpBase },
      ipList: listPrivateIPv4().map((i) => i.address),
      ts: Date.now()
    };
    const r = await postJsonWithTimeout(registerUrl, payload, { timeoutMs: requestTimeoutMs });
    if (!r.ok) throw new Error(`register failed: ${r.status}`);
    token = String(r.data?.token || "");
    registered = true;
  };

  const heartbeat = async () => {
    const { name } = await getCurrentAnnounce();
    const payload = {
      clientId,
      ts: Date.now(),
      status: "online",
      name,
      token: token || undefined
    };
    const r = await postJsonWithTimeout(heartbeatUrl, payload, { timeoutMs: requestTimeoutMs });
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) {
        registered = false;
        token = "";
      }
      throw new Error(`heartbeat failed: ${r.status}`);
    }
  };

  const loop = async () => {
    if (stopped) return;
    const tick = async () => {
      if (ticking) return;
      ticking = true;
      try {
        if (!base) {
          base = await resolveRegistryBaseUrl({ clientId, installDate });
          if (base) {
            registerUrl = `${base}${registerPath.startsWith("/") ? "" : "/"}${registerPath}`;
            heartbeatUrl = `${base}${heartbeatPath.startsWith("/") ? "" : "/"}${heartbeatPath}`;
          } else {
            return;
          }
        }
        if (!registered) {
          try {
            await register();
          } catch {}
        }
        await heartbeat();
      } catch {}
      finally {
        ticking = false;
      }
    };
    await tick();
    timer = setInterval(tick, heartbeatIntervalSec * 1000);
    return tick;
  };

  const tick = await loop();

  return {
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
    },
    wake() {
      try {
        tick?.();
      } catch {}
    }
  };
}

function isHttpUrl(s) {
  const v = String(s || "").trim();
  return v.startsWith("http://") || v.startsWith("https://");
}

function normalizeProbeConfig(raw) {
  const enabledRaw = raw?.enabled;
  const enabled = enabledRaw == null ? true : Boolean(enabledRaw);
  const group = String(raw?.group || "239.255.255.250").trim() || "239.255.255.250";
  const port = toPositiveInt(raw?.port, 10086);
  return { enabled, group, port };
}

function normalizeConnectionConfig(raw) {
  const host = String(raw?.host || "").trim();
  const port = toPort(raw?.port, 80);
  const username = String(raw?.username || "");
  const password = String(raw?.password || "");
  return { host, port: port || 80, username, password };
}

function toUInt16OrUndefined(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  const x = Math.floor(n);
  if (x < 0 || x > 65535) return undefined;
  return x;
}

function normalizeSerialConfig(raw) {
  const baudRate = toPositiveInt(raw?.baudRate, DEFAULT_SERIAL_BAUD_RATE);
  const usbVendorId = toUInt16OrUndefined(raw?.usbVendorId);
  const usbProductId = toUInt16OrUndefined(raw?.usbProductId);
  const forwardEnabled = Boolean(raw?.forwardEnabled);
  const backendPort = String(raw?.backendPort || "").trim();
  const out = { baudRate, forwardEnabled, backendPort };
  if (usbVendorId != null) out.usbVendorId = usbVendorId;
  if (usbProductId != null) out.usbProductId = usbProductId;
  return out;
}

function normalizeSerialPatch(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  if (Object.prototype.hasOwnProperty.call(raw, "baudRate")) {
    out.baudRate = toPositiveInt(raw.baudRate, DEFAULT_SERIAL_BAUD_RATE);
  }
  if (Object.prototype.hasOwnProperty.call(raw, "forwardEnabled")) {
    out.forwardEnabled = Boolean(raw.forwardEnabled);
  }
  if (Object.prototype.hasOwnProperty.call(raw, "backendPort")) {
    out.backendPort = String(raw.backendPort || "").trim().slice(0, 64);
  }
  if (Object.prototype.hasOwnProperty.call(raw, "usbVendorId")) {
    const v = toUInt16OrUndefined(raw.usbVendorId);
    if (v != null) out.usbVendorId = v;
  }
  if (Object.prototype.hasOwnProperty.call(raw, "usbProductId")) {
    const v = toUInt16OrUndefined(raw.usbProductId);
    if (v != null) out.usbProductId = v;
  }
  return Object.keys(out).length ? out : null;
}

function isValidIpv4(value) {
  const s = String(value || "").trim();
  if (!s) return false;
  const parts = s.split(".");
  if (parts.length !== 4) return false;
  for (const p of parts) {
    if (!p || p.length > 3) return false;
    if (!/^\d+$/.test(p)) return false;
    const n = Number(p);
    if (!Number.isFinite(n) || n < 0 || n > 255) return false;
  }
  return true;
}

function normalizeSystemConfig(raw) {
  const name = String(raw?.name || "").trim();
  const clientMode = Boolean(raw?.clientMode);
  const ipMode = String(raw?.ipMode || "auto").trim().toLowerCase() === "manual" ? "manual" : "auto";
  const preferredIpRaw = String(raw?.preferredIp || "").trim();
  const manualIpRaw = String(raw?.manualIp || "").trim();
  const preferredIp = isValidIpv4(preferredIpRaw) ? preferredIpRaw : "";
  const manualIp = isValidIpv4(manualIpRaw) ? manualIpRaw : "";
  return { name, clientMode, ipMode, preferredIp, manualIp };
}

function normalizeSystemPatch(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  if (Object.prototype.hasOwnProperty.call(raw, "name")) {
    out.name = String(raw.name || "").trim().slice(0, 80);
  }
  if (Object.prototype.hasOwnProperty.call(raw, "clientMode")) {
    out.clientMode = Boolean(raw.clientMode);
  }
  if (Object.prototype.hasOwnProperty.call(raw, "ipMode")) {
    const mode = String(raw.ipMode || "").trim().toLowerCase();
    out.ipMode = mode === "manual" ? "manual" : "auto";
  }
  if (Object.prototype.hasOwnProperty.call(raw, "preferredIp")) {
    const v = String(raw.preferredIp || "").trim();
    out.preferredIp = isValidIpv4(v) ? v : "";
  }
  if (Object.prototype.hasOwnProperty.call(raw, "manualIp")) {
    const v = String(raw.manualIp || "").trim();
    out.manualIp = isValidIpv4(v) ? v : "";
  }
  return Object.keys(out).length ? out : null;
}

function normalizeIngestConfig(raw) {
  const ftpServer = normalizeFtpServerConfig(raw?.ftpServer);
  return { ftpServer };
}

function normalizeIngestPatch(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  if (raw.ftpServer && typeof raw.ftpServer === "object") {
    const ftpOut = {};
    if (Object.prototype.hasOwnProperty.call(raw.ftpServer, "enabled")) {
      ftpOut.enabled = Boolean(raw.ftpServer.enabled);
    }
    if (Object.prototype.hasOwnProperty.call(raw.ftpServer, "port")) {
      ftpOut.port = toPort(raw.ftpServer.port, 21) || 21;
    }
    if (Object.prototype.hasOwnProperty.call(raw.ftpServer, "rootDir")) {
      ftpOut.rootDir = String(raw.ftpServer.rootDir || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(raw.ftpServer, "username")) {
      ftpOut.username = String(raw.ftpServer.username || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(raw.ftpServer, "password")) {
      ftpOut.password = String(raw.ftpServer.password || "");
    }
    if (Object.keys(ftpOut).length) out.ftpServer = ftpOut;
  }
  return Object.keys(out).length ? out : null;
}

async function getClientConfig() {
  const info = await loadOrInitDeviceInfo();
  const connection = normalizeConnectionConfig(info?.connection);
  const probe = normalizeProbeConfig(info?.probe);
  const serial = normalizeSerialConfig(info?.serial);
  const system = normalizeSystemConfig(info?.system);
  const ingest = normalizeIngestConfig(info?.ingest);
  const registryBaseUrl = String(info?.registryBaseUrl || "").trim().replace(/\/+$/, "");
  return { connection, probe, serial, system, ingest, registryBaseUrl };
}

async function startProbeResponder({ port, reporter }) {
  const info = await loadOrInitDeviceInfo();
  const probe = normalizeProbeConfig(info?.probe);
  if (!probe.enabled) return { stop() {} };

  const group = probe.group;
  const probePort = probe.port;

  const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
  let closed = false;

  const stop = () => {
    if (closed) return;
    closed = true;
    try {
      sock.close();
    } catch {}
  };

  sock.on("error", () => {
    stop();
  });

  sock.on("message", async (msg, rinfo) => {
    const text = msg.toString("utf8").trim();
    let payload = null;
    if (text.startsWith("{") && text.endsWith("}")) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }
    if (!payload || payload.t !== "probe") return;

    const registryBaseUrl = String(payload.registryBaseUrl || "").trim();
    if (isHttpUrl(registryBaseUrl)) {
      await saveDeviceInfoPatch({ registryBaseUrl: registryBaseUrl.replace(/\/+$/, ""), registryProvisionedAtMs: Date.now() });
      try {
        reporter?.wake?.();
      } catch {}
    }

    let fp = "";
    let installDate = "";
    try {
      const d = await computeDeviceFingerprint();
      fp = d.fingerprint || "";
      installDate = d.installDate || "";
    } catch {}
    let displayName = os.hostname();
    let systemCfg = { ipMode: "auto", preferredIp: "", manualIp: "" };
    try {
      const currentInfo = await loadOrInitDeviceInfo();
      const system = normalizeSystemConfig(currentInfo?.system);
      displayName = system.name || displayName;
      systemCfg = system;
    } catch {}
    const match = {
      t: "match",
      clientId: fp,
      name: displayName,
      installDate,
      ipList: listPrivateIPv4().map((i) => i.address),
      service: {
        httpBase: buildSelfHttpBase({
          port,
          ipMode: systemCfg.ipMode,
          preferredIp: systemCfg.preferredIp,
          manualIp: systemCfg.manualIp
        })
      },
      ts: Date.now()
    };
    const replyPort = toPositiveInt(payload.replyPort, rinfo.port);
    const buf = Buffer.from(JSON.stringify(match), "utf8");
    try {
      sock.send(buf, 0, buf.length, replyPort, rinfo.address);
    } catch {}
  });

  sock.bind(probePort, "0.0.0.0", () => {
    try {
      sock.setMulticastLoopback(false);
    } catch {}
    const ifaces = listPrivateIPv4().map((i) => i.address);
    if (ifaces.length) {
      for (const addr of ifaces) {
        try {
          sock.addMembership(group, addr);
        } catch {}
      }
    } else {
      try {
        sock.addMembership(group);
      } catch {}
    }
  });

  return { stop };
}
app.use(
  "/streams",
  express.static(streamsDir, {
    fallthrough: false,
    setHeaders(res, filePath) {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === ".m3u8") {
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      } else if (ext === ".ts") {
        res.setHeader("Content-Type", "video/mp2t");
      }
      res.setHeader("Cache-Control", "no-store");
    }
  })
);
app.use(
  "/vendor/hls",
  express.static(path.join(__dirname, "node_modules", "hls.js", "dist"), {
    fallthrough: false
  })
);

function listPrivateIPv4() {
  const ifaces = os.networkInterfaces();
  const out = [];
  for (const name of Object.keys(ifaces)) {
    for (const i of ifaces[name] || []) {
      if (i.family !== "IPv4" || i.internal) continue;
      const ip = i.address;
      if (
        ip.startsWith("10.") ||
        ip.startsWith("172.16.") ||
        ip.startsWith("172.17.") ||
        ip.startsWith("172.18.") ||
        ip.startsWith("172.19.") ||
        ip.startsWith("172.2") ||
        ip.startsWith("192.168.")
      ) {
        out.push({ name, address: ip, netmask: i.netmask || "" });
      }
    }
  }
  return out;
}

function ipv4ToInt(ip) {
  const parts = String(ip || "")
    .trim()
    .split(".")
    .map((x) => Number(x));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return (((parts[0] << 24) >>> 0) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function intToIpv4(value) {
  const n = Number(value) >>> 0;
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

function computeBroadcastAddress(ip, netmask) {
  const ipInt = ipv4ToInt(ip);
  const maskInt = ipv4ToInt(netmask);
  if (ipInt == null || maskInt == null) return "";
  return intToIpv4((ipInt | (~maskInt >>> 0)) >>> 0);
}

function xmlEscape(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function parseBooleanText(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;
  if (["true", "1", "yes", "on"].includes(text)) return true;
  if (["false", "0", "no", "off"].includes(text)) return false;
  return null;
}

function buildSadpInquiryMessage(uuid) {
  return Buffer.from(
    `<?xml version="1.0" encoding="utf-8"?><Probe><Uuid>${xmlEscape(uuid)}</Uuid><Types>inquiry</Types></Probe>`,
    "utf8"
  );
}

function parseSadpDiscoveryXml(xmlText, rinfo = {}) {
  const xml = String(xmlText || "");
  if (!xml || !/<(?:\w+:)?ProbeMatch[\s>]/i.test(xml)) return null;
  const probeUuid = extractXmlTagValue(xml, "Uuid");
  const types = extractXmlTagValue(xml, "Types");
  const ip = extractXmlTagValue(xml, ["IPv4Address", "Ipv4Address"]) || String(rinfo.address || "").trim();
  if (!ip) return null;
  const httpPort = toPort(extractXmlTagValue(xml, "HttpPort"), 80);
  const commandPort = toPort(extractXmlTagValue(xml, "CommandPort"), 8000);
  const mac = extractXmlTagValue(xml, "MAC");
  const deviceDescription = extractXmlTagValue(xml, "DeviceDescription");
  const deviceType = extractXmlTagValue(xml, "DeviceType");
  const deviceSn = extractXmlTagValue(xml, ["DeviceSN", "SerialNO", "DeviceSerialNo"]);
  const activated = parseBooleanText(extractXmlTagValue(xml, "Activated"));
  const dhcp = parseBooleanText(extractXmlTagValue(xml, "DHCP"));
  const softwareVersion = extractXmlTagValue(xml, "SoftwareVersion");
  const dspVersion = extractXmlTagValue(xml, "DSPVersion");
  const bootTime = extractXmlTagValue(xml, "BootTime");
  const nameParts = ["[SADP]"];
  if (deviceDescription) nameParts.push(deviceDescription);
  if (deviceSn) nameParts.push(deviceSn);
  const name = nameParts.join(" ").trim();
  return {
    source: "sadp",
    protocol: "hikvision-sadp",
    name,
    host: ip,
    port: httpPort,
    xaddrs: [`http://${ip}:${httpPort}`],
    sadp: {
      uuid: probeUuid,
      types,
      ip,
      mac,
      httpPort,
      commandPort,
      deviceType,
      deviceDescription,
      deviceSn,
      activated,
      dhcp,
      softwareVersion,
      dspVersion,
      bootTime
    }
  };
}

async function getLinuxSerialByIdMap() {
  const out = new Map();
  if (process.platform !== "linux") return out;
  const baseDir = "/dev/serial/by-id";
  try {
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      const name = String(entry?.name || "").trim();
      if (!name) continue;
      const aliasPath = path.posix.join(baseDir, name);
      try {
        const target = await fs.readlink(aliasPath);
        const resolved = path.posix.resolve(baseDir, target);
        out.set(resolved, aliasPath);
      } catch {}
    }
  } catch {}
  return out;
}

async function sadpDiscover({ timeoutMs = 2500, port = 37020 } = {}) {
  const waitMs = Math.max(500, Math.min(10_000, toPositiveInt(timeoutMs, 2500)));
  const udpPort = toPort(port, 37020);
  const inquiryUuid = crypto.randomUUID().toUpperCase();
  const payload = buildSadpInquiryMessage(inquiryUuid);
  const devices = [];
  const seen = new Set();
  const targets = new Set(["239.255.255.250", "255.255.255.255"]);
  for (const iface of listPrivateIPv4()) {
    const broadcast = computeBroadcastAddress(iface.address, iface.netmask);
    if (broadcast) targets.add(broadcast);
  }

  await new Promise((resolve, reject) => {
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {}
      if (err) reject(err);
      else resolve();
    };
    const timer = setTimeout(() => finish(), waitMs);

    socket.on("message", (msg, rinfo) => {
      try {
        const device = parseSadpDiscoveryXml(msg.toString("utf8"), rinfo);
        if (!device) return;
        const key = `${device.host}|${device.sadp?.mac || ""}|${device.port}`;
        if (seen.has(key)) return;
        seen.add(key);
        devices.push(device);
      } catch {}
    });
    socket.on("error", (err) => finish(err));
    socket.bind(0, "0.0.0.0", () => {
      try {
        socket.setBroadcast(true);
        socket.setMulticastTTL(2);
      } catch {}
      for (const host of targets) {
        socket.send(payload, udpPort, host, () => undefined);
      }
    });
  });

  return devices.sort((a, b) => String(a.host || "").localeCompare(String(b.host || "")));
}

app.get("/api/net/ifaces", (req, res) => {
  res.json({ interfaces: listPrivateIPv4() });
});

app.get("/api/serial/ports", async (req, res) => {
  try {
    const byIdMap = await getLinuxSerialByIdMap();
    const list = await SerialPort.list();
    const ports = Array.isArray(list)
      ? list.map((p) => ({
          path: p.path || p.comName || "",
          byIdPath: byIdMap.get(String(p.path || p.comName || "").trim()) || "",
          friendlyName: p.friendlyName || "",
          manufacturer: p.manufacturer || "",
          serialNumber: p.serialNumber || "",
          vendorId: p.vendorId || "",
          productId: p.productId || "",
          pnpId: p.pnpId || ""
        }))
      : [];
    res.json({ ports });
  } catch {
    res.json({ ports: [] });
  }
});

app.get("/api/serial/status", async (req, res, next) => {
  try {
    const config = await getClientConfig();
    res.json({ ok: true, backend: getBackendSerialStatus(config?.serial) });
  } catch (err) {
    next(err);
  }
});

app.post("/api/serial/connect", async (req, res, next) => {
  try {
    const config = await getClientConfig();
    const serial = normalizeBackendSerialConfig(config?.serial);
    if (!serial.forwardEnabled) {
      const err = new Error("后端串口转发未开启");
      err.statusCode = 409;
      throw err;
    }
    if (!serial.backendPort) {
      const err = new Error("未配置后端串口端口");
      err.statusCode = 409;
      throw err;
    }
    await ensureBackendSerial(config?.serial);
    res.json({ ok: true, backend: getBackendSerialStatus(config?.serial) });
  } catch (err) {
    next(err);
  }
});

app.post("/api/serial/disconnect", async (req, res, next) => {
  try {
    await stopBackendSerial();
    const config = await getClientConfig();
    res.json({ ok: true, backend: getBackendSerialStatus(config?.serial) });
  } catch (err) {
    next(err);
  }
});

app.post("/api/serial/send", async (req, res, next) => {
  try {
    const text = String(req.body?.text || "");
    if (!text) {
      res.status(400).json({ error: "Bad request" });
      return;
    }
    const config = await getClientConfig();
    const serialCfg = normalizeBackendSerialConfig(config?.serial);
    if (!serialCfg.backendPort) {
      res.status(409).json({ error: "Backend serial is not configured" });
      return;
    }
    if (!backendSerialPort?.isOpen) {
      res.status(409).json({ error: "Backend serial is not connected" });
      return;
    }
    const ok = await backendSerialEnqueueWrite(text);
    if (!ok) {
      res.status(502).json({ error: "后端串口写入失败" });
      return;
    }
    const nextStatus = getBackendSerialStatus(serialCfg);
    res.json({ ok: true, backend: nextStatus });
  } catch (err) {
    next(err);
  }
});

app.get("/api/plates/latest", (req, res) => {
  const limit = toPositiveInt(req.query?.limit, 2000);
  const max = Math.max(1, Math.min(5000, limit));
  const rows = stmtPlateListLatest.all(max);
  const items = rows.map(rowToPlateDto);
  res.json({ ok: true, items });
});

app.get("/api/plates/:id", (req, res) => {
  const id = String(req.params.id || "");
  if (!id) {
    res.status(400).json({ error: "Bad request" });
    return;
  }
  const row = stmtPlateGet.get(id);
  const dto = rowToPlateDto(row);
  if (!dto) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true, record: dto });
});

app.get("/api/plates/image/:id", (req, res) => {
  const id = String(req.params.id || "");
  if (!id) return res.status(400).end();
  const row = stmtPlateGet.get(id);
  if (!row) return res.status(404).end();
  const rel = String(row.imagePath || "");
  if (!rel) return res.status(404).end();
  const abs = path.resolve(uploadsDir, rel);
  if (!abs.startsWith(path.resolve(uploadsDir) + path.sep) && abs !== path.resolve(uploadsDir)) return res.status(403).end();
  res.sendFile(abs, { headers: { "Cache-Control": "no-store" } }, (err) => {
    if (err) {
      try {
        res.status(err.statusCode || 404).end();
      } catch {}
    }
  });
});

app.post("/api/plates/:id/serial-sent", (req, res) => {
  const id = String(req.params.id || "");
  const sentAt = Number(req.body?.sentAt || 0);
  if (!id || !Number.isFinite(sentAt) || sentAt <= 0) {
    res.status(400).json({ error: "Bad request" });
    return;
  }
  stmtPlateUpdateSerialSent.run(Math.floor(sentAt), id);
  res.json({ ok: true });
});

app.post("/api/plates/delete", (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const changes = deletePlatesByIds(ids);
  res.json({ ok: true, deleted: changes });
});

app.post("/api/plates/mock", (req, res) => {
  const count = Math.max(1, Math.min(2000, toPositiveInt(req.body?.count, 50)));
  const now = Date.now();
  const plates = ["娴滅徆12345", "濞岀嫙23456", "缁棭34567", "濞存45678", "閼诲粛56789", "妞翠笚67890"];
  const tx = plateDb.transaction(() => {
    for (let i = 0; i < count; i += 1) {
      const receivedAt = now - (count - i) * 60_000;
      const id = newPlateId(receivedAt);
      const plate = plates[i % plates.length];
      const rec = {
        id,
        plate,
        receivedAt,
        eventAt: receivedAt,
        imagePath: "",
        sourceEventKey: "",
        ftpRemotePath: "",
        serialSentAt: 0
      };
      stmtPlateInsert.run(rec);
    }
  });
  try {
    tx();
  } catch {}
  res.json({ ok: true });
});

app.get("/api/device/fingerprint", async (req, res, next) => {
  try {
    res.json(await computeDeviceFingerprint());
  } catch (err) {
    next(err);
  }
});

app.get("/api/device/config", async (req, res, next) => {
  try {
    const config = await getClientConfig();
    res.json({ ok: true, config });
  } catch (err) {
    next(err);
  }
});

app.post("/api/device/config", async (req, res, next) => {
  try {
    const patch = {};
    if (req.body?.connection && typeof req.body.connection === "object") {
      patch.connection = normalizeConnectionConfig(req.body.connection);
    }
    if (req.body?.probe && typeof req.body.probe === "object") {
      patch.probe = normalizeProbeConfig(req.body.probe);
    }
    if (req.body?.serial && typeof req.body.serial === "object") {
      const serialPatch = normalizeSerialPatch(req.body.serial);
      if (serialPatch) patch.serial = serialPatch;
    }
    if (req.body?.system && typeof req.body.system === "object") {
      const systemPatch = normalizeSystemPatch(req.body.system);
      if (systemPatch) patch.system = systemPatch;
    }
    if (req.body?.ingest && typeof req.body.ingest === "object") {
      const ingestPatch = normalizeIngestPatch(req.body.ingest);
      if (ingestPatch) patch.ingest = ingestPatch;
    }
    if (typeof req.body?.registryBaseUrl === "string") {
      const v = String(req.body.registryBaseUrl || "").trim().replace(/\/+$/, "");
      if (!v || isHttpUrl(v)) patch.registryBaseUrl = v;
    }
    await saveDeviceInfoPatch(patch);
    const config = await getClientConfig();
    try {
      await ensureFtpServer(config?.ingest?.ftpServer);
    } catch (e) {
      const err = new Error(`FTP 服务启动失败：${String(e?.message || e || "")}`);
      err.statusCode = 502;
      throw err;
    }
    try {
      await ensureBackendSerial(config?.serial);
    } catch (e) {
      const err = new Error(`后端串口启动失败：${String(e?.message || e || "")}`);
      err.statusCode = 502;
      throw err;
    }
    try {
      await applyDiscoveryServices({ port: currentHttpPort || basePort });
    } catch (e) {
      const err = new Error(`客户端模式应用失败：${String(e?.message || e || "")}`);
      err.statusCode = 502;
      throw err;
    }
    res.json({ ok: true, config });
  } catch (err) {
    next(err);
  }
});

const sseClients = new Set();

app.get("/api/events/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  
  sseClients.add(res);
  
  req.on("close", () => {
    sseClients.delete(res);
  });
});

function broadcastEvent(data) {
  for (const client of sseClients) {
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

function getFtpConfig() {
  const host = String(process.env.FTP_HOST || "").trim();
  const user = String(process.env.FTP_USER || "").trim();
  const password = String(process.env.FTP_PASS || "");
  const portRaw = Number(process.env.FTP_PORT);
  const port = Number.isFinite(portRaw) && portRaw > 0 ? portRaw : 21;
  const secureText = String(process.env.FTP_SECURE || "").trim().toLowerCase();
  const secure = secureText === "1" || secureText === "true" || secureText === "yes";
  const baseDirRaw = String(process.env.FTP_BASE_DIR || "/plates").trim();
  const baseDir = baseDirRaw ? baseDirRaw.replace(/\/+$/, "") : "/plates";

  return {
    enabled: Boolean(host && user && password),
    host,
    port,
    user,
    password,
    secure,
    baseDir
  };
}

function sanitizeNamePart(value) {
  const v = String(value || "").trim();
  if (!v) return "unknown";
  return v
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "unknown";
}

function formatDateFolderParts(date) {
  const d = date instanceof Date ? date : new Date();
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return { y, m, day };
}

function formatTimestampForFile(date) {
  const d = date instanceof Date ? date : new Date();
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${y}${m}${day}_${hh}${mm}${ss}_${ms}`;
}

function planPlateFtpUpload({ plate, eventDate }) {
  const cfg = getFtpConfig();
  if (!cfg.enabled) return null;
  const { y, m, day } = formatDateFolderParts(eventDate);
  const safePlate = sanitizeNamePart(plate);
  const remoteDir = `${cfg.baseDir}/${y}/${m}/${day}`;
  const remoteName = `${formatTimestampForFile(eventDate)}_${safePlate}.jpg`;
  const remotePath = `${remoteDir}/${remoteName}`;
  return { remoteDir, remoteName, remotePath };
}

async function uploadPlateJpegToFtp({ jpegBuffer, remoteDir, remoteName }) {
  const cfg = getFtpConfig();
  if (!cfg.enabled) return;
  const client = new ftp.Client(15_000);
  try {
    client.ftp.socketTimeout = 15_000;
    await client.access({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      secure: cfg.secure
    });
    await client.ensureDir(remoteDir);
    await client.uploadFrom(Readable.from(jpegBuffer), remoteName);
  } finally {
    client.close();
  }
}

app.post("/api/isapi/event", express.raw({ type: "*/*", limit: "50mb" }), async (req, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
    const parsed = parseHikvisionIsapiEvent(rawBody, req.headers["content-type"] || "");
    const plate = parsed.plate;
    const eventType = String(parsed.eventType || "").trim().toUpperCase();
    const eventState = String(parsed.eventState || "").trim().toLowerCase();
    const isAnprLike = !eventType || eventType.includes("ANPR") || eventType.includes("PLATE");
    
    // 閺€顖涘瘮 XML 閹?JSON 閺嶇厧绱￠惃鍕簠閻楀苯褰块幓鎰絿
    const imageBase64 = parsed.imageBase64;
    const jpegBuffer = parsed.jpegBuffer;

    // 鐏忔繆鐦憴锝嗙€?multipart 閹绘劕褰囬崶鍓у (JPEG)
    // 缁犫偓閸楁洜娈戞禍宀冪箻閸掕埖鎮崇槐銏＄叀閹?JPEG header (FF D8 FF) 閸?footer (FF D9)
    if (plate && isAnprLike && (!eventState || eventState === "active")) {
      if (parsed.sourceEventKey) {
        const existing = stmtPlateGetBySourceEventKey.get(parsed.sourceEventKey);
        if (existing) {
          res.status(200).send("OK");
          return;
        }
      }
      console.log(`[ISAPI] 鐠囧棗鍩嗛崚鎷屾簠閻? ${plate}`);
      const eventDate = parsed.eventDate || new Date();
      const timestamp = eventDate.toISOString();
      const receivedAt = Date.now();
      const id = newPlateId(receivedAt);
      const ftpPlan = jpegBuffer ? planPlateFtpUpload({ plate, eventDate }) : null;
      if (jpegBuffer && ftpPlan) {
        setImmediate(() => {
          uploadPlateJpegToFtp({ jpegBuffer, remoteDir: ftpPlan.remoteDir, remoteName: ftpPlan.remoteName }).catch((err) => {
            console.error("[FTP] upload failed:", err?.message || String(err));
          });
        });
      }
      let imagePath = "";
      if (jpegBuffer) {
        try {
          imagePath = await savePlateJpegToDisk({ jpegBuffer, eventDate, plate, id });
        } catch {}
      }
      try {
        stmtPlateInsert.run({
          id,
          plate: String(plate || ""),
          receivedAt,
          eventAt: eventDate.getTime(),
          imagePath,
          sourceEventKey: parsed.sourceEventKey || "",
          ftpRemotePath: ftpPlan?.remotePath || "",
          serialSentAt: 0
        });
      } catch {}
      const imageUrl = imagePath ? `/api/plates/image/${encodeURIComponent(id)}` : "";
      broadcastEvent({
        type: "lpr",
        id,
        plate,
        timestamp,
        receivedAt,
        eventAt: eventDate.getTime(),
        image: imageBase64,
        imageUrl,
        ftpRemotePath: ftpPlan?.remotePath || ""
      });
      const serialCfg = normalizeBackendSerialConfig((await getClientConfig())?.serial);
      if (backendSerialPort && serialCfg.forwardEnabled) {
        setImmediate(() => {
          backendSerialEnqueueWrite(plate + "\r\n").then((ok) => {
            if (ok) {
              try {
                stmtPlateUpdateSerialSent.run(Date.now(), id);
              } catch {}
            }
          });
        });
      }
    } else if (parsed.xmlText) {
      const shortType = parsed.eventType ? String(parsed.eventType) : "unknown";
      console.log(`[ISAPI] ignore event type=${shortType} state=${parsed.eventState || "unknown"} plate=${plate || "-"}`);
    }

    // 韫囧懘銆忕紒娆愭啔閸嶅繐銇旀潻鏂挎礀 200 OK閿涘苯鎯侀崚娆愭啔閸嶅繐銇旈崣顖濆厴娴兼俺顓绘稉鍝勫絺闁礁銇戠拹銉ヨ嫙闁插秷鐦?
    res.status(200).send("OK");
  } catch (err) {
    console.error("ISAPI event parse error:", err);
    res.status(500).send("Error");
  }
});

async function scanSubnet({ base, start, end, ports, timeoutMs }) {
  const results = [];
  const tasks = [];
  const limit = 80;
  let running = 0;
  let ipIdx = start;
  let portIdx = 0;

  const pickNext = () => {
    if (ipIdx > end) return null;
    const ip = `${base}${ipIdx}`;
    const port = ports[portIdx];
    portIdx += 1;
    if (portIdx >= ports.length) {
      portIdx = 0;
      ipIdx += 1;
    }
    return { ip, port };
  };

  const next = async () => {
    while (running < limit) {
      const item = pickNext();
      if (!item) break;
      const { ip, port } = item;
      running += 1;
      const p = (async () => {
        const paths = ["/onvif/device_service", "/onvif/devices", "/onvif/device_service?wsdl"];
        for (const pth of paths) {
          const url = `http://${ip}:${port}${pth}`;
          const ac = new AbortController();
          const t = setTimeout(() => ac.abort(), timeoutMs);
          try {
            const res = await fetch(url, { method: "GET", signal: ac.signal });
            if (res.ok || res.status === 401 || res.status === 405 || res.status === 500 || res.status === 404) {
              results.push({ host: ip, port, xaddrs: [url] });
              clearTimeout(t);
              return;
            }
          } catch {}
          clearTimeout(t);
        }
      })().finally(() => {
        running -= 1;
      });
      tasks.push(p);
    }
    if (ipIdx <= end) {
      await Promise.race(tasks);
      return next();
    }
  };
  await next();
  await Promise.allSettled(tasks);
  return results;
}

app.post("/api/onvif/scan-subnet", async (req, res, next) => {
  try {
    const ifaces = listPrivateIPv4();
    const pick = ifaces[0]?.address || "192.168.1.1";
    const parts = pick.split(".");
    const base = (req.body?.base && String(req.body.base)) || `${parts[0]}.${parts[1]}.${parts[2]}.`;
    const portsInput = Array.isArray(req.body?.ports) ? req.body.ports : undefined;
    const singlePort = toPort(req.body?.port, undefined);
    const commonPorts = [80, 8000, 8080, 8888, 8899, 85, 82, 10080, 2000, 8081, 7080, 9090, 9080, 81, 8999];
    const ports =
      portsInput && portsInput.length
        ? Array.from(
            new Set(
              portsInput
                .map((p) => toPort(p, NaN))
                .filter((n) => Number.isFinite(n) && n > 0 && n <= 65535)
            )
          )
        : Number.isFinite(singlePort)
        ? [singlePort]
        : commonPorts;
    const start = toPort(req.body?.start, 1);
    const end = toPort(req.body?.end, 254);
    const timeoutMs = toPort(req.body?.timeoutMs, 600);
    const found = await scanSubnet({ base, start, end, ports, timeoutMs });
    res.json({ devices: found });
  } catch (err) {
    next(err);
  }
});

function parseArpTable(text) {
  const ips = new Set();
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);
    if (m) {
      const ip = m[1];
      if (!ip.startsWith("0.") && !ip.startsWith("127.")) {
        ips.add(ip);
      }
    }
  }
  return Array.from(ips);
}

async function getArpIps() {
  return new Promise((resolve) => {
    const ps = spawn(process.platform === "win32" ? "arp" : "arp", ["-a"]);
    let out = "";
    ps.stdout.on("data", (buf) => (out += buf.toString("utf8")));
    ps.on("close", () => resolve(parseArpTable(out)));
    ps.on("error", () => resolve([]));
  });
}

app.post("/api/onvif/scan-arp", async (req, res, next) => {
  try {
    const ips = Array.isArray(req.body?.ips) && req.body.ips.length ? req.body.ips : await getArpIps();
    const portsInput = Array.isArray(req.body?.ports) ? req.body.ports : undefined;
    const singlePort = toPort(req.body?.port, undefined);
    const commonPorts = [80, 8000, 8080, 8888, 8899, 85, 82, 10080, 2000, 8081, 7080, 9090, 9080, 81, 8999];
    const ports =
      portsInput && portsInput.length
        ? Array.from(
            new Set(
              portsInput
                .map((p) => toPort(p, NaN))
                .filter((n) => Number.isFinite(n) && n > 0 && n <= 65535)
            )
          )
        : Number.isFinite(singlePort)
        ? [singlePort]
        : commonPorts;
    const timeoutMs = toPort(req.body?.timeoutMs, 600);
    const set = [];
    const tasks = ips.map(async (ip) => {
      const parts = ip.split(".");
      const base = `${parts[0]}.${parts[1]}.${parts[2]}.`;
      const idx = Number(parts[3] || 0);
      const found = await scanSubnet({ base, start: idx, end: idx, ports, timeoutMs });
      set.push(...found);
    });
    await Promise.allSettled(tasks);
    res.json({ devices: set });
  } catch (err) {
    next(err);
  }
});

app.post("/api/hikvision/sadp-discover", async (req, res, next) => {
  try {
    const timeoutMs = toPort(req.body?.timeoutMs, 2500);
    const port = toPort(req.body?.port, 37020);
    const devices = await sadpDiscover({ timeoutMs, port });
    res.json({ devices });
  } catch (err) {
    next(err);
  }
});

app.post("/api/onvif/ws-unicast", async (req, res, next) => {
  try {
    const bindAddress = requireOptionalString(req.body?.bindAddress);
    const timeoutMs = toPort(req.body?.timeoutMs, 2000);
    const ips = Array.isArray(req.body?.ips) && req.body.ips.length ? req.body.ips : undefined;
    const devices = await wsDiscoveryUnicast({ ips, bindAddress, timeoutMs });
    res.json({ devices });
  } catch (err) {
    next(err);
  }
});

function requireString(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    const err = new Error(`Invalid ${field}`);
    err.statusCode = 400;
    throw err;
  }
  return value.trim();
}

function requireOptionalString(value) {
  if (value == null) return "";
  if (typeof value !== "string") return "";
  return value.trim();
}

function toPort(value, fallback) {
  if (value == null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 65535) return fallback;
  return Math.floor(n);
}

function safeUnlink(filePath) {
  return fs.unlink(filePath).catch(() => undefined);
}

async function emptyDir(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
  await Promise.all(
    entries.map(async (e) => {
      const p = path.join(dirPath, e.name);
      if (e.isDirectory()) {
        await emptyDir(p);
        await fs.rmdir(p).catch(() => undefined);
        return;
      }
      await safeUnlink(p);
    })
  );
}

const streamProcesses = new Map();

function buildFfmpegArgs({ rtspUri, outDir, transcode, rtspTransport }) {
  const segmentFilePattern = path.join(outDir, "segment_%06d.ts");
  const m3u8Path = path.join(outDir, "index.m3u8");

  const common = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-rtsp_transport",
    rtspTransport && ["tcp", "udp", "http"].includes(String(rtspTransport)) ? String(rtspTransport) : "tcp",
    "-i",
    rtspUri,
    "-fflags",
    "nobuffer",
    "-flags",
    "low_delay",
    "-an"
  ];

  const video = transcode
    ? ["-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-g", "48", "-keyint_min", "48"]
    : ["-c:v", "copy"];

  const hls = [
    "-f",
    "hls",
    "-hls_time",
    "2",
    "-hls_list_size",
    "6",
    "-hls_flags",
    "delete_segments+append_list+independent_segments",
    "-hls_segment_filename",
    segmentFilePattern,
    m3u8Path
  ];

  return [...common, ...video, ...hls];
}

async function startHlsStream(rtspUri, transcodeFlag, transport) {
  const streamId = crypto.randomUUID();
  const outDir = path.join(streamsDir, streamId);
  await fs.mkdir(outDir, { recursive: true });
  await emptyDir(outDir);

  const envTranscode = process.env.HLS_TRANSCODE === "1";
  const transcode = typeof transcodeFlag === "boolean" ? transcodeFlag : envTranscode;
  const rtspTransport = transport && ["tcp", "udp", "http"].includes(String(transport)) ? String(transport) : undefined;
  const ffmpegArgs = buildFfmpegArgs({ rtspUri, outDir, transcode, rtspTransport });

  const child = spawn("ffmpeg", ffmpegArgs, { stdio: ["ignore", "ignore", "pipe"] });

  let stderr = "";
  child.stderr.on("data", (buf) => {
    const s = buf.toString("utf8");
    stderr += s;
    if (stderr.length > 5000) stderr = stderr.slice(-5000);
  });

  const record = {
    id: streamId,
    rtspUri,
    outDir,
    child,
    startedAt: Date.now(),
    lastError: ""
  };

  child.on("exit", () => {
    const current = streamProcesses.get(streamId);
    if (current?.child === child) {
      current.lastError = stderr.trim();
    }
  });

  streamProcesses.set(streamId, record);

  const playUrl = `/streams/${encodeURIComponent(streamId)}/index.m3u8`;
  const m3u8Path = path.join(outDir, "index.m3u8");
  const deadline = Date.now() + 7000;
  while (Date.now() < deadline) {
    try {
      const st = await fs.stat(m3u8Path);
      if (st.isFile() && st.size > 0) {
        return { streamId, playUrl };
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
    if (child.exitCode != null) break;
  }
  try {
    record.lastError = stderr.trim();
    child.kill("SIGKILL");
  } catch {}
  await emptyDir(outDir).catch(() => undefined);
  const err = new Error(record.lastError || "HLS 尚未就绪，可能无法连接 RTSP 或 ffmpeg 不可用");
  err.statusCode = 502;
  throw err;
}

async function stopHlsStream(streamId) {
  const record = streamProcesses.get(streamId);
  if (!record) return { stopped: false };
  streamProcesses.delete(streamId);
  record.child.kill("SIGKILL");
  return { stopped: true };
}

app.get("/api/app/health", (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    pid: process.pid,
    node: process.version,
    platform: process.platform
  });
});


app.post("/api/onvif/discover", async (req, res, next) => {
  try {
    const timeoutMs = toPort(req.body?.timeoutMs, 4000);
    let devices = await onvifDiscoveryProbe({ timeoutMs });
    if (!devices.length) devices = await nodeOnvifProbe();
    res.json({ devices });
  } catch (err) {
    next(err);
  }
});

function buildProbe({ uuid, types, addressingNs, scopes }) {
  const id = uuid || crypto.randomUUID();
  const typesText = Array.isArray(types) ? types.filter(Boolean).join(" ") : String(types || "");
  const scopesText = Array.isArray(scopes) ? scopes.filter(Boolean).join(" ") : String(scopes || "");
  const wNs =
    addressingNs === "2004"
      ? ' xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"'
      : ' xmlns:w="http://www.w3.org/2005/08/addressing"';
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<e:Envelope',
    ' xmlns:e="http://www.w3.org/2003/05/soap-envelope"',
    wNs,
    ' xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"',
    ' xmlns:dn="http://www.onvif.org/ver10/network/wsdl"',
    ' xmlns:tds="http://www.onvif.org/ver10/device/wsdl">',
    "<e:Header>",
    `<w:MessageID>urn:uuid:${id}</w:MessageID>`,
    "<w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>",
    "<w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>",
    "</e:Header>",
    "<e:Body>",
    "<d:Probe>",
    typesText ? `<d:Types>${typesText}</d:Types>` : "",
    scopesText ? `<d:Scopes>${scopesText}</d:Scopes>` : "",
    "</d:Probe>",
    "</e:Body>",
    "</e:Envelope>"
  ].join("");
}

function parseWsDiscoveryResponse(xml) {
  const xaddrsMatch = xml.match(/<[\w:]*XAddrs>([\s\S]*?)<\/[\w:]*XAddrs>/i);
  const scopesMatch = xml.match(/<[\w:]*Scopes>([\s\S]*?)<\/[\w:]*Scopes>/i);
  const typesMatch = xml.match(/<[\w:]*Types>([\s\S]*?)<\/[\w:]*Types>/i);
  const eprMatch2005 = xml.match(/<w:Address>(urn:uuid:[^<]+)<\/w:Address>/i);
  const eprMatch2004 = xml.match(/<a:Address>(urn:uuid:[^<]+)<\/a:Address>/i);
  const xaddrs = xaddrsMatch ? xaddrsMatch[1].trim().split(/\s+/).filter(Boolean) : [];
  const scopes = scopesMatch ? scopesMatch[1].trim() : "";
  const types = typesMatch ? typesMatch[1].trim() : "";
  const epr = eprMatch2005?.[1] || eprMatch2004?.[1] || "";
  return { xaddrs, scopes, types, epr };
}

app.post("/api/onvif/ws-discover", async (req, res, next) => {
  try {
    const bindAddress = requireOptionalString(req.body?.bindAddress);
    const timeoutMs = toPort(req.body?.timeoutMs, 3000);
    const ttl = toPort(req.body?.ttl, 2);
    const repeat = Math.max(1, Math.min(4, toPort(req.body?.repeat, 3)));
    const allIfaces = Boolean(req.body?.allIfaces);
    const fallbackPortsInput = Array.isArray(req.body?.fallbackPorts) ? req.body.fallbackPorts : undefined;
    const fallbackPorts =
      fallbackPortsInput && fallbackPortsInput.length
        ? Array.from(
            new Set(
              fallbackPortsInput
                .map((p) => toPort(p, NaN))
                .filter((n) => Number.isFinite(n) && n > 0 && n <= 65535)
            )
          )
        : [80, 8000, 8080, 8899, 85, 82, 10080, 2000, 8081, 7080, 9090, 9080, 81, 8999];

    const devices = await wsDiscoveryMulticast({ bindAddress, timeoutMs, ttl, repeat, allIfaces, fallbackPorts });
    res.json({ devices });
  } catch (err) {
    next(err);
  }
});

app.post("/api/onvif/stream-uri", async (req, res, next) => {
  try {
    const host = requireString(req.body?.host, "host");
    const port = toPort(req.body?.port, 80);
    const username = requireOptionalString(req.body?.username);
    const password = requireOptionalString(req.body?.password);

    const cam = await new Promise((resolve, reject) => {
      const device = new Cam(
        { hostname: host, port, username, password },
        function onConnect(err) {
          if (err) reject(err);
          else resolve(device);
        }
      );
    });

    const profiles = await new Promise((resolve, reject) => {
      cam.getProfiles((err, profilesList) => {
        if (err) reject(err);
        else resolve(Array.isArray(profilesList) ? profilesList : []);
      });
    });

    const getEnc = (p) => {
      const v = p?.videoEncoderConfiguration;
      const enc = v?.encoding || v?.Encoding || v?.$?.encoding || v?.$?.Encoding || "";
      return String(enc || "").toUpperCase();
    };
    const preferred = profiles.find((p) => getEnc(p) === "H264");
    const profile = preferred || profiles[0];
    const profileToken = profile?.token || profile?.$?.token;
    if (!profileToken) {
      res.status(502).json({ error: "No ONVIF media profile found" });
      return;
    }

    const streamUri = await new Promise((resolve, reject) => {
      cam.getStreamUri({ protocol: "RTSP", profileToken }, (err, result) => {
        if (err) reject(err);
        else resolve(result?.uri || "");
      });
    });

    if (!streamUri) {
      res.status(502).json({ error: "Failed to get RTSP URI via ONVIF" });
      return;
    }

    let rtspUriWithAuth = streamUri;
    try {
      if (username && password) {
        const u = new URL(streamUri);
        if (!u.username && !u.password) {
          u.username = username;
          u.password = password;
          rtspUriWithAuth = u.toString();
        }
      }
    } catch {
      // ignore parse errors; return original
    }

    res.json({ rtspUri: streamUri, rtspUriWithAuth });
  } catch (err) {
    next(err);
  }
});

app.post("/api/stream/start", async (req, res, next) => {
  try {
    const rtspUri = requireString(req.body?.rtspUri, "rtspUri");
    const transcode = Boolean(req.body?.transcode);
    const rtspTransport = requireOptionalString(req.body?.rtspTransport);
    const started = await startHlsStream(rtspUri, transcode, rtspTransport);
    res.json(started);
  } catch (err) {
    next(err);
  }
});

app.post("/api/stream/stop", async (req, res, next) => {
  try {
    const streamId = requireString(req.body?.streamId, "streamId");
    const result = await stopHlsStream(streamId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/api/stream/status/:streamId", async (req, res, next) => {
  try {
    const streamId = requireString(req.params.streamId, "streamId");
    const record = streamProcesses.get(streamId);
    if (!record) {
      res.status(404).json({ ok: false });
      return;
    }
    res.json({
      ok: true,
      startedAt: record.startedAt,
      lastError: record.lastError
    });
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  const statusCode = err?.statusCode && Number.isFinite(err.statusCode) ? err.statusCode : 500;
  res.status(statusCode).json({
    error: statusCode === 500 ? "Internal error" : String(err.message || "Bad request")
  });
});

const host = "0.0.0.0";
const basePort = toPort(process.env.PORT, 3000);

function listenWithRetry(port, remaining) {
  const server = app.listen(port, host, () => {
    currentHttpPort = port;
    process.stdout.write(`http://localhost:${port}/\n`);
    for (const i of listPrivateIPv4()) {
      process.stdout.write(`http://${i.address}:${port}/\n`);
    }
  });
  (async () => {
    try {
      const cfg = await getClientConfig();
      await ensureFtpServer(cfg?.ingest?.ftpServer);
    } catch {}
    try {
      const cfg = await getClientConfig();
      await ensureBackendSerial(cfg?.serial);
    } catch {}
    try {
      await applyDiscoveryServices({ port });
    } catch {}
  })();

  server.on("error", (err) => {
    if (err?.code === "EADDRINUSE" && remaining > 0) {
      server.close(() => listenWithRetry(port + 1, remaining - 1));
      return;
    }
    process.stderr.write(`${err?.message || err}\n`);
    process.exit(1);
  });

  server.on("close", () => {
    try {
      if (discoveryProbe) discoveryProbe.stop?.();
    } catch {}
    try {
      discoveryProbe = null;
      if (discoveryReporter) discoveryReporter.stop?.();
    } catch {}
    try {
      discoveryReporter = null;
      discoveryKey = "";
      stopFtpServer();
    } catch {}
    try {
      stopBackendSerial();
    } catch {}
  });
}

listenWithRetry(basePort, 10);
