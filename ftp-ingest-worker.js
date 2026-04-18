import fs from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";
import { parentPort, workerData } from "node:worker_threads";

function isFtpImageFile(filePath) {
  return /\.(jpe?g|png|bmp|webp)$/i.test(String(filePath || ""));
}

function isFtpMetadataFile(filePath) {
  return /\.(json|xml|txt|dat)$/i.test(String(filePath || ""));
}

async function listFilesRecursive(rootDir) {
  const out = [];
  const stack = [{ fsDir: rootDir, displayDir: rootDir }];
  while (stack.length) {
    const { fsDir, displayDir } = stack.pop();
    const stringEntries = await fs.readdir(fsDir, { withFileTypes: true }).catch(() => []);
    const rawEntries = await fs.readdir(fsDir, { withFileTypes: true, encoding: "buffer" }).catch(() => []);
    const count = Math.min(stringEntries.length, rawEntries.length || stringEntries.length);
    for (let index = 0; index < count; index += 1) {
      const entry = stringEntries[index];
      const rawEntry = rawEntries[index];
      const displayName = decodeFtpEntryName(rawEntry?.name, entry?.name);
      const abs = path.join(fsDir, entry.name);
      const displayAbs = path.join(displayDir, displayName || entry.name);
      if (entry.isDirectory()) {
        stack.push({ fsDir: abs, displayDir: displayAbs });
      } else if (entry.isFile()) {
        out.push({ absPath: abs, displayPath: displayAbs });
      }
    }
  }
  return out;
}

function scoreDecodedFilename(text) {
  const raw = String(text || "");
  if (!raw) return -Infinity;
  let score = 0;
  score += (raw.match(/[\u4E00-\u9FFF]/g) || []).length * 8;
  score += (raw.match(/[A-Za-z0-9._-]/g) || []).length * 2;
  score -= (raw.match(/[\uFFFD]/g) || []).length * 12;
  score -= (raw.match(/(?:鏃犺溅鐗|姝ｅ父|鍏跺畠鑹|灏忓瀷杞|涓瀷杞|澶у瀷杞|鏃燺|瞋|宊|)/g) || []).length * 18;
  score -= (raw.match(/[^\u4E00-\u9FFFA-Za-z0-9._-]/g) || []).length * 2;
  score += (raw.match(/(?:无车牌|正常|其它色|小型车|中型车|大型车)/g) || []).length * 20;
  return score;
}

function decodeFtpEntryName(rawName, fallbackName = "") {
  if (!Buffer.isBuffer(rawName) || !rawName.length) return String(fallbackName || "");
  const candidates = [];
  try {
    candidates.push(new TextDecoder("utf-8", { fatal: false }).decode(rawName));
  } catch {}
  try {
    candidates.push(new TextDecoder("gb18030", { fatal: false }).decode(rawName));
  } catch {}
  candidates.push(String(fallbackName || ""));
  let best = String(fallbackName || "");
  let bestScore = scoreDecodedFilename(best);
  for (const candidate of candidates) {
    const score = scoreDecodedFilename(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return String(best || fallbackName || "");
}

function isWithinArchive(absPath, rootDir, archiveDirName) {
  const rel = path.relative(rootDir, absPath);
  return !!rel && !rel.startsWith("..") && rel.split(path.sep).includes(archiveDirName);
}

async function collectCandidates(rootDir, archiveDirName) {
  const files = await listFilesRecursive(rootDir);
  const metadataByStem = new Map();
  for (const fileInfo of files) {
    const absPath = String(fileInfo?.absPath || "");
    const displayPath = String(fileInfo?.displayPath || absPath);
    if (isWithinArchive(absPath, rootDir, archiveDirName)) continue;
    if (!isFtpMetadataFile(absPath)) continue;
    const ext = path.extname(absPath).toLowerCase();
    const raw = await fs.readFile(absPath).catch(() => null);
    if (!raw || !raw.length) continue;
    const text = ext === ".dat" ? raw.toString("base64") : raw.toString("utf8");
    const stemKey = absPath.slice(0, absPath.length - path.extname(absPath).length).toLowerCase();
    const arr = metadataByStem.get(stemKey) || [];
    arr.push({ path: absPath, displayPath, text, ext });
    metadataByStem.set(stemKey, arr);
  }

  const candidates = [];
  for (const fileInfo of files) {
    const absPath = String(fileInfo?.absPath || "");
    const displayPath = String(fileInfo?.displayPath || absPath);
    if (isWithinArchive(absPath, rootDir, archiveDirName)) continue;
    if (!isFtpImageFile(absPath)) continue;
    const stat = await fs.stat(absPath).catch(() => null);
    if (!stat || !stat.isFile() || stat.size <= 0) continue;
    const stemKey = absPath.slice(0, absPath.length - path.extname(absPath).length).toLowerCase();
    const metadata = metadataByStem.get(stemKey) || [];
    candidates.push({
      absPath,
      displayPath,
      relPath: path.relative(rootDir, absPath).split(path.sep).join("/"),
      displayRelPath: path.relative(rootDir, displayPath).split(path.sep).join("/"),
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      metadataPaths: metadata.map((item) => item.path),
      metadataDisplayPaths: metadata.map((item) => item.displayPath || item.path),
      metadataTexts: metadata.map((item) => item.text),
      metadataExts: metadata.map((item) => item.ext || path.extname(item.path || "").toLowerCase())
    });
  }
  return candidates;
}

async function main() {
  const rootDir = String(workerData?.rootDir || "");
  const archiveDirName = String(workerData?.archiveDirName || "_ingested");
  if (!rootDir) throw new Error("Missing FTP root directory");
  const candidates = await collectCandidates(rootDir, archiveDirName);
  parentPort?.postMessage({ ok: true, candidates });
}

main().catch((err) => {
  parentPort?.postMessage({ ok: false, error: err?.message || String(err) });
  process.exitCode = 1;
});
