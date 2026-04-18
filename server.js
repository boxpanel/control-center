import { execFile, spawn } from "node:child_process";
import crypto from "node:crypto";
import dgram from "node:dgram";
import { watch as fsWatch } from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { Worker } from "node:worker_threads";

import Database from "better-sqlite3";
import * as ftp from "basic-ftp";
import DigestClient from "digest-fetch";
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

app.use((req, res, next) => {
  const url = String(req.path || "");
  if (url.endsWith(".html")) {
    res.type("text/html; charset=utf-8");
  } else if (url.endsWith(".js")) {
    res.type("application/javascript; charset=utf-8");
  } else if (url.endsWith(".css")) {
    res.type("text/css; charset=utf-8");
  } else if (url.endsWith(".json")) {
    res.type("application/json; charset=utf-8");
  }
  next();
});

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
    serialSentAt INTEGER NOT NULL DEFAULT 0,
    parsedMetaJson TEXT NOT NULL DEFAULT ''
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
if (!plateTableColumns.some((col) => String(col?.name || "") === "parsedMetaJson")) {
  plateDb.exec(`ALTER TABLE plate_records ADD COLUMN parsedMetaJson TEXT NOT NULL DEFAULT ''`);
}
plateDb.exec(`CREATE INDEX IF NOT EXISTS idx_plate_records_sourceEventKey ON plate_records(sourceEventKey)`);

const stmtPlateInsert = plateDb.prepare(`
  INSERT INTO plate_records (id, plate, receivedAt, eventAt, imagePath, sourceEventKey, ftpRemotePath, serialSentAt, parsedMetaJson)
  VALUES (@id, @plate, @receivedAt, @eventAt, @imagePath, @sourceEventKey, @ftpRemotePath, @serialSentAt, @parsedMetaJson)
`);
const stmtPlateGet = plateDb.prepare(
  `SELECT id, plate, receivedAt, eventAt, imagePath, ftpRemotePath, serialSentAt, parsedMetaJson FROM plate_records WHERE id = ?`
);
const stmtPlateGetBySourceEventKey = plateDb.prepare(
  `SELECT id, plate, receivedAt, eventAt, imagePath, ftpRemotePath, serialSentAt, parsedMetaJson FROM plate_records WHERE sourceEventKey = ? LIMIT 1`
);
const stmtPlateListLatest = plateDb.prepare(
  `SELECT id, plate, receivedAt, eventAt, imagePath, ftpRemotePath, serialSentAt, parsedMetaJson FROM plate_records ORDER BY receivedAt DESC LIMIT ?`
);
const stmtPlateCount = plateDb.prepare(
  `SELECT COUNT(*) as total FROM plate_records`
);
const stmtPlateSearch = plateDb.prepare(
  `SELECT id, plate, receivedAt, eventAt, imagePath, ftpRemotePath, serialSentAt, parsedMetaJson FROM plate_records WHERE (plate LIKE ? OR ? IS NULL) AND (DATE(receivedAt) = ? OR ? IS NULL) ORDER BY receivedAt DESC LIMIT 10000`
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
  const ftpRemotePath = String(row.ftpRemotePath || "");
  let parsedMeta = null;
  try {
    const raw = String(row.parsedMetaJson || "").trim();
    parsedMeta = raw ? JSON.parse(raw) : null;
  } catch {
    parsedMeta = null;
  }
  return {
    id,
    plate: String(row.plate || ""),
    receivedAt: Number(row.receivedAt || 0) || 0,
    eventAt: Number(row.eventAt || 0) || 0,
    imagePath, // 添加原始图片路径
    imageDataUrl: imagePath ? `/api/plates/image/${encodeURIComponent(id)}` : "",
    ftpRemotePath,
    serialSentAt: Number(row.serialSentAt || 0) || 0,
    parsedMeta
  };
}

function newPlateId(receivedAtMs) {
  const t = Number(receivedAtMs) || Date.now();
  return `${t}-${crypto.randomBytes(6).toString("hex")}`;
}

function planPlateBufferSave({ eventDate, plate, id, ext = ".jpg" }) {
  const { y, m, day } = formatDateFolderParts(eventDate);
  const safePlate = sanitizeNamePart(plate);
  const safeExt = String(ext || ".jpg").trim().toLowerCase();
  const finalExt = /^\.[a-z0-9]+$/i.test(safeExt) ? safeExt : ".jpg";
  const dir = path.join(platesUploadDir, y, m, day);
  const file = `${formatTimestampForFile(eventDate)}_${safePlate}_${String(id || "").slice(-6)}${finalExt}`;
  const abs = path.join(dir, file);
  return {
    absPath: abs,
    imagePath: path.relative(uploadsDir, abs).split(path.sep).join("/")
  };
}

async function writePlateBufferToDiskInWorker({ imageBuffer, absPath }) {
  await new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./plate-image-worker.js", import.meta.url), {
      workerData: {
        absPath: String(absPath || ""),
        imageBuffer
      }
    });
    let settled = false;
    worker.once("message", (message) => {
      settled = true;
      if (message?.ok) resolve();
      else reject(new Error(message?.error || "plate image worker failed"));
    });
    worker.once("error", (err) => {
      if (!settled) reject(err);
    });
    worker.once("exit", (code) => {
      if (!settled && code !== 0) reject(new Error(`plate image worker exited with code ${code}`));
    });
  });
}

async function savePlateImageFileToDisk({ srcPath, eventDate, plate, id, ext }) {
  const { y, m, day } = formatDateFolderParts(eventDate);
  const safePlate = sanitizeNamePart(plate);
  const safeExt = String(ext || ".jpg").trim().toLowerCase();
  const finalExt = /^\.[a-z0-9]+$/i.test(safeExt) ? safeExt : ".jpg";
  const dir = path.join(platesUploadDir, y, m, day);
  await fs.mkdir(dir, { recursive: true });
  const file = `${formatTimestampForFile(eventDate)}_${safePlate}_${String(id || "").slice(-6)}${finalExt}`;
  const abs = path.join(dir, file);
  await fs.copyFile(srcPath, abs);
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
  
  // 允许公开访问图片API，因为图片需要在卡片和详细页面中显示
  if (urlPath.startsWith("/api/plates/image/")) return next();

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
let ftpIngestTimer = null;
let ftpIngestWatcher = null;
let ftpIngestDebounceTimer = null;
let ftpIngestRunning = false;
let ftpIngestQueued = false;
let ftpIngestKey = "";

const FTP_PASV_MIN_PORT = 40000;
const FTP_PASV_MAX_PORT = 40100;
const FTP_INGEST_SETTLE_MS = 800;
const FTP_INGEST_SCAN_INTERVAL_MS = 1500;
const FTP_INGEST_TRIGGER_DELAY_MS = 250;
const FTP_INGEST_ARCHIVE_DIRNAME = "_ingested";

let backendSerialPort = null;
let backendSerialKey = "";
let backendSerialSendChain = Promise.resolve();

let discoveryReporter = null;
let discoveryProbe = null;
let discoveryKey = "";
let currentHttpPort = 0;
const DEFAULT_SERIAL_BAUD_RATE = 115200;
const DEFAULT_FIXED_LINUX_BOARD_SERIAL_PORT = "/dev/ttyAS5";
const ALLOWED_DEVICE_PROTOCOLS = new Set([
  "gb28181",
  "ehome",
  "jt1078-terminal",
  "jt1078-platform",
  "onvif",
  "hikvision-isapi",
  "hikvision-private",
  "dahua-http",
  "dahua-private",
  "grid-platform",
  "custom-rtmp-rtsp"
]);

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
  if (!conf.forwardEnabled) return;
  if (!conf.backendPort) return;
  // On non-Linux platforms, Linux-style device paths are not valid.
  // This prevents unrelated config saves (e.g. adding cameras) from failing on Windows/macOS
  // when a legacy/default `/dev/...` port is present in the persisted config.
  if (process.platform !== "linux" && /^\/dev\//i.test(conf.backendPort)) return;

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

function canForwardPlateToBackendSerial() {
  return Boolean(backendSerialPort?.isOpen);
}

function startPlateSerialForward(plate) {
  const safePlate = String(plate || "").trim();
  if (!safePlate || !canForwardPlateToBackendSerial()) return null;
  return backendSerialEnqueueWrite(`${safePlate}\r\n`).then((ok) => {
    if (!ok) return null;
    return Date.now();
  });
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

function isLoopbackIp(ip) {
  const v = String(ip || "").trim();
  return v === "127.0.0.1" || v === "::1" || v === "::ffff:127.0.0.1";
}

function resolvePreferredLanIp(systemCfg) {
  const cfg = normalizeSystemConfig(systemCfg);
  const ifaces = listPrivateIPv4();
  const manual = String(cfg.manualIp || "").trim();
  const preferred = String(cfg.preferredIp || "").trim();
  if (cfg.ipMode === "manual" && manual) return manual;
  if (preferred && ifaces.some((item) => item.address === preferred)) return preferred;
  return ifaces[0]?.address || "127.0.0.1";
}

function isFtpImageFile(filePath) {
  return /\.(jpe?g|png|bmp|webp)$/i.test(String(filePath || ""));
}

function isFtpMetadataFile(filePath) {
  return /\.(json|xml|txt|dat)$/i.test(String(filePath || ""));
}

extractPlateFromText = function (text) {
  const raw = String(text || "");
  if (/无车牌|未识别|无牌/u.test(raw)) return "无车牌";
  const compact = raw.replace(/\s+/g, "").toUpperCase();
  const cn = compact.match(/([\u4E00-\u9FFF][A-Z][A-Z0-9]{5,6})/u);
  if (cn?.[1]) return cn[1];
  const en = compact.match(/\b([A-Z]{1,3}[A-Z0-9]{4,7})\b/);
  if (en?.[1]) return en[1];
  return "";
};

function decodeFtpMetadataBuffer(buffer, ext = "") {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!buf.length) return "";
  const extName = String(ext || "").toLowerCase();
  const tryDecoders = [];
  if (extName === ".dat") {
    tryDecoders.push(() => new TextDecoder("gb18030", { fatal: false }).decode(buf));
    tryDecoders.push(() => new TextDecoder("gbk", { fatal: false }).decode(buf));
  }
  tryDecoders.push(() => buf.toString("utf8"));
  tryDecoders.push(() => buf.toString("latin1"));
  for (const decode of tryDecoders) {
    try {
      const text = String(decode() || "").replace(/\0+/g, " ").trim();
      if (text) return text;
    } catch {}
  }
  return "";
}

function parseFtpDatMetadataText(text) {
  const raw = String(text || "");
  if (!raw) return null;
  const meta = {
    source: "ftp-dat"
  };
  const eventAt = parseCompactTimestampToMs(raw);
  if (eventAt > 0) meta.eventAt = eventAt;
  const plate = extractPlateFromText(raw);
  if (plate) meta.plate = plate;
  if (/无车牌|未识别|无牌/u.test(raw)) meta.plate = "无车牌";
  return Object.keys(meta).length > 1 ? meta : null;
}

function parseFtpMetadataPayload(text, ext) {
  const raw = String(text || "");
  const extName = String(ext || "").toLowerCase();
  if (!raw) return null;
  if (extName === ".dat") return parseFtpDatMetadataText(decodeFtpMetadataBuffer(Buffer.from(raw, "base64"), extName));

  const meta = {
    source: extName ? `ftp-${extName.slice(1)}` : "ftp-text"
  };
  const eventAt = parseCompactTimestampToMs(raw);
  if (eventAt > 0) meta.eventAt = eventAt;
  const plate = extractPlateFromText(raw);
  if (plate) meta.plate = plate;
  return Object.keys(meta).length > 1 ? meta : null;
}

function extractPlateFromFilename(filePath) {
  const base = path.basename(String(filePath || ""), path.extname(String(filePath || "")));
  return extractPlateFromText(base.replace(/[_-]+/g, " "));
}

function parseCompactTimestampToMs(text) {
  const digits = String(text || "").replace(/\D+/g, "");
  if (digits.length < 14) return 0;
  const yyyy = Number(digits.slice(0, 4));
  const mm = Number(digits.slice(4, 6));
  const dd = Number(digits.slice(6, 8));
  const hh = Number(digits.slice(8, 10));
  const mi = Number(digits.slice(10, 12));
  const ss = Number(digits.slice(12, 14));
  const ms = digits.length >= 17 ? Number(digits.slice(14, 17)) : 0;
  if (!yyyy || mm < 1 || mm > 12 || dd < 1 || dd > 31 || hh > 23 || mi > 59 || ss > 59) return 0;
  const dt = new Date(yyyy, mm - 1, dd, hh, mi, ss, ms);
  const ts = dt.getTime();
  return Number.isFinite(ts) && ts > 0 ? ts : 0;
}

function extractPlateFromText(text) {
  const raw = String(text || "");
  if (/(?:\u65e0\u8f66\u724c|\u672a\u8bc6\u522b|\u65e0\u724c)/u.test(raw)) return "\u65e0\u8f66\u724c";
  const compact = raw.replace(/\s+/g, "").toUpperCase();
  const cn = compact.match(/([\u4E00-\u9FFF][A-Z][A-Z0-9]{5,6})/u);
  if (cn?.[1]) return cn[1];
  const en = compact.match(/\b([A-Z]{1,3}[A-Z0-9]{4,7})\b/);
  if (en?.[1]) return en[1];
  return "";
}

const HIKVISION_FTP_TIMEZONE_OFFSET_MINUTES = 8 * 60;

function extractCompactTimestampDigits(text) {
  const raw = String(text || "");
  const direct = raw.match(/(\d{14,17})/);
  if (direct?.[1]) return direct[1];
  const digits = raw.replace(/\D+/g, "");
  return digits.length >= 14 ? digits : "";
}

function formatCompactTimestampDigits(digits) {
  const compact = String(digits || "").trim();
  if (compact.length < 14) return "";
  const yyyy = compact.slice(0, 4);
  const mm = String(Number(compact.slice(4, 6)));
  const dd = String(Number(compact.slice(6, 8)));
  const hh = compact.slice(8, 10);
  const mi = compact.slice(10, 12);
  const ss = compact.slice(12, 14);
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}:${ss}`;
}

parseCompactTimestampToMs = function (text, options = {}) {
  const digits = extractCompactTimestampDigits(text);
  if (digits.length < 14) return 0;
  const yyyy = Number(digits.slice(0, 4));
  const mm = Number(digits.slice(4, 6));
  const dd = Number(digits.slice(6, 8));
  const hh = Number(digits.slice(8, 10));
  const mi = Number(digits.slice(10, 12));
  const ss = Number(digits.slice(12, 14));
  const ms = digits.length >= 17 ? Number(digits.slice(14, 17)) : 0;
  if (!yyyy || mm < 1 || mm > 12 || dd < 1 || dd > 31 || hh > 23 || mi > 59 || ss > 59) return 0;
  const offsetMinutes = Number.isFinite(options?.timezoneOffsetMinutes)
    ? Number(options.timezoneOffsetMinutes)
    : HIKVISION_FTP_TIMEZONE_OFFSET_MINUTES;
  const utcMs = Date.UTC(yyyy, mm - 1, dd, hh, mi, ss, ms);
  const ts = utcMs - offsetMinutes * 60 * 1000;
  return Number.isFinite(ts) && ts > 0 ? ts : 0;
};

function looksLikeUnreadableFtpToken(token) {
  const text = String(token || "").trim();
  if (!text) return false;
  if (/[\uFFFD]/u.test(text)) return true;
  if (/锟|斤拷|睫筹拷|酵筹拷/u.test(text)) return true;
  if (/^[\d._-]+$/.test(text)) return false;
  if (/[\u4E00-\u9FFF]/u.test(text)) return false;
  const weirdChars = (text.match(/[^\w._-]/g) || []).length;
  return weirdChars >= Math.max(2, Math.ceil(text.length / 2));
}

parseFtpDatMetadataText = function (text) {
  const raw = String(text || "");
  if (!raw) return null;
  const meta = {
    source: "ftp-dat"
  };
  const eventDigits = extractCompactTimestampDigits(raw);
  const eventAt = parseCompactTimestampToMs(eventDigits);
  if (eventAt > 0) {
    meta.eventAt = eventAt;
    meta.eventAtText = formatCompactTimestampDigits(eventDigits);
  }
  const plate = extractPlateFromText(raw);
  if (plate) meta.plate = plate;
  if (/(?:\u65e0\u8f66\u724c|\u672a\u8bc6\u522b|\u65e0\u724c)/u.test(raw)) meta.plate = "\u65e0\u8f66\u724c";
  return Object.keys(meta).length > 1 ? meta : null;
};

parseFtpMetadataPayload = function (text, ext) {
  const raw = String(text || "");
  const extName = String(ext || "").toLowerCase();
  if (!raw) return null;
  if (extName === ".dat") return parseFtpDatMetadataText(decodeFtpMetadataBuffer(Buffer.from(raw, "base64"), extName));

  const meta = {
    source: extName ? `ftp-${extName.slice(1)}` : "ftp-text"
  };
  const eventDigits = extractCompactTimestampDigits(raw);
  const eventAt = parseCompactTimestampToMs(eventDigits);
  if (eventAt > 0) {
    meta.eventAt = eventAt;
    meta.eventAtText = formatCompactTimestampDigits(eventDigits);
  }
  const plate = extractPlateFromText(raw);
  if (plate) meta.plate = plate;
  return Object.keys(meta).length > 1 ? meta : null;
};

function normalizeFtpMetaToken(token) {
  return String(token || "").trim().replace(/\s+/g, "");
}

function splitFtpFilenameTokens(filePath) {
  const base = path.basename(String(filePath || ""), path.extname(String(filePath || ""))).trim();
  if (!base) return [];
  if (base.includes("_")) return base.split(/_+/).map(normalizeFtpMetaToken).filter(Boolean);
  if (base.includes("-")) return base.split(/-+/).map(normalizeFtpMetaToken).filter(Boolean);
  return base.split(/\s+/).map(normalizeFtpMetaToken).filter(Boolean);
}

parseFtpFilenameStructuredMeta = function (filePath) {
  const baseName = path.basename(String(filePath || ""), path.extname(String(filePath || ""))).trim();
  const tokens = splitFtpFilenameTokens(filePath);
  const meta = {
    source: "ftp-filename",
    baseName,
    tokens
  };
  if (!baseName) return meta;

  const plate = extractPlateFromFilename(filePath);
  if (plate) meta.plate = plate;

  const plateColorMatchers = [
    [/^(?:\u84dd|\u84dd\u724c)$/u, "\u84dd"],
    [/^(?:\u9ec4|\u9ec4\u724c)$/u, "\u9ec4"],
    [/^(?:\u767d|\u767d\u724c)$/u, "\u767d"],
    [/^(?:\u9ed1|\u9ed1\u724c)$/u, "\u9ed1"],
    [/^(?:\u7eff|\u7eff\u724c)$/u, "\u7eff"],
    [/^(?:\u9ec4\u7eff|\u9ec4\u7eff\u724c)$/u, "\u9ec4\u7eff"],
    [/^(?:\u6e10\u53d8\u7eff|\u6e10\u53d8\u7eff\u724c)$/u, "\u6e10\u53d8\u7eff"]
  ];
  const vehicleColorMatchers = [
    [/^\u9ed1\u8272?$/u, "\u9ed1"],
    [/^\u767d\u8272?$/u, "\u767d"],
    [/^\u94f6\u8272?$/u, "\u94f6"],
    [/^\u7070\u8272?$/u, "\u7070"],
    [/^\u7ea2\u8272?$/u, "\u7ea2"],
    [/^\u84dd\u8272?$/u, "\u84dd"],
    [/^\u9ec4\u8272?$/u, "\u9ec4"],
    [/^\u68d5\u8272?$/u, "\u68d5"],
    [/^\u7eff\u8272?$/u, "\u7eff"],
    [/^\u91d1\u8272?$/u, "\u91d1"]
  ];
  const vehicleTypeMatchers = [
    /\bSUV\b/i,
    /\bMPV\b/i,
    /\u5c0f\u578b\u8f66/u,
    /\u5927\u578b\u8f66/u,
    /\u4e2d\u578b\u8f66/u,
    /\u8f7f\u8d27\u6c7d\u8f66/u,
    /\u8d27\u8f66/u,
    /\u5ba2\u8f66/u,
    /\u8f7f\u5ba2\u6c7d\u8f66/u,
    /\u8f7f\u8d27\u6c7d\u8f66/u,
    /\u8f7f\u5ba2/u,
    /\u8f7f\u8d27/u,
    /\u8f7f\u4eba/u,
    /\u9762\u5305\u8f66/u,
    /\u8f7f\u8f66/u,
    /\u8f7f\u7535\u52a8\u8f66/u,
    /\u6469\u6258/u
  ];
  const violationMatchers = [
    /\u8fdd\u505c/u,
    /\u95ef\u7ea2\u706f/u,
    /\u538b\u7ebf/u,
    /\u9006\u884c/u,
    /\u8d85\u901f/u,
    /\u8fdd\u6cd5/u,
    /\u5360\u9053/u
  ];

  for (const token of tokens) {
    if (!token) continue;
    if (!meta.deviceIp) {
      const ipMatch = token.match(/\b((?:\d{1,3}\.){3}\d{1,3})\b/);
      if (ipMatch?.[1]) meta.deviceIp = ipMatch[1];
    }
    if (!meta.eventAt) {
      const ts = parseCompactTimestampToMs(token);
      if (ts > 0) meta.eventAt = ts;
    }
    if (!meta.plate && extractPlateFromText(token)) {
      meta.plate = extractPlateFromText(token);
    }
    if (!meta.plateColor) {
      const hit = plateColorMatchers.find(([re]) => re.test(token));
      if (hit) meta.plateColor = hit[1];
    }
    if (!meta.vehicleColor) {
      const hit = vehicleColorMatchers.find(([re]) => re.test(token));
      if (hit) meta.vehicleColor = hit[1];
    }
    if (!meta.vehicleType) {
      const hit = vehicleTypeMatchers.find((re) => re.test(token));
      if (hit) meta.vehicleType = token;
    }
    if (!meta.violationType) {
      const hit = violationMatchers.find((re) => re.test(token));
      if (hit) meta.violationType = token;
    }
    if (!meta.plateCoords) {
      const coordMatch = token.match(/^(\d{1,4},){3}\d{1,4}$/);
      if (coordMatch) meta.plateCoords = token;
    }
    if (!meta.laneNo) {
      const m = token.match(/^(?:lane|ln|cd|chedao|[\u8f66\u9053]{1,2})[-_ ]?(\d{1,2})$/i);
      if (m?.[1]) meta.laneNo = Number(m[1]);
    }
    if (!meta.channelNo) {
      const m = token.match(/^(?:ch|channel|td|[\u901a\u9053]{1,2})[-_ ]?(\d{1,2})$/i);
      if (m?.[1]) meta.channelNo = Number(m[1]);
    }
    if (!meta.directionNo) {
      const m = token.match(/^(?:dir|fx|[\u65b9\u5411]{1,2})[-_ ]?(\d{1,2})$/i);
      if (m?.[1]) meta.directionNo = Number(m[1]);
    }
    if (!meta.intersectionNo) {
      const m = token.match(/^(?:cross|road|lk|[\u8def\u53e3]{1,2})[-_ ]?(\d{1,3})$/i);
      if (m?.[1]) meta.intersectionNo = Number(m[1]);
    }
    if (!meta.imageSeq) {
      const m = token.match(/^(?:img|image|pic|tp|[\u56fe\u7247]{1,2})[-_ ]?(\d{1,4})$/i);
      if (m?.[1]) meta.imageSeq = Number(m[1]);
    }
    if (!meta.vehicleSeq) {
      const m = token.match(/^(?:veh|car|vehicle|cl|[\u8f66\u8f86\u5e8f\u53f7]{1,4})[-_ ]?(\d{1,6})$/i);
      if (m?.[1]) meta.vehicleSeq = Number(m[1]);
    }
    if (!meta.speed) {
      const m = token.match(/^(?:spd|speed|v|[\u901f\u5ea6]{1,2})[-_ ]?(\d{1,3})(?:kmh|km\/h|kph)?$/i);
      if (m?.[1]) meta.speed = Number(m[1]);
    }
    if (!meta.deviceNo) {
      const m = token.match(/^(?:dev|device|sn|[\u8bbe\u5907\u53f7]{1,3})[-_ ]?([A-Z0-9]{2,})$/i);
      if (m?.[1]) meta.deviceNo = m[1];
    }
  }

  const leftovers = tokens.filter((token) => {
    if (!token) return false;
    if (token === meta.plate) return false;
    if (token === meta.deviceIp) return false;
    if (token === meta.plateColor) return false;
    if (token === meta.vehicleColor) return false;
    if (token === meta.vehicleType) return false;
    if (token === meta.violationType) return false;
    if (token === meta.plateCoords) return false;
    if (meta.eventAt && parseCompactTimestampToMs(token) === meta.eventAt) return false;
    return true;
  });
  if (leftovers.length) meta.unmatchedTokens = leftovers;

  return meta;
};

function parseFtpFilenameStructuredMeta(filePath) {
  const baseName = path.basename(String(filePath || ""), path.extname(String(filePath || ""))).trim();
  const tokens = splitFtpFilenameTokens(filePath);
  const meta = {
    source: "ftp-filename",
    baseName,
    tokens
  };
  if (!baseName) return meta;

  const plate = extractPlateFromFilename(filePath);
  if (plate) meta.plate = plate;

  const plateColorMatchers = [
    [/^(?:\u84dd|\u84dd\u724c)$/u, "\u84dd"],
    [/^(?:\u9ec4|\u9ec4\u724c)$/u, "\u9ec4"],
    [/^(?:\u767d|\u767d\u724c)$/u, "\u767d"],
    [/^(?:\u9ed1|\u9ed1\u724c)$/u, "\u9ed1"],
    [/^(?:\u7eff|\u7eff\u724c)$/u, "\u7eff"],
    [/^(?:\u9ec4\u7eff|\u9ec4\u7eff\u724c)$/u, "\u9ec4\u7eff"],
    [/^(?:\u6e10\u53d8\u7eff|\u6e10\u53d8\u7eff\u724c)$/u, "\u6e10\u53d8\u7eff"]
  ];
  const vehicleColorMatchers = [
    [/^\u9ed1\u8272?$/u, "\u9ed1"],
    [/^\u767d\u8272?$/u, "\u767d"],
    [/^\u94f6\u8272?$/u, "\u94f6"],
    [/^\u7070\u8272?$/u, "\u7070"],
    [/^\u7ea2\u8272?$/u, "\u7ea2"],
    [/^\u84dd\u8272?$/u, "\u84dd"],
    [/^\u9ec4\u8272?$/u, "\u9ec4"],
    [/^\u68d5\u8272?$/u, "\u68d5"],
    [/^\u7eff\u8272?$/u, "\u7eff"],
    [/^\u91d1\u8272?$/u, "\u91d1"],
    [/^\u5176\u5b83?\u8272$/u, "\u5176\u5b83\u8272"]
  ];
  const vehicleTypeMatchers = [
    /\bSUV\b/i,
    /\bMPV\b/i,
    /\u5c0f\u578b\u8f66/u,
    /\u5927\u578b\u8f66/u,
    /\u4e2d\u578b\u8f66/u,
    /\u8f7d\u8d27\u6c7d\u8f66/u,
    /\u8d27\u8f66/u,
    /\u5ba2\u8f66/u,
    /\u9762\u5305\u8f66/u,
    /\u6469\u6258/u
  ];
  const violationMatchers = [
    /\u6b63\u5e38/u,
    /\u65e0/u,
    /\u8fdd\u505c/u,
    /\u95ef\u7ea2\u706f/u,
    /\u538b\u7ebf/u,
    /\u9006\u884c/u,
    /\u8d85\u901f/u,
    /\u8fdd\u6cd5/u,
    /\u5360\u9053/u
  ];

  for (const token of tokens) {
    if (!token) continue;
    if (!meta.deviceIp) {
      const ipMatch = token.match(/\b((?:\d{1,3}\.){3}\d{1,3})\b/);
      if (ipMatch?.[1]) meta.deviceIp = ipMatch[1];
    }
    if (!meta.eventAt) {
      const eventDigits = extractCompactTimestampDigits(token);
      const ts = parseCompactTimestampToMs(eventDigits);
      if (ts > 0) {
        meta.eventAt = ts;
        meta.eventAtText = formatCompactTimestampDigits(eventDigits);
      }
    }
    if (!meta.plate && extractPlateFromText(token)) {
      meta.plate = extractPlateFromText(token);
    }
    if (!meta.plateColor) {
      const hit = plateColorMatchers.find(([re]) => re.test(token));
      if (hit) meta.plateColor = hit[1];
    }
    if (!meta.vehicleColor) {
      const hit = vehicleColorMatchers.find(([re]) => re.test(token));
      if (hit) meta.vehicleColor = hit[1];
    }
    if (!meta.vehicleType) {
      const hit = vehicleTypeMatchers.find((re) => re.test(token));
      if (hit) meta.vehicleType = token;
    }
    if (!meta.violationType) {
      const hit = violationMatchers.find((re) => re.test(token));
      if (hit) meta.violationType = token;
    }
    if (!meta.plateCoords) {
      const coordMatch = token.match(/^(\d{1,4},){3}\d{1,4}$/);
      if (coordMatch) meta.plateCoords = token;
    }
    if (!meta.laneNo) {
      const m = token.match(/^(?:lane|ln|cd|chedao|[\u8f66\u9053]{1,2})[-_ ]?(\d{1,2})$/i);
      if (m?.[1]) meta.laneNo = Number(m[1]);
    }
    if (!meta.channelNo) {
      const m = token.match(/^(?:ch|channel|td|[\u901a\u9053]{1,2})[-_ ]?(\d{1,2})$/i);
      if (m?.[1]) meta.channelNo = Number(m[1]);
    }
    if (!meta.directionNo) {
      const m = token.match(/^(?:dir|fx|[\u65b9\u5411]{1,2})[-_ ]?(\d{1,2})$/i);
      if (m?.[1]) meta.directionNo = Number(m[1]);
    }
    if (!meta.intersectionNo) {
      const m = token.match(/^(?:cross|road|lk|[\u8def\u53e3]{1,2})[-_ ]?(\d{1,3})$/i);
      if (m?.[1]) meta.intersectionNo = Number(m[1]);
    }
    if (!meta.imageSeq) {
      const m = token.match(/^(?:img|image|pic|tp|[\u56fe\u7247]{1,2})[-_ ]?(\d{1,4})$/i);
      if (m?.[1]) meta.imageSeq = Number(m[1]);
    }
    if (!meta.vehicleSeq) {
      const m = token.match(/^(?:veh|car|vehicle|cl|[\u8f66\u8f86\u5e8f\u53f7]{1,4})[-_ ]?(\d{1,6})$/i);
      if (m?.[1]) meta.vehicleSeq = Number(m[1]);
    }
    if (!meta.speed) {
      const m = token.match(/^(?:spd|speed|v|[\u901f\u5ea6]{1,2})[-_ ]?(\d{1,3})(?:kmh|km\/h|kph)?$/i);
      if (m?.[1]) meta.speed = Number(m[1]);
    }
    if (!meta.deviceNo) {
      const m = token.match(/^(?:dev|device|sn|[\u8bbe\u5907\u53f7]{1,3})[-_ ]?([A-Z0-9]{2,})$/i);
      if (m?.[1]) meta.deviceNo = m[1];
    }
  }

  if (!meta.deviceNo && /^\d{2,}$/.test(tokens[1] || "")) meta.deviceNo = tokens[1];
  if (!meta.imageSeq && /^\d{1,4}$/.test(tokens[tokens.length - 1] || "")) meta.imageSeq = Number(tokens[tokens.length - 1]);
  if (!meta.vehicleSeq && /^\d{2,6}$/.test(tokens[tokens.length - 2] || "")) meta.vehicleSeq = Number(tokens[tokens.length - 2]);
  if (!meta.speed) {
    const speedCandidate = tokens.find((token, index) => index > 2 && /^\d{2,3}$/.test(token));
    if (speedCandidate) meta.speed = Number(speedCandidate);
  }

  const leftovers = tokens.filter((token) => {
    if (!token) return false;
    if (looksLikeUnreadableFtpToken(token)) return false;
    if (token === meta.plate) return false;
    if (token === meta.deviceIp) return false;
    if (token === meta.deviceNo) return false;
    if (token === meta.plateColor) return false;
    if (token === meta.vehicleColor) return false;
    if (token === meta.vehicleType) return false;
    if (token === meta.violationType) return false;
    if (token === meta.plateCoords) return false;
    if (meta.speed != null && token === String(meta.speed).padStart(token.length, "0")) return false;
    if (meta.vehicleSeq != null && token === String(meta.vehicleSeq).padStart(token.length, "0")) return false;
    if (meta.imageSeq != null && token === String(meta.imageSeq).padStart(token.length, "0")) return false;
    if (meta.eventAt && parseCompactTimestampToMs(token) === meta.eventAt) return false;
    return true;
  });
  if (leftovers.length) meta.unmatchedTokens = leftovers;

  return meta;
}

function safeStringifyParsedMeta(meta) {
  if (!meta || typeof meta !== "object") return "";
  try {
    return JSON.stringify(meta);
  } catch {
    return "";
  }
}

async function listFilesRecursive(rootDir) {
  const out = [];
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
      } else if (entry.isFile()) {
        out.push(abs);
      }
    }
  }
  return out;
}

function getFtpArchiveRoot(rootDir) {
  return path.join(rootDir, FTP_INGEST_ARCHIVE_DIRNAME);
}

function isWithinFtpArchive(absPath, rootDir) {
  const archiveRoot = getFtpArchiveRoot(rootDir);
  const rel = path.relative(archiveRoot, absPath);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

async function archiveFtpSourceFile(absPath, rootDir) {
  if (isWithinFtpArchive(absPath, rootDir)) return;
  const rel = path.relative(rootDir, absPath);
  const archivePath = path.join(getFtpArchiveRoot(rootDir), rel);
  await fs.mkdir(path.dirname(archivePath), { recursive: true });
  await fs.rename(absPath, archivePath).catch(async () => {
    await fs.copyFile(absPath, archivePath);
    await fs.unlink(absPath).catch(() => {});
  });
}

async function stopFtpServer() {
  stopFtpIngestLoop();
  if (!ftpServer) return;
  const srv = ftpServer;
  ftpServer = null;
  ftpServerKey = "";
  try {
    await srv.close();
  } catch {}
}

function stopFtpIngestLoop() {
  if (ftpIngestTimer) clearInterval(ftpIngestTimer);
  if (ftpIngestDebounceTimer) clearTimeout(ftpIngestDebounceTimer);
  if (ftpIngestWatcher) {
    try {
      ftpIngestWatcher.close();
    } catch {}
  }
  ftpIngestTimer = null;
  ftpIngestWatcher = null;
  ftpIngestDebounceTimer = null;
  ftpIngestRunning = false;
  ftpIngestQueued = false;
  ftpIngestKey = "";
}

async function collectFtpIngestCandidatesInWorker(rootDir) {
  return await new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./ftp-ingest-worker.js", import.meta.url), {
      workerData: {
        rootDir,
        archiveDirName: FTP_INGEST_ARCHIVE_DIRNAME
      }
    });
    let settled = false;
    worker.once("message", (message) => {
      settled = true;
      if (message?.ok) {
        resolve(Array.isArray(message.candidates) ? message.candidates : []);
      } else {
        reject(new Error(message?.error || "FTP ingest worker failed"));
      }
    });
    worker.once("error", (err) => {
      settled = true;
      reject(err);
    });
    worker.once("exit", (code) => {
      if (!settled && code !== 0) {
        reject(new Error(`FTP ingest worker exited with code ${code}`));
      }
    });
  });
}

async function ingestFtpImageFile(candidate, rootDir) {
  const absPath = String(candidate?.absPath || "");
  if (!absPath) return false;
  const relPath = String(candidate?.relPath || path.relative(rootDir, absPath).split(path.sep).join("/"));
  const displayRelPath = String(candidate?.displayRelPath || relPath);
  const sourceEventKey = `ftp:${relPath}`;
  if (stmtPlateGetBySourceEventKey.get(sourceEventKey)) return false;

  const stat = await fs.stat(absPath).catch(() => null);
  if (!stat || !stat.isFile() || stat.size <= 0) return false;
  if (Date.now() - stat.mtimeMs < FTP_INGEST_SETTLE_MS) return false;

  const filenameMeta = parseFtpFilenameStructuredMeta(displayRelPath);
  let plate = "";
  const metadataTexts = Array.isArray(candidate?.metadataTexts) ? candidate.metadataTexts : [];
  const metadataFiles = Array.isArray(candidate?.metadataPaths) ? candidate.metadataPaths : [];
  const metadataDisplayFiles = Array.isArray(candidate?.metadataDisplayPaths) ? candidate.metadataDisplayPaths : [];
  const metadataExts = Array.isArray(candidate?.metadataExts) ? candidate.metadataExts : [];
  const parsedMetadata = [];
  for (let i = 0; i < metadataTexts.length; i += 1) {
    const parsed = parseFtpMetadataPayload(metadataTexts[i], metadataExts[i]);
    if (parsed) {
      parsed.file = metadataDisplayFiles[i] ? path.basename(metadataDisplayFiles[i]) : metadataFiles[i] ? path.basename(metadataFiles[i]) : "";
      parsedMetadata.push(parsed);
      if (!plate && parsed.plate) plate = String(parsed.plate || "");
    } else if (!plate) {
      plate = extractPlateFromText(metadataTexts[i]);
    }
  }
  if (!plate) plate = String(filenameMeta.plate || "");
  if (!plate) plate = extractPlateFromFilename(absPath);
  if (!plate) plate = path.basename(absPath, path.extname(absPath));

  const receivedAt = Date.now();
  const metadataEventAt = parsedMetadata.find((item) => Number(item?.eventAt || 0) > 0)?.eventAt || 0;
  const metadataEventAtText = String(parsedMetadata.find((item) => String(item?.eventAtText || "").trim())?.eventAtText || "");
  const eventAt = Number(metadataEventAt || filenameMeta.eventAt || 0) || (stat.mtimeMs > 0 ? stat.mtimeMs : receivedAt);
  const id = newPlateId(receivedAt);
  const mergedMetadata = Object.assign({}, ...parsedMetadata.map((item) => (item && typeof item === "object" ? item : {})));
  const parsedMeta = {
    ...filenameMeta,
    ...mergedMetadata,
    eventAt,
    eventAtText: metadataEventAtText || String(filenameMeta.eventAtText || ""),
    plate,
    ftpRemotePath: displayRelPath,
    metadataFiles: metadataDisplayFiles.length ? metadataDisplayFiles : metadataFiles,
    metadataCount: metadataFiles.length,
    metadata: parsedMetadata
  };
  const serialForwardTask = startPlateSerialForward(plate);
  const imagePath = await savePlateImageFileToDisk({
    srcPath: absPath,
    eventDate: new Date(eventAt),
    plate,
    id,
    ext: path.extname(absPath) || ".jpg"
  });
  stmtPlateInsert.run({
    id,
    plate,
    receivedAt,
    eventAt,
    imagePath,
    sourceEventKey,
    ftpRemotePath: relPath,
    serialSentAt: 0,
    parsedMetaJson: safeStringifyParsedMeta(parsedMeta)
  });
  broadcastEvent({
    type: "lpr",
    id,
    plate,
    timestamp: new Date(eventAt).toISOString(),
    receivedAt,
    eventAt,
    image: "",
    imageUrl: `/api/plates/image/${encodeURIComponent(id)}`,
    ftpRemotePath: displayRelPath,
    parsedMeta
  });
  if (serialForwardTask) {
    void serialForwardTask.then((sentAt) => {
      if (!sentAt) return;
      try {
        stmtPlateUpdateSerialSent.run(sentAt, id);
        broadcastSerialSent(id, sentAt);
      } catch {}
    });
  }
  for (const metaPath of metadataFiles) {
    await archiveFtpSourceFile(metaPath, rootDir).catch(() => {});
  }
  await archiveFtpSourceFile(absPath, rootDir).catch(() => {});
  return true;
}

async function runFtpIngestScan(conf) {
  if (ftpIngestRunning) {
    ftpIngestQueued = true;
    return;
  }
  ftpIngestRunning = true;
  try {
    const resolvedRoot = resolveFtpRootDir(conf?.rootDir);
    const candidates = await collectFtpIngestCandidatesInWorker(resolvedRoot);
    for (const candidate of candidates) {
      try {
        await ingestFtpImageFile(candidate, resolvedRoot);
      } catch (err) {
        console.error("[FTP] ingest scan failed:", err?.message || String(err));
      }
    }
  } finally {
    ftpIngestRunning = false;
    if (ftpIngestQueued) {
      ftpIngestQueued = false;
      queueMicrotask(() => {
        runFtpIngestScan(conf).catch((err) => {
          console.error("[FTP] ingest loop error:", err?.message || String(err));
        });
      });
    }
  }
}

function scheduleFtpIngestRun(conf, delayMs = FTP_INGEST_TRIGGER_DELAY_MS) {
  if (!conf?.enabled) return;
  if (ftpIngestDebounceTimer) clearTimeout(ftpIngestDebounceTimer);
  ftpIngestDebounceTimer = setTimeout(() => {
    ftpIngestDebounceTimer = null;
    runFtpIngestScan(conf).catch((err) => {
      console.error("[FTP] ingest loop error:", err?.message || String(err));
    });
  }, Math.max(0, delayMs));
}

function attachFtpIngestWatcher(conf) {
  if (ftpIngestWatcher) return;
  const resolvedRoot = resolveFtpRootDir(conf?.rootDir);
  try {
    ftpIngestWatcher = fsWatch(resolvedRoot, { persistent: false }, (_eventType, filename) => {
      const relName = String(filename || "");
      if (!relName || relName.startsWith(FTP_INGEST_ARCHIVE_DIRNAME)) return;
      scheduleFtpIngestRun(conf);
    });
    ftpIngestWatcher.on("error", (err) => {
      console.warn("[FTP] watcher disabled:", err?.message || String(err));
      if (ftpIngestWatcher) {
        try {
          ftpIngestWatcher.close();
        } catch {}
      }
      ftpIngestWatcher = null;
    });
  } catch (err) {
    console.warn("[FTP] watcher unavailable:", err?.message || String(err));
    ftpIngestWatcher = null;
  }
}

function scheduleFtpIngestLoop(conf) {
  const nextKey = ftpConfigKey(conf);
  if (!conf?.enabled) {
    stopFtpIngestLoop();
    return;
  }
  if (ftpIngestTimer && ftpIngestKey === nextKey) return;
  stopFtpIngestLoop();
  ftpIngestKey = nextKey;
  const run = () => {
    runFtpIngestScan(conf).catch((err) => {
      console.error("[FTP] ingest loop error:", err?.message || String(err));
    });
  };
  scheduleFtpIngestRun(conf, 0);
  ftpIngestTimer = setInterval(run, FTP_INGEST_SCAN_INTERVAL_MS);
  attachFtpIngestWatcher(conf);
}

async function ensureFtpServer(cfg) {
  const conf = normalizeFtpServerConfig(cfg);
  const nextKey = ftpConfigKey(conf);
  if (ftpServer && ftpServerKey === nextKey) return;

  await stopFtpServer();
  ftpServerKey = nextKey;
  if (!conf.enabled) {
    stopFtpIngestLoop();
    return;
  }
  if (conf.port < 1024 && typeof process.getuid === "function" && process.getuid() !== 0) {
    throw new Error("FTP 端口小于 1024 需要 root 权限，建议改用 2121，或给 node 授予 cap_net_bind_service");
  }

  const url = `ftp://0.0.0.0:${conf.port}`;
  const resolvedRoot = resolveFtpRootDir(conf.rootDir);
  const info = await loadOrInitDeviceInfo();
  const preferredLanIp = resolvePreferredLanIp(info?.system);
  await ensureDir(resolvedRoot);
  const srv = new FtpSrv({
    url,
    anonymous: !conf.username,
    pasv_url: (remoteAddress) => (isLoopbackIp(remoteAddress) ? "127.0.0.1" : preferredLanIp),
    pasv_min: FTP_PASV_MIN_PORT,
    pasv_max: FTP_PASV_MAX_PORT,
    greeting: ["Control Center FTP ready"]
  });
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
  console.log(`[FTP] listening on ${url}, root=${resolvedRoot}, pasv=${preferredLanIp}:${FTP_PASV_MIN_PORT}-${FTP_PASV_MAX_PORT}`);
  ftpServer = srv;
  scheduleFtpIngestLoop(conf);
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
      if (!Array.isArray(parsed.devices)) {
        patch.devices = [];
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
      const systemDefaults = {
        name: "",
        clientMode: false,
        ipMode: "auto",
        preferredIp: "",
        manualIp: "",
        manualPrefix: "",
        manualGateway: ""
      };
      if (!parsed.system || typeof parsed.system !== "object") {
        patch.system = systemDefaults;
      } else {
        const s = parsed.system;
        const needs =
          !Object.prototype.hasOwnProperty.call(s, "name") ||
          !Object.prototype.hasOwnProperty.call(s, "clientMode") ||
          !Object.prototype.hasOwnProperty.call(s, "ipMode") ||
          !Object.prototype.hasOwnProperty.call(s, "preferredIp") ||
          !Object.prototype.hasOwnProperty.call(s, "manualIp") ||
          !Object.prototype.hasOwnProperty.call(s, "manualPrefix") ||
          !Object.prototype.hasOwnProperty.call(s, "manualGateway");
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
    devices: [],
    probe: { enabled: true, group: "239.255.255.250", port: 10086 },
    serial: { baudRate: DEFAULT_SERIAL_BAUD_RATE, forwardEnabled: false, backendPort: getPreferredLinuxBoardSerialPort(await listLinuxBoardSerialPorts()) },
    system: { name: "", clientMode: false, ipMode: "auto", preferredIp: "", manualIp: "", manualPrefix: "", manualGateway: "" },
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

function extractJsonScalarValue(text, keys) {
  const source = String(text || "");
  const list = Array.isArray(keys) ? keys : [keys];
  for (const key of list) {
    const safe = String(key || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`"${safe}"\\s*:\\s*(true|false|null|-?\\d+(?:\\.\\d+)?|"([^"]*)")`, "i");
    const match = source.match(re);
    if (!match) continue;
    if (typeof match[2] === "string") return match[2];
    return String(match[1] || "").trim();
  }
  return "";
}

function normalizePlateText(value) {
  const raw = String(value || "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/[\uFF1A:]/g, "")
    .replace(/[\u0000-\u001f]/g, "")
    .trim();
  if (!raw) return "";
  const compact = raw
    .toUpperCase()
    .replace(/[\u00B7\u2022.]/g, "")
    .replace(/[\s_-]+/g, "");
  const cnMatch = compact.match(/([\u4E00-\u9FFF][A-Z][A-Z0-9]{4,7})/u);
  if (cnMatch?.[1]) return cnMatch[1];
  const enMatch = compact.match(/\b([A-Z]{1,3}[A-Z0-9]{4,7})\b/);
  if (enMatch?.[1]) return enMatch[1];
  return compact;
}

function pickFirstScalarFromStructuredText({ xmlText, jsonText, xmlKeys = [], jsonKeys = [], fallbackKeys = [] }) {
  const xmlValue = extractXmlTagValue(xmlText, xmlKeys.length ? xmlKeys : fallbackKeys);
  if (xmlValue) return xmlValue;
  return extractJsonScalarValue(jsonText, jsonKeys.length ? jsonKeys : fallbackKeys);
}

function inferImageExtension(contentType, filename) {
  const type = String(contentType || "").toLowerCase();
  const lowerFile = String(filename || "").toLowerCase();
  if (type.includes("png") || lowerFile.endsWith(".png")) return ".png";
  if (type.includes("bmp") || lowerFile.endsWith(".bmp")) return ".bmp";
  if (type.includes("webp") || lowerFile.endsWith(".webp")) return ".webp";
  if (type.includes("jpeg") || type.includes("jpg") || lowerFile.endsWith(".jpg") || lowerFile.endsWith(".jpeg")) return ".jpg";
  return ".jpg";
}

function inferImageMime(contentType, ext) {
  const type = String(contentType || "").toLowerCase();
  if (type.startsWith("image/")) return type;
  switch (String(ext || "").toLowerCase()) {
    case ".png":
      return "image/png";
    case ".bmp":
      return "image/bmp";
    case ".webp":
      return "image/webp";
    default:
      return "image/jpeg";
  }
}

function looksLikePlateEvent(eventType, eventCode, xmlText, jsonText) {
  const merged = [eventType, eventCode, xmlText, jsonText].map((x) => String(x || "").toUpperCase()).join(" ");
  return /ANPR|PLATE|TRAFFIC|ITS|SNAP|LICENSE/i.test(merged);
}

function pickPreferredJpegPart(imageParts) {
  if (!Array.isArray(imageParts) || !imageParts.length) return null;
  const rankPart = (part) => {
    const headerText = `${part?.headers?.["content-disposition"] || ""} ${part?.headers?.["content-type"] || ""}`.toLowerCase();
    if (headerText.includes("license") || headerText.includes("plate")) return 0;
    if (headerText.includes("detection")) return 1;
    if (headerText.includes("scene") || headerText.includes("vehicle") || headerText.includes("overview")) return 2;
    if (headerText.includes("closeup") || headerText.includes("snapshot")) return 2;
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
    if (
      type.startsWith("image/") ||
      filename.endsWith(".jpg") ||
      filename.endsWith(".jpeg") ||
      filename.endsWith(".png") ||
      filename.endsWith(".bmp") ||
      filename.endsWith(".webp")
    ) {
      imageParts.push(part);
    }
  }

  const bodyText = decodeBufferText(rawBody);
  if (!xmlTexts.length && /<[\w:]*EventNotificationAlert[\s>]/i.test(bodyText)) xmlTexts.push(bodyText);
  if (!jsonTexts.length && bodyText.trim().startsWith("{")) jsonTexts.push(bodyText);

  const xmlText = xmlTexts.find((text) => /<(?:\w+:)?ANPR[\s>]/i.test(text) || /<(?:\w+:)?EventNotificationAlert[\s>]/i.test(text)) || xmlTexts[0] || "";
  const jsonText = jsonTexts[0] || "";
  const plate = normalizePlateText(
    pickFirstScalarFromStructuredText({
      xmlText,
      jsonText,
      fallbackKeys: ["licensePlate", "plateNumber", "plate", "plateNo", "plateNum", "vehPlate", "vehPlateNo", "license", "licence"]
    })
  );
  const eventType = pickFirstScalarFromStructuredText({
    xmlText,
    jsonText,
    fallbackKeys: ["eventType", "type", "eventName", "eventDescription", "majorEventType", "minorEventType"]
  });
  const eventCode = pickFirstScalarFromStructuredText({
    xmlText,
    jsonText,
    fallbackKeys: ["eventCode", "alarmType", "ruleType", "ruleID"]
  });
  const eventState = pickFirstScalarFromStructuredText({
    xmlText,
    jsonText,
    fallbackKeys: ["eventState", "state", "status"]
  });
  const eventTimeText = pickFirstScalarFromStructuredText({
    xmlText,
    jsonText,
    fallbackKeys: ["dateTime", "eventTime", "time", "absTime", "captureTime", "snapTime", "utcTime"]
  });
  const uuid = pickFirstScalarFromStructuredText({
    xmlText,
    jsonText,
    fallbackKeys: ["UUID", "uuid", "eventID", "eventId", "taskID", "taskId", "snapID", "snapId", "serialNO"]
  });
  const channelId = pickFirstScalarFromStructuredText({
    xmlText,
    jsonText,
    fallbackKeys: ["channelID", "channelId", "ivmsChannel", "cameraID", "cameraId", "deviceID", "deviceId"]
  });
  const ipAddress = pickFirstScalarFromStructuredText({
    xmlText,
    jsonText,
    fallbackKeys: ["ipAddress", "ipv4Address", "deviceAddress", "srcIP", "srcIp"]
  });
  const laneNo = pickFirstScalarFromStructuredText({
    xmlText,
    jsonText,
    fallbackKeys: ["laneNo", "lane", "laneNumber"]
  });
  const plateColor = pickFirstScalarFromStructuredText({
    xmlText,
    jsonText,
    fallbackKeys: ["plateColor", "licensePlateColor", "vehPlateColor"]
  });
  const vehicleColor = pickFirstScalarFromStructuredText({
    xmlText,
    jsonText,
    fallbackKeys: ["vehicleColor", "vehColor", "carColor"]
  });
  const vehicleType = pickFirstScalarFromStructuredText({
    xmlText,
    jsonText,
    fallbackKeys: ["vehicleType", "vehType", "carType"]
  });
  const confidenceText = pickFirstScalarFromStructuredText({
    xmlText,
    jsonText,
    fallbackKeys: ["confidence", "accurate", "credibility"]
  });
  const isRetransmissionText = pickFirstScalarFromStructuredText({
    xmlText,
    jsonText,
    fallbackKeys: ["isDataRetransmission", "retransmission", "isRetransmission"]
  });
  const eventDate = eventTimeText ? new Date(eventTimeText) : null;
  const preferredJpeg = pickPreferredJpegPart(imageParts);
  const imageBuffer = Buffer.isBuffer(preferredJpeg?.body) && preferredJpeg.body.length ? preferredJpeg.body : null;
  const imageExt = inferImageExtension(preferredJpeg?.headers?.["content-type"], parseContentDisposition(preferredJpeg?.headers?.["content-disposition"]).filename);
  const imageMime = inferImageMime(preferredJpeg?.headers?.["content-type"], imageExt);
  const sourceEventKey = buildSourceEventKey({
    uuid,
    plate,
    eventType: `${eventType}|${eventCode}`,
    eventAt: Number.isFinite(eventDate?.getTime()) ? eventDate.toISOString() : "",
    channelId: `${channelId}|${laneNo}`,
    ipAddress
  });

  return {
    plate,
    eventType: String(eventType || "").trim(),
    eventCode: String(eventCode || "").trim(),
    eventState: String(eventState || "").trim(),
    eventDate: Number.isFinite(eventDate?.getTime()) ? eventDate : null,
    laneNo: String(laneNo || "").trim(),
    plateColor: String(plateColor || "").trim(),
    vehicleColor: String(vehicleColor || "").trim(),
    vehicleType: String(vehicleType || "").trim(),
    confidence: Number(confidenceText || 0) || 0,
    imageBuffer,
    imageExt,
    imageMime,
    imageBase64: imageBuffer ? `data:${imageMime};base64,${imageBuffer.toString("base64")}` : "",
    sourceEventKey,
    isRetransmission: toBooleanLoose(isRetransmissionText),
    isPlateEvent: looksLikePlateEvent(eventType, eventCode, xmlText, jsonText),
    hasMultipart: parts.length > 0,
    xmlText
  };
}

async function parseHikvisionIsapiEventInWorker(rawBody, contentType) {
  const workerResult = await new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./isapi-event-worker.js", import.meta.url), {
      workerData: {
        rawBody,
        contentType: String(contentType || "")
      }
    });
    let settled = false;
    worker.once("message", (message) => {
      settled = true;
      if (message?.ok) resolve(message.payload || {});
      else reject(new Error(message?.error || "ISAPI parse worker failed"));
    });
    worker.once("error", (err) => {
      settled = true;
      reject(err);
    });
    worker.once("exit", (code) => {
      if (!settled && code !== 0) reject(new Error(`ISAPI parse worker exited with code ${code}`));
    });
  });

  const imageBuffer = workerResult?.imageBase64 ? Buffer.from(String(workerResult.imageBase64 || ""), "base64") : null;
  const eventDate = workerResult?.eventDateIso ? new Date(workerResult.eventDateIso) : null;
  return {
    plate: String(workerResult?.plate || ""),
    eventType: String(workerResult?.eventType || "").trim(),
    eventCode: String(workerResult?.eventCode || "").trim(),
    eventState: String(workerResult?.eventState || "").trim(),
    eventDate: Number.isFinite(eventDate?.getTime()) ? eventDate : null,
    laneNo: String(workerResult?.laneNo || "").trim(),
    plateColor: String(workerResult?.plateColor || "").trim(),
    vehicleColor: String(workerResult?.vehicleColor || "").trim(),
    vehicleType: String(workerResult?.vehicleType || "").trim(),
    confidence: Number(workerResult?.confidence || 0) || 0,
    imageBuffer,
    imageExt: String(workerResult?.imageExt || ".jpg"),
    imageMime: String(workerResult?.imageMime || "image/jpeg"),
    imageBase64: imageBuffer ? `data:${String(workerResult?.imageMime || "image/jpeg")};base64,${imageBuffer.toString("base64")}` : "",
    sourceEventKey: String(workerResult?.sourceEventKey || ""),
    isRetransmission: !!workerResult?.isRetransmission,
    isPlateEvent: !!workerResult?.isPlateEvent,
    hasMultipart: !!workerResult?.hasMultipart,
    xmlText: String(workerResult?.xmlText || "")
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
  if (Array.isArray(patch.devices)) {
    next.devices = normalizeManagedDeviceList(patch.devices);
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

function newManagedDeviceId() {
  return `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function normalizeManagedDevice(raw, fallback = {}) {
  const base = normalizeConnectionConfig({
    host: raw?.host ?? fallback.host,
    port: raw?.port ?? fallback.port,
    username: raw?.username ?? fallback.username,
    password: raw?.password ?? fallback.password
  });
  const protocolRaw = String(raw?.protocol ?? fallback.protocol ?? "hikvision-isapi").trim().toLowerCase();
  const protocol = ALLOWED_DEVICE_PROTOCOLS.has(protocolRaw) ? protocolRaw : "hikvision-isapi";
  const id = String(raw?.id ?? fallback.id ?? newManagedDeviceId()).trim() || newManagedDeviceId();
  const deviceId = String(raw?.deviceId ?? fallback.deviceId ?? "").trim().slice(0, 20);
  const nameRaw = String(raw?.name ?? fallback.name ?? "").trim();
  const name = nameRaw || `${base.host || "未命名设备"}:${base.port || 80}`;
  const summary = raw?.summary && typeof raw.summary === "object" ? raw.summary : fallback.summary && typeof fallback.summary === "object" ? fallback.summary : {};
  const onlineState = String(raw?.onlineState ?? fallback.onlineState ?? "unknown").trim().toLowerCase();
  const checkedAt = Number(raw?.checkedAt ?? fallback.checkedAt ?? 0) || 0;
  return {
    id,
    deviceId,
    name: name.slice(0, 80),
    protocol,
    host: base.host,
    port: base.port,
    username: base.username,
    password: base.password,
    onlineState: onlineState === "online" || onlineState === "offline" ? onlineState : "unknown",
    checkedAt,
    summary: {
      deviceName: String(summary?.deviceName || ""),
      model: String(summary?.model || ""),
      firmwareVersion: String(summary?.firmwareVersion || ""),
      manufacturer: String(summary?.manufacturer || ""),
      serialNumber: String(summary?.serialNumber || ""),
      ipv4Address: String(summary?.ipv4Address || "")
    }
  };
}

function normalizeManagedDeviceList(rawList) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(rawList) ? rawList : []) {
    const normalized = normalizeManagedDevice(item);
    if (!normalized.host) continue;
    if (seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    out.push(normalized);
  }
  return out;
}

function buildIsapiDeviceUrl({ host, port, pathname = "/ISAPI/System/deviceInfo" }) {
  const safeHost = String(host || "").trim();
  const safePort = toPort(port, 80) || 80;
  const safePath = String(pathname || "/ISAPI/System/deviceInfo").trim() || "/ISAPI/System/deviceInfo";
  const pathWithSlash = safePath.startsWith("/") ? safePath : `/${safePath}`;
  return `http://${safeHost}:${safePort}${pathWithSlash}`;
}

function summarizeIsapiDeviceInfo(xmlText) {
  const xml = String(xmlText || "");
  return {
    deviceName: extractXmlTagValue(xml, ["deviceName", "DeviceName"]) || "",
    model: extractXmlTagValue(xml, ["model", "Model", "deviceModel", "DeviceModel"]) || "",
    firmwareVersion: extractXmlTagValue(xml, ["firmwareVersion", "firmwareVersionInfo", "FirmwareVersion"]) || "",
    firmwareReleasedDate: extractXmlTagValue(xml, ["firmwareReleasedDate", "FirmwareReleasedDate"]) || "",
    manufacturer: extractXmlTagValue(xml, ["manufacturer", "Manufacturer"]) || "",
    serialNumber: extractXmlTagValue(xml, ["serialNumber", "subSerialNumber", "deviceSN", "DeviceSN", "SerialNumber"]) || "",
    macAddress: extractXmlTagValue(xml, ["macAddress", "MACAddress"]) || "",
    ipv4Address: extractXmlTagValue(xml, ["ipAddress", "IPv4Address"]) || ""
  };
}

function summarizeDahuaHttpInfo(text) {
  const source = String(text || "");
  const pick = (key) => {
    const m = source.match(new RegExp(`(?:^|\\n)${key}=([^\\n]+)`, "i"));
    return m ? String(m[1] || "").trim() : "";
  };
  return {
    deviceName: pick("deviceName") || pick("name"),
    model: pick("model") || pick("deviceType"),
    firmwareVersion: pick("version") || pick("firmwareVersion"),
    manufacturer: "Dahua",
    serialNumber: pick("serialNumber") || pick("sn"),
    ipv4Address: pick("eth0\\.IPAddress") || pick("IPAddress") || ""
  };
}

function formatProtocolSummary(summary = {}) {
  const parts = [];
  if (summary.protocolLabel) parts.push(summary.protocolLabel);
  if (summary.testMode) parts.push(summary.testMode);
  if (summary.deviceName) parts.push(summary.deviceName);
  if (summary.model) parts.push(summary.model);
  if (summary.serialNumber) parts.push(summary.serialNumber);
  if (summary.message) parts.push(summary.message);
  return parts.filter(Boolean).join(" | ");
}

function getProtocolLabel(protocol) {
  switch (String(protocol || "").trim()) {
    case "gb28181":
      return "国标GB28181（2016/2022）";
    case "ehome":
      return "国家电网B接口";
    case "jt1078-terminal":
      return "交通部JT1078终端设备";
    case "jt1078-platform":
      return "交通部JT1078下级平台";
    case "onvif":
      return "ONVIF 2.0";
    case "hikvision-private":
      return "海康私有协议";
    case "dahua-http":
      return "大华HTTP";
    case "dahua-private":
      return "大华私有协议";
    case "hikvision-isapi":
    default:
      return "海康ISAPI";
  }
}

async function testTcpReachability({ host, port, timeoutMs = 2500 }) {
  const conn = normalizeConnectionConfig({ host, port });
  if (!conn.host) throw new Error("请填写设备 IP / Host");
  return await new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (err, payload) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(payload);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      finish(null, {
        protocolLabel: "TCP",
        testMode: "端口探测",
        message: `${conn.host}:${conn.port} 可达`
      });
    });
    socket.once("timeout", () => finish(new Error(`TCP 连接超时：${conn.host}:${conn.port}`)));
    socket.once("error", (err) => finish(err));
    socket.connect(conn.port, conn.host);
  });
}

async function testOnvifConnection({ host, port, username, password }) {
  const conn = normalizeConnectionConfig({ host, port, username, password });
  if (!conn.host) throw new Error("请填写设备 IP / Host");
  return await new Promise((resolve, reject) => {
    const device = new Cam(
      {
        hostname: conn.host,
        port: conn.port,
        username: conn.username,
        password: conn.password,
        timeout: 5000
      },
      function onConnect(err) {
        if (err) return reject(err);
        const info = this?.deviceInformation || {};
        resolve({
          protocolLabel: getProtocolLabel("onvif"),
          testMode: "ONVIF 握手",
          deviceName: String(info?.Manufacturer || ""),
          model: String(info?.Model || ""),
          firmwareVersion: String(info?.FirmwareVersion || ""),
          serialNumber: String(info?.SerialNumber || ""),
          message: `${conn.host}:${conn.port} ONVIF 可连接`
        });
      }
    );
    setTimeout(() => {
      try {
        device?.removeAllListeners?.();
      } catch {}
      reject(new Error(`ONVIF 连接超时：${conn.host}:${conn.port}`));
    }, 5200);
  });
}

async function requestDahuaHttp({ host, port, username, password, pathname = "/cgi-bin/magicBox.cgi?action=getSystemInfo" }) {
  const conn = normalizeConnectionConfig({ host, port, username, password });
  if (!conn.host) throw new Error("请填写设备 IP / Host");
  if (!conn.username) throw new Error("请填写摄像头用户名");
  if (!conn.password) throw new Error("请填写摄像头密码");
  const safePath = String(pathname || "/cgi-bin/magicBox.cgi?action=getSystemInfo").trim() || "/cgi-bin/magicBox.cgi?action=getSystemInfo";
  const url = `http://${conn.host}:${conn.port}${safePath.startsWith("/") ? "" : "/"}${safePath}`;
  const requestOptions = { method: "GET", headers: { Accept: "text/plain, */*;q=0.8" } };
  const digestClient = new DigestClient(conn.username, conn.password);
  let res = await digestClient.fetch(url, requestOptions);
  if (res.status === 401 || res.status === 403) {
    const basicClient = new DigestClient(conn.username, conn.password, { basic: true });
    res = await basicClient.fetch(url, requestOptions);
  }
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP 请求失败：${res.status}${text ? ` - ${text.slice(0, 180)}` : ""}`);
  }
  return { url, status: res.status, text };
}

async function testDeviceConnectionByProtocol({ protocol, host, port, username, password }) {
  const normalizedProtocol = ALLOWED_DEVICE_PROTOCOLS.has(String(protocol || "").trim()) ? String(protocol).trim() : "hikvision-isapi";
  if (normalizedProtocol === "hikvision-isapi") {
    const result = await requestHikvisionIsapi({ host, port, username, password, pathname: "/ISAPI/System/deviceInfo", method: "GET" });
    const summary = summarizeIsapiDeviceInfo(result.text);
    return {
      ok: true,
      requestUrl: result.url,
      rawText: result.text,
      summary: {
        ...summary,
        protocolLabel: getProtocolLabel(normalizedProtocol),
        testMode: "ISAPI 设备信息",
        message: `${host}:${port} ISAPI 可连接`
      }
    };
  }
  if (normalizedProtocol === "onvif") {
    const summary = await testOnvifConnection({ host, port, username, password });
    return { ok: true, requestUrl: `http://${host}:${port}/onvif/device_service`, rawText: formatProtocolSummary(summary), summary };
  }
  if (normalizedProtocol === "dahua-http") {
    const result = await requestDahuaHttp({ host, port, username, password });
    const summary = summarizeDahuaHttpInfo(result.text);
    return {
      ok: true,
      requestUrl: result.url,
      rawText: result.text,
      summary: {
        ...summary,
        protocolLabel: getProtocolLabel(normalizedProtocol),
        testMode: "HTTP 系统信息",
        message: `${host}:${port} HTTP 可连接`
      }
    };
  }
  const tcpSummary = await testTcpReachability({ host, port });
  return {
    ok: true,
    requestUrl: `tcp://${host}:${port}`,
    rawText: formatProtocolSummary({ ...tcpSummary, protocolLabel: getProtocolLabel(normalizedProtocol) }),
    summary: {
      protocolLabel: getProtocolLabel(normalizedProtocol),
      testMode: "TCP 可达性",
      message: `${host}:${port} 端口可达`
    }
  };
}

async function requestHikvisionIsapi({ host, port, username, password, pathname = "/ISAPI/System/deviceInfo", method = "GET", body = "" }) {
  const conn = normalizeConnectionConfig({ host, port, username, password });
  if (!conn.host) throw new Error("请填写摄像头 IP / Host");
  if (!conn.username) throw new Error("请填写摄像头用户名");
  if (!conn.password) throw new Error("请填写摄像头密码");
  const url = buildIsapiDeviceUrl({ host: conn.host, port: conn.port, pathname });
  const headers = { Accept: "application/xml, text/xml;q=0.9, */*;q=0.8" };
  const requestOptions = { method: String(method || "GET").toUpperCase(), headers };
  if (String(body || "")) {
    requestOptions.body = String(body);
    headers["Content-Type"] = "application/xml; charset=utf-8";
  }

  const digestClient = new DigestClient(conn.username, conn.password);
  let res = await digestClient.fetch(url, requestOptions);
  if (res.status === 401 || res.status === 403) {
    const basicClient = new DigestClient(conn.username, conn.password, { basic: true });
    res = await basicClient.fetch(url, requestOptions);
  }
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ISAPI 请求失败：HTTP ${res.status}${text ? ` - ${text.slice(0, 180)}` : ""}`);
  }
  return {
    url,
    status: res.status,
    contentType: String(res.headers.get("content-type") || ""),
    text
  };
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

function netmaskToPrefix(maskText) {
  if (!isValidIpv4(maskText)) return "";
  const octets = String(maskText || "")
    .trim()
    .split(".")
    .map((part) => Number(part));
  let bits = "";
  for (const octet of octets) bits += octet.toString(2).padStart(8, "0");
  if (!/^1*0*$/.test(bits)) return "";
  const prefix = bits.indexOf("0");
  return String(prefix < 0 ? 32 : prefix);
}

function normalizeIpv4PrefixValue(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (isValidIpv4(text)) return netmaskToPrefix(text);
  const num = Number(text);
  if (!Number.isInteger(num) || num < 1 || num > 32) return "";
  return String(num);
}

function normalizeSystemConfig(raw) {
  const name = String(raw?.name || "").trim();
  const clientMode = Boolean(raw?.clientMode);
  const ipMode = String(raw?.ipMode || "auto").trim().toLowerCase() === "manual" ? "manual" : "auto";
  const preferredIpRaw = String(raw?.preferredIp || "").trim();
  const manualIpRaw = String(raw?.manualIp || "").trim();
  const manualPrefixRaw = String(raw?.manualPrefix || "").trim();
  const manualGatewayRaw = String(raw?.manualGateway || "").trim();
  const preferredIp = isValidIpv4(preferredIpRaw) ? preferredIpRaw : "";
  const manualIp = isValidIpv4(manualIpRaw) ? manualIpRaw : "";
  const manualGateway = isValidIpv4(manualGatewayRaw) ? manualGatewayRaw : "";
  const manualPrefix = normalizeIpv4PrefixValue(manualPrefixRaw);
  return { name, clientMode, ipMode, preferredIp, manualIp, manualPrefix, manualGateway };
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
  if (Object.prototype.hasOwnProperty.call(raw, "manualPrefix")) {
    out.manualPrefix = normalizeIpv4PrefixValue(raw.manualPrefix);
  }
  if (Object.prototype.hasOwnProperty.call(raw, "manualGateway")) {
    const v = String(raw.manualGateway || "").trim();
    out.manualGateway = isValidIpv4(v) ? v : "";
  }
  return Object.keys(out).length ? out : null;
}

function normalizeIngestConfig(raw) {
  const ftpServer = normalizeFtpServerConfig(raw?.ftpServer);
  ftpServer.resolvedRootDir = resolveFtpRootDir(ftpServer.rootDir);
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
  const devices = normalizeManagedDeviceList(info?.devices);
  const probe = normalizeProbeConfig(info?.probe);
  const serial = normalizeSerialConfig(info?.serial);
  const system = normalizeSystemConfig(info?.system);
  const ingest = normalizeIngestConfig(info?.ingest);
  const registryBaseUrl = String(info?.registryBaseUrl || "").trim().replace(/\/+$/, "");
  let systemNetworkTarget = null;
  try {
    systemNetworkTarget = await resolveUbuntuManagedInterface(system);
  } catch {
    systemNetworkTarget = null;
  }
  return { connection, devices, probe, serial, system, ingest, registryBaseUrl, systemNetworkTarget };
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

function execFileAsync(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, maxBuffer: 1024 * 1024, ...options }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = String(stdout || "");
        error.stderr = String(stderr || "");
        reject(error);
        return;
      }
      resolve({ stdout: String(stdout || ""), stderr: String(stderr || "") });
    });
  });
}

function parseIpRouteGateway(text, ifaceName) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (ifaceName && !new RegExp(`\\bdev\\s+${ifaceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(line)) continue;
    const m = line.match(/\bvia\s+(\d{1,3}(?:\.\d{1,3}){3})\b/);
    if (m?.[1]) return m[1];
  }
  return "";
}

function parseLinuxIpv4Prefix(text, ifaceName, ipAddress = "") {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (ifaceName && !line.includes(` ${ifaceName} `) && !line.includes(` ${ifaceName}:`)) continue;
    const regex = ipAddress
      ? new RegExp(`\\b${ipAddress.replace(/\./g, "\\.")}\\/(\\d{1,2})\\b`)
      : /\b(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})\b/;
    const match = line.match(regex);
    if (match?.[1] && ipAddress) return Number(match[1]) || 24;
    if (match?.[2]) return Number(match[2]) || 24;
  }
  return 24;
}

async function resolveUbuntuManagedInterface(systemCfg) {
  const ifaces = listPrivateIPv4();
  if (!ifaces.length) {
    throw new Error("未找到可配置的 IPv4 网卡");
  }
  const cfg = normalizeSystemConfig(systemCfg);
  const preferredCandidates = [String(cfg.preferredIp || "").trim(), String(cfg.manualIp || "").trim()].filter(Boolean);
  let selected = ifaces[0];
  for (const ip of preferredCandidates) {
    const hit = ifaces.find((item) => item.address === ip);
    if (hit) {
      selected = hit;
      break;
    }
  }

  const ifaceName = String(selected?.name || "").trim();
  if (!ifaceName) throw new Error("未找到可配置的网卡名称");

  let connectionName = ifaceName;
  try {
    const { stdout } = await execFileAsync("nmcli", ["-g", "GENERAL.CONNECTION", "device", "show", ifaceName]);
    const firstLine = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    if (firstLine && firstLine !== "--") connectionName = firstLine;
  } catch {}

  let gateway = "";
  try {
    const { stdout } = await execFileAsync("ip", ["route", "show", "default"]);
    gateway = parseIpRouteGateway(stdout, ifaceName);
  } catch {}

  let prefix = 24;
  try {
    const { stdout } = await execFileAsync("ip", ["-o", "-4", "addr", "show", "dev", ifaceName]);
    prefix = parseLinuxIpv4Prefix(stdout, ifaceName, selected.address);
  } catch {}

  return {
    name: ifaceName,
    connectionName,
    address: String(selected?.address || "").trim(),
    netmask: String(selected?.netmask || "").trim(),
    prefix: Math.max(1, Math.min(32, Number(prefix) || 24)),
    gateway
  };
}

async function applyUbuntuSystemNetwork(nextSystem, currentSystem) {
  if (process.platform !== "linux") {
    return { applied: false, skipped: true, reason: "platform", message: "当前平台不是 Ubuntu/Linux，未执行系统网卡修改" };
  }
  const desired = normalizeSystemConfig(nextSystem);
  const previous = normalizeSystemConfig(currentSystem);
  const modeChanged =
    desired.ipMode !== previous.ipMode ||
    String(desired.manualIp || "") !== String(previous.manualIp || "") ||
    String(desired.preferredIp || "") !== String(previous.preferredIp || "");
  if (!modeChanged) {
    return { applied: false, skipped: true, reason: "unchanged", message: "网络设置未变化" };
  }

  const iface = await resolveUbuntuManagedInterface(previous);
  try {
    await execFileAsync("nmcli", ["--version"]);
  } catch {
    throw new Error("系统缺少 nmcli，无法应用 Ubuntu 网卡配置");
  }

  const connectionName = iface.connectionName || iface.name;
  if (desired.ipMode === "manual") {
    const manualIp = String(desired.manualIp || "").trim();
    if (!isValidIpv4(manualIp)) {
      throw new Error("手动 IP 地址无效");
    }
    const prefix = Math.max(1, Math.min(32, Number(desired.manualPrefix || iface.prefix || 24) || 24));
    const gateway = String(desired.manualGateway || iface.gateway || "").trim();
    const addressWithPrefix = `${manualIp}/${prefix}`;
    const modifyArgs = ["connection", "modify", connectionName, "ipv4.method", "manual", "ipv4.addresses", addressWithPrefix];
    if (gateway) {
      modifyArgs.push("ipv4.gateway", gateway);
    } else {
      modifyArgs.push("ipv4.gateway", "");
    }
    await execFileAsync("nmcli", modifyArgs);
  } else {
    await execFileAsync("nmcli", ["connection", "modify", connectionName, "ipv4.method", "auto", "ipv4.addresses", "", "ipv4.gateway", ""]);
  }

  await execFileAsync("nmcli", ["connection", "up", connectionName, "ifname", iface.name]);
  return {
    applied: true,
    skipped: false,
    iface: iface.name,
    connectionName,
    message:
      desired.ipMode === "manual"
        ? `已应用网卡 ${iface.name} 的手动 IP：${desired.manualIp}/${String(desired.manualPrefix || iface.prefix || 24).trim()}`
        : `已恢复网卡 ${iface.name} 为自动获取 IP`
  };
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

app.get("/api/plates/count", (req, res) => {
  try {
    const result = stmtPlateCount.get();
    const total = Number(result?.total || 0);
    console.log(`[服务器调试] /api/plates/count: 总记录数=${total}`);
    res.json({ ok: true, total });
  } catch (error) {
    console.error(`[服务器调试] /api/plates/count 错误:`, error);
    res.status(500).json({ ok: false, error: "获取记录数失败" });
  }
});

app.get("/api/plates/latest", (req, res) => {
  const limit = toPositiveInt(req.query?.limit, 2000);
  const max = Math.max(1, Math.min(10000, limit)); // 增加最大限制到10000条
  console.log(`[服务器调试] /api/plates/latest: limit=${limit}, max=${max}`);
  const rows = stmtPlateListLatest.all(max);
  console.log(`[服务器调试] 数据库查询返回 ${rows.length} 条记录`);
  const items = rows.map(rowToPlateDto);
  res.json({ ok: true, items });
});

app.get("/api/plates/search", (req, res) => {
  const plate = String(req.query?.plate || "").trim();
  const date = String(req.query?.date || "").trim();
  
  const plateParam = plate ? `%${plate}%` : null;
  const dateParam = date || null;
  
  const rows = stmtPlateSearch.all(plateParam, plateParam, dateParam, dateParam);
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
  
  // 提取原始文件名 - 优先使用ftpRemotePath，其次使用imagePath
  let originalFilename = "image.jpg";
  
  // 首先尝试从ftpRemotePath中提取文件名
  const ftpRemotePath = String(row.ftpRemotePath || "");
  if (ftpRemotePath) {
    const ftpPathParts = ftpRemotePath.split(/[\\/]/);
    if (ftpPathParts.length > 0) {
      originalFilename = ftpPathParts[ftpPathParts.length - 1];
    }
  }
  // 如果没有ftpRemotePath，从imagePath中提取
  else {
    const pathParts = rel.split(/[\\/]/);
    if (pathParts.length > 0) {
      originalFilename = pathParts[pathParts.length - 1];
    }
  }
  
  res.sendFile(abs, { 
    headers: { 
      "Cache-Control": "no-store",
      // 设置Content-Disposition头，使用原始文件名
      "Content-Disposition": `attachment; filename="${encodeURIComponent(originalFilename)}"`,
      // 添加性能优化头
      "Accept-Ranges": "bytes",
      "Content-Type": "image/jpeg",
      // 启用压缩（如果支持）
      "Vary": "Accept-Encoding"
    },
    // 启用缓存（对于大文件有帮助）
    cacheControl: false
  }, (err) => {
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
  const onlyDevices =
    Array.isArray(req.body?.devices) &&
    !req.body?.connection &&
    !req.body?.probe &&
    !req.body?.serial &&
    !req.body?.system &&
    !req.body?.ingest &&
    typeof req.body?.registryBaseUrl !== "string";
  if (!onlyDevices) return next();
  try {
    await saveDeviceInfoPatch({ devices: normalizeManagedDeviceList(req.body.devices) });
    const config = await getClientConfig();
    res.json({ ok: true, config });
  } catch (err) {
    next(err);
  }
});

app.get("/api/devices", async (req, res, next) => {
  try {
    const config = await getClientConfig();
    res.json({ ok: true, items: config.devices || [] });
  } catch (err) {
    next(err);
  }
});

app.post("/api/devices", async (req, res, next) => {
  try {
    const info = await loadOrInitDeviceInfo();
    const devices = normalizeManagedDeviceList(info?.devices);
    const device = normalizeManagedDevice(req.body?.device || {});
    if (!device.host) {
      const err = new Error("请填写设备 IP / Host");
      err.statusCode = 400;
      throw err;
    }
    devices.unshift(device);
    await saveDeviceInfoPatch({ devices });
    res.json({ ok: true, item: device });
  } catch (err) {
    next(err);
  }
});

app.put("/api/devices/:id", async (req, res, next) => {
  try {
    const targetId = String(req.params.id || "").trim();
    const info = await loadOrInitDeviceInfo();
    const devices = normalizeManagedDeviceList(info?.devices);
    const index = devices.findIndex((item) => item.id === targetId);
    if (index < 0) {
      const err = new Error("设备不存在");
      err.statusCode = 404;
      throw err;
    }
    const updated = normalizeManagedDevice(req.body?.device || {}, devices[index]);
    devices[index] = updated;
    await saveDeviceInfoPatch({ devices });
    res.json({ ok: true, item: updated });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/devices/:id", async (req, res, next) => {
  try {
    const targetId = String(req.params.id || "").trim();
    const info = await loadOrInitDeviceInfo();
    const devices = normalizeManagedDeviceList(info?.devices);
    const nextDevices = devices.filter((item) => item.id !== targetId);
    if (nextDevices.length === devices.length) {
      const err = new Error("设备不存在");
      err.statusCode = 404;
      throw err;
    }
    await saveDeviceInfoPatch({ devices: nextDevices });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.post("/api/device/test-connection", async (req, res, next) => {
  try {
    const cfg = await getClientConfig();
    const baseConn = normalizeConnectionConfig(cfg?.connection);
    const reqConn = req.body?.connection && typeof req.body.connection === "object" ? normalizeConnectionConfig(req.body.connection) : {};
    const protocol = String(req.body?.protocol || "hikvision-isapi").trim() || "hikvision-isapi";
    const connection = normalizeConnectionConfig({
      host: reqConn.host || baseConn.host,
      port: reqConn.port || baseConn.port,
      username: reqConn.username || baseConn.username,
      password: reqConn.password || baseConn.password
    });
    const result = await testDeviceConnectionByProtocol({
      protocol,
      ...connection
    });
    res.json({
      ok: true,
      protocol,
      connection: {
        host: connection.host,
        port: connection.port,
        username: connection.username
      },
      requestUrl: result.requestUrl,
      summary: result.summary,
      rawText: result.rawText
    });
  } catch (err) {
    next(err);
  }
});

app.post("/api/devices/:id/check", async (req, res, next) => {
  try {
    const targetId = String(req.params.id || "").trim();
    const info = await loadOrInitDeviceInfo();
    const devices = normalizeManagedDeviceList(info?.devices);
    const index = devices.findIndex((item) => item.id === targetId);
    if (index < 0) {
      const err = new Error("设备不存在");
      err.statusCode = 404;
      throw err;
    }
    const device = devices[index];
    if (device.protocol !== "hikvision-isapi") {
      const err = new Error(`当前协议暂不支持在线检测：${device.protocol}`);
      err.statusCode = 400;
      throw err;
    }
    const checkedAt = Date.now();
    try {
      const result = await requestHikvisionIsapi({
        host: device.host,
        port: device.port,
        username: device.username,
        password: device.password,
        pathname: "/ISAPI/System/deviceInfo",
        method: "GET"
      });
      const summary = summarizeIsapiDeviceInfo(result.text);
      devices[index] = normalizeManagedDevice({
        ...device,
        onlineState: "online",
        checkedAt,
        summary
      });
      await saveDeviceInfoPatch({ devices });
      res.json({ ok: true, item: devices[index], rawText: result.text, requestUrl: result.url });
    } catch (e) {
      devices[index] = normalizeManagedDevice({
        ...device,
        onlineState: "offline",
        checkedAt
      });
      await saveDeviceInfoPatch({ devices });
      res.status(502).json({ ok: false, error: String(e?.message || e), item: devices[index] });
    }
  } catch (err) {
    next(err);
  }
});

app.post("/api/isapi/device-info", async (req, res, next) => {
  try {
    const cfg = await getClientConfig();
    const baseConn = normalizeConnectionConfig(cfg?.connection);
    const reqConn = req.body?.connection && typeof req.body.connection === "object" ? normalizeConnectionConfig(req.body.connection) : {};
    const connection = normalizeConnectionConfig({
      host: reqConn.host || baseConn.host,
      port: reqConn.port || baseConn.port,
      username: reqConn.username || baseConn.username,
      password: reqConn.password || baseConn.password
    });
    const result = await requestHikvisionIsapi({
      ...connection,
      pathname: "/ISAPI/System/deviceInfo",
      method: "GET"
    });
    res.json({
      ok: true,
      connection: {
        host: connection.host,
        port: connection.port,
        username: connection.username
      },
      requestUrl: result.url,
      summary: summarizeIsapiDeviceInfo(result.text),
      rawText: result.text
    });
  } catch (err) {
    next(err);
  }
});

app.post("/api/device/config", async (req, res, next) => {
  try {
    const currentConfig = await getClientConfig();
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
    if (Array.isArray(req.body?.devices)) {
      patch.devices = normalizeManagedDeviceList(req.body.devices);
    }
    if (typeof req.body?.registryBaseUrl === "string") {
      const v = String(req.body.registryBaseUrl || "").trim().replace(/\/+$/, "");
      if (!v || isHttpUrl(v)) patch.registryBaseUrl = v;
    }

    let networkApplyResult = null;
    if (patch.system) {
      const nextSystem = normalizeSystemConfig({ ...(currentConfig?.system || {}), ...patch.system });
      networkApplyResult = await applyUbuntuSystemNetwork(nextSystem, currentConfig?.system || {});
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
    res.json({ ok: true, config, networkApplyResult });
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

function broadcastSerialSent(id, sentAt) {
  const key = String(id || "").trim();
  const ts = Number(sentAt || 0);
  if (!key || !Number.isFinite(ts) || ts <= 0) return;
  broadcastEvent({ type: "serial-sent", id: key, sentAt: Math.floor(ts) });
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

function planPlateFtpUpload({ plate, eventDate, ext = ".jpg" }) {
  const cfg = getFtpConfig();
  if (!cfg.enabled) return null;
  const { y, m, day } = formatDateFolderParts(eventDate);
  const safePlate = sanitizeNamePart(plate);
  const remoteDir = `${cfg.baseDir}/${y}/${m}/${day}`;
  const safeExt = /^\.[a-z0-9]+$/i.test(String(ext || "").trim()) ? String(ext).trim().toLowerCase() : ".jpg";
  const remoteName = `${formatTimestampForFile(eventDate)}_${safePlate}${safeExt}`;
  const remotePath = `${remoteDir}/${remoteName}`;
  return { remoteDir, remoteName, remotePath };
}

async function uploadPlateBufferToFtp({ imageBuffer, remoteDir, remoteName }) {
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
    await client.uploadFrom(Readable.from(imageBuffer), remoteName);
  } finally {
    client.close();
  }
}

app.post("/api/isapi/event", express.raw({ type: "*/*", limit: "50mb" }), async (req, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
    let parsed;
    try {
      parsed = await parseHikvisionIsapiEventInWorker(rawBody, req.headers["content-type"] || "");
    } catch (workerErr) {
      console.warn("[ISAPI] worker parse fallback:", workerErr?.message || String(workerErr));
      parsed = parseHikvisionIsapiEvent(rawBody, req.headers["content-type"] || "");
    }
    const plate = parsed.plate;
    const eventType = String(parsed.eventType || "").trim().toUpperCase();
    const eventCode = String(parsed.eventCode || "").trim().toUpperCase();
    const eventState = String(parsed.eventState || "").trim().toLowerCase();
    const isAnprLike = Boolean(parsed.isPlateEvent) || !eventType || eventType.includes("ANPR") || eventType.includes("PLATE") || eventCode.includes("ANPR") || eventCode.includes("PLATE");
    
    const imageBase64 = parsed.imageBase64;
    const imageBuffer = parsed.imageBuffer;
    const imageExt = String(parsed.imageExt || ".jpg");
    if (plate && isAnprLike && (!eventState || eventState === "active")) {
      if (parsed.sourceEventKey) {
        const existing = stmtPlateGetBySourceEventKey.get(parsed.sourceEventKey);
        if (existing) {
          res.status(200).send("OK");
          return;
        }
      }
      console.log(`[ISAPI] received plate ${plate}`);
      const eventDate = parsed.eventDate || new Date();
      const timestamp = eventDate.toISOString();
      const receivedAt = Date.now();
      const id = newPlateId(receivedAt);
      const serialForwardTask = startPlateSerialForward(plate);
      const ftpPlan = imageBuffer ? planPlateFtpUpload({ plate, eventDate, ext: imageExt }) : null;
      if (imageBuffer && ftpPlan) {
        setImmediate(() => {
          uploadPlateBufferToFtp({ imageBuffer, remoteDir: ftpPlan.remoteDir, remoteName: ftpPlan.remoteName }).catch((err) => {
            console.error("[FTP] upload failed:", err?.message || String(err));
          });
        });
      }
      let imagePath = "";
      if (imageBuffer) {
        try {
          const imagePlan = planPlateBufferSave({ eventDate, plate, id, ext: imageExt });
          imagePath = imagePlan.imagePath;
          setImmediate(() => {
            writePlateBufferToDiskInWorker({ imageBuffer, absPath: imagePlan.absPath }).catch((err) => {
              console.error("[IMAGE] async save failed:", err?.message || String(err));
            });
          });
        } catch {}
      }
      const parsedMeta = {
        source: "isapi",
        eventType: parsed.eventType || "",
        eventCode: parsed.eventCode || "",
        eventState: parsed.eventState || "",
        channelId: parsed.channelId || "",
        ipAddress: parsed.ipAddress || "",
        laneNo: parsed.laneNo || "",
        plateColor: parsed.plateColor || "",
        vehicleColor: parsed.vehicleColor || "",
        vehicleType: parsed.vehicleType || "",
        confidence: parsed.confidence || "",
        isRetransmission: Boolean(parsed.isRetransmission),
        ftpRemotePath: ftpPlan?.remotePath || ""
      };
      try {
        stmtPlateInsert.run({
          id,
          plate: String(plate || ""),
          receivedAt,
          eventAt: eventDate.getTime(),
          imagePath,
          sourceEventKey: parsed.sourceEventKey || "",
          ftpRemotePath: ftpPlan?.remotePath || "",
          serialSentAt: 0,
          parsedMetaJson: safeStringifyParsedMeta(parsedMeta)
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
        ftpRemotePath: ftpPlan?.remotePath || "",
        parsedMeta
      });
      if (serialForwardTask) {
        void serialForwardTask.then((sentAt) => {
          if (!sentAt) return;
          try {
            stmtPlateUpdateSerialSent.run(sentAt, id);
            broadcastSerialSent(id, sentAt);
          } catch {}
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
