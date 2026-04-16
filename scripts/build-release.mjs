import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import JavaScriptObfuscator from "javascript-obfuscator";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const releaseDir = path.join(rootDir, "release");

const rootJsFiles = [
  "server.js",
  "ftp-ingest-worker.js",
  "isapi-event-worker.js",
  "onvif-discovery.js",
  "plate-image-worker.js"
];

const publicJsFiles = ["app.js", "login.js"];
const publicStaticFiles = ["index.html", "login.html", "style.css"];
const rootStaticFiles = ["install.sh", "manage.sh", "README.md", "package-lock.json"];

const nodeObfuscationOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.2,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: "hexadecimal",
  ignoreImports: true,
  renameGlobals: false,
  renameProperties: false,
  selfDefending: false,
  simplify: true,
  sourceMap: false,
  splitStrings: true,
  splitStringsChunkLength: 8,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayEncoding: ["base64"],
  stringArrayThreshold: 0.75,
  target: "node",
  transformObjectKeys: true,
  unicodeEscapeSequence: false
};

const browserObfuscationOptions = {
  ...nodeObfuscationOptions,
  target: "browser"
};

async function resetReleaseDir() {
  await fs.rm(releaseDir, { recursive: true, force: true });
  await fs.mkdir(releaseDir, { recursive: true });
  await fs.mkdir(path.join(releaseDir, "public"), { recursive: true });
}

async function copyFile(src, dest) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

async function obfuscateFile(src, dest, options) {
  const code = await fs.readFile(src, "utf8");
  const result = JavaScriptObfuscator.obfuscate(code, options);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, result.getObfuscatedCode(), "utf8");
}

function buildReleasePackageJson(sourcePkg) {
  return {
    name: sourcePkg.name,
    version: sourcePkg.version,
    private: true,
    type: sourcePkg.type,
    scripts: {
      start: "node server.js",
      setup: "bash ./install.sh"
    },
    dependencies: {
      ...sourcePkg.dependencies
    }
  };
}

async function main() {
  await resetReleaseDir();

  for (const file of rootJsFiles) {
    await obfuscateFile(path.join(rootDir, file), path.join(releaseDir, file), nodeObfuscationOptions);
  }

  for (const file of publicJsFiles) {
    await obfuscateFile(
      path.join(rootDir, "public", file),
      path.join(releaseDir, "public", file),
      browserObfuscationOptions
    );
  }

  for (const file of publicStaticFiles) {
    await copyFile(path.join(rootDir, "public", file), path.join(releaseDir, "public", file));
  }

  for (const file of rootStaticFiles) {
    await copyFile(path.join(rootDir, file), path.join(releaseDir, file));
  }

  const sourcePkg = JSON.parse(await fs.readFile(path.join(rootDir, "package.json"), "utf8"));
  const releasePkg = buildReleasePackageJson(sourcePkg);
  await fs.writeFile(path.join(releaseDir, "package.json"), `${JSON.stringify(releasePkg, null, 2)}\n`, "utf8");
}

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exitCode = 1;
});
