import fs from "node:fs/promises";
import path from "node:path";
import { parentPort, workerData } from "node:worker_threads";

function isFtpImageFile(filePath) {
  return /\.(jpe?g|png|bmp|webp)$/i.test(String(filePath || ""));
}

function isFtpMetadataFile(filePath) {
  return /\.(json|xml|txt)$/i.test(String(filePath || ""));
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

function isWithinArchive(absPath, rootDir, archiveDirName) {
  const rel = path.relative(rootDir, absPath);
  return !!rel && !rel.startsWith("..") && rel.split(path.sep).includes(archiveDirName);
}

async function collectCandidates(rootDir, archiveDirName) {
  const files = await listFilesRecursive(rootDir);
  const metadataByStem = new Map();
  for (const absPath of files) {
    if (isWithinArchive(absPath, rootDir, archiveDirName)) continue;
    if (!isFtpMetadataFile(absPath)) continue;
    const text = await fs.readFile(absPath, "utf8").catch(() => "");
    const stemKey = absPath.slice(0, absPath.length - path.extname(absPath).length).toLowerCase();
    const arr = metadataByStem.get(stemKey) || [];
    arr.push({ path: absPath, text });
    metadataByStem.set(stemKey, arr);
  }

  const candidates = [];
  for (const absPath of files) {
    if (isWithinArchive(absPath, rootDir, archiveDirName)) continue;
    if (!isFtpImageFile(absPath)) continue;
    const stat = await fs.stat(absPath).catch(() => null);
    if (!stat || !stat.isFile() || stat.size <= 0) continue;
    const stemKey = absPath.slice(0, absPath.length - path.extname(absPath).length).toLowerCase();
    const metadata = metadataByStem.get(stemKey) || [];
    candidates.push({
      absPath,
      relPath: path.relative(rootDir, absPath).split(path.sep).join("/"),
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      metadataPaths: metadata.map((item) => item.path),
      metadataTexts: metadata.map((item) => item.text)
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
