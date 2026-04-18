import fs from "node:fs/promises";
import path from "node:path";
import { parentPort, workerData } from "node:worker_threads";

async function main() {
  const absPath = String(workerData?.absPath || "").trim();
  const imageBuffer = workerData?.imageBuffer;
  if (!absPath || !Buffer.isBuffer(imageBuffer)) {
    throw new Error("invalid plate image worker input");
  }
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, imageBuffer);
}

main()
  .then(() => {
    parentPort?.postMessage({ ok: true });
  })
  .catch((err) => {
    parentPort?.postMessage({
      ok: false,
      error: String(err?.message || err || "unknown error")
    });
  });
