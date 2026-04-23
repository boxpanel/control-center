import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sdkDir = path.resolve(__dirname, "..");
const projectRoot = path.resolve(sdkDir, "..");
const javaSourceDir = path.join(sdkDir, "java");
const javaBuildDir = path.join(sdkDir, "build", "java");
const JAVA_TOOL_CLASS = "HikvisionTrafficConfigTool";

function execFileAsync(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function getJavaClassPathSeparator() {
  return process.platform === "win32" ? ";" : ":";
}

function withDefault(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

class HikvisionSdkBridge {
  constructor() {
    this.initialized = false;
    this.sdkAvailable = false;
    this.initError = "";
    this.sdkRoot = "";
    this.sdkLibDir = "";
    this.sdkComDir = "";
    this.jnaJar = "";
    this.javaBin = "java";
    this.javacBin = "javac";
  }

  async initialize() {
    if (this.initialized) {
      return this;
    }

    this.initialized = true;

    if (process.platform !== "linux") {
      this.sdkAvailable = false;
      this.initError = `SDK bridge is only available on Linux, current platform is ${process.platform}`;
      return this;
    }

    try {
      const sdkLayout = await this.findSdkLayout();
      const jnaJar = await this.findJnaJar(sdkLayout.sdkRoot);

      await fs.mkdir(javaBuildDir, { recursive: true });

      this.sdkRoot = sdkLayout.sdkRoot;
      this.sdkLibDir = sdkLayout.sdkLibDir;
      this.sdkComDir = sdkLayout.sdkComDir;
      this.jnaJar = jnaJar;
      this.sdkAvailable = true;
      this.initError = "";
    } catch (error) {
      this.sdkAvailable = false;
      this.initError = error?.message || String(error);
    }

    return this;
  }

  getLegacySdkLayout(candidate) {
    const sdkLibDir = path.join(candidate, "MakeAll");
    const sdkComDir = path.join(sdkLibDir, "HCNetSDKCom");
    if (existsSync(path.join(sdkLibDir, "libhcnetsdk.so"))) {
      return { sdkRoot: candidate, sdkLibDir, sdkComDir };
    }
    return null;
  }

  getFlatSdkLayout(candidate) {
    const sdkLibDir = candidate;
    const sdkComDir = path.join(candidate, "HCNetSDKCom");
    if (existsSync(path.join(sdkLibDir, "libhcnetsdk.so"))) {
      return { sdkRoot: candidate, sdkLibDir, sdkComDir };
    }
    return null;
  }

  async findSdkLayout() {
    const directCandidates = [
      path.join(projectRoot, "sdk", "arm64"),
      path.join(projectRoot, "HCNetSDKV6.1.11.5"),
      path.join(projectRoot, "HCNetSDKV6.1.11.5_build20251204_ArmLinux64_ZH"),
      path.join(projectRoot, "temp_sdk", "HCNetSDKV6.1.11.5"),
      path.join(projectRoot, "temp_sdk", "HCNetSDKV6.1.11.5_build20251204_ArmLinux64_ZH")
    ];

    for (const candidate of directCandidates) {
      const flatLayout = this.getFlatSdkLayout(candidate);
      if (flatLayout) return flatLayout;
      const legacyLayout = this.getLegacySdkLayout(candidate);
      if (legacyLayout) return legacyLayout;
    }

    const tempSdkDir = path.join(projectRoot, "temp_sdk");
    if (existsSync(tempSdkDir)) {
      const entries = await fs.readdir(tempSdkDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const candidate = path.join(tempSdkDir, entry.name);
        const flatLayout = this.getFlatSdkLayout(candidate);
        if (flatLayout) return flatLayout;
        const legacyLayout = this.getLegacySdkLayout(candidate);
        if (legacyLayout) return legacyLayout;
      }
    }

    throw new Error("HCNetSDK root not found. Expected sdk/arm64/libhcnetsdk.so or a MakeAll/libhcnetsdk.so layout.");
  }

  async findJnaJar(sdkRoot) {
    const directCandidates = [
      process.env.JNA_JAR || "",
      path.join(projectRoot, "sdk", "java", "jna.jar"),
      path.join(projectRoot, "sdk", "java", "jna-4.5.2_1.jar"),
      path.join(sdkRoot, "demo", "Java绀轰緥", "Java_ClientDemo", "ClientDemo", "lib", "jna-4.5.2_1.jar"),
      path.join(sdkRoot, "demo", "Java绀轰緥", "Java_AlarmDemo", "AlarmDemo", "lib", "jna-4.5.2_1.jar"),
      "/usr/share/java/jna.jar",
      "/usr/share/java/jna-5.13.0.jar",
      "/usr/share/java/jna-5.12.1.jar"
    ];

    for (const candidate of directCandidates) {
      if (candidate && existsSync(candidate)) return candidate;
    }

    throw new Error("JNA jar not found. Install libjna-java or set JNA_JAR.");
  }

  getDetailedStatus() {
    return {
      sdkAvailable: this.sdkAvailable,
      initialized: this.initialized,
      platform: process.platform,
      arch: process.arch,
      sdkRoot: this.sdkRoot,
      sdkLibDir: this.sdkLibDir,
      sdkComDir: this.sdkComDir,
      jnaJar: this.jnaJar,
      javaBuildDir,
      javaSourceDir,
      initError: this.initError || ""
    };
  }

  async ensureReady() {
    await this.initialize();
    if (!this.sdkAvailable) {
      throw new Error(this.initError || "Hikvision SDK is not available");
    }
  }

  async compileJavaTool() {
    await this.ensureReady();

    const sourcePath = path.join(javaSourceDir, `${JAVA_TOOL_CLASS}.java`);
    const classPath = path.join(javaBuildDir, `${JAVA_TOOL_CLASS}.class`);
    const sourceStat = await fs.stat(sourcePath);
    const classExists = await pathExists(classPath);

    if (classExists) {
      const classStat = await fs.stat(classPath);
      if (classStat.mtimeMs >= sourceStat.mtimeMs) {
        return;
      }
    }

    const classPathArg = `${this.jnaJar}${getJavaClassPathSeparator()}${javaSourceDir}`;
    await execFileAsync(this.javacBin, [
      "-encoding",
      "UTF-8",
      "-cp",
      classPathArg,
      "-d",
      javaBuildDir,
      sourcePath
    ], {
      cwd: javaSourceDir,
      windowsHide: true
    });
  }

  async runJavaTool(action, connection = {}, extraArgs = []) {
    await this.compileJavaTool();

    const classPathArg = `${javaBuildDir}${getJavaClassPathSeparator()}${this.jnaJar}`;
    const env = {
      ...process.env,
      HIKVISION_SDK_LIB: this.sdkLibDir,
      LD_LIBRARY_PATH: [this.sdkLibDir, this.sdkComDir, process.env.LD_LIBRARY_PATH || ""]
        .filter(Boolean)
        .join(path.delimiter)
    };

    const args = [
      "-cp",
      classPathArg,
      JAVA_TOOL_CLASS,
      action,
      withDefault(connection.ip),
      String(Number(connection.port || 8000) || 8000),
      withDefault(connection.username, "admin"),
      withDefault(connection.password),
      ...extraArgs.map((value) => String(value ?? ""))
    ];

    const { stdout } = await execFileAsync(this.javaBin, args, {
      cwd: javaBuildDir,
      env,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    });

    const text = String(stdout || "").trim();
    if (!text) {
      throw new Error(`SDK tool returned empty output for action "${action}"`);
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`SDK tool returned invalid JSON: ${text}`);
    }

    if (parsed && parsed.success === false) {
      throw new Error(parsed.error || parsed.message || `SDK action "${action}" failed`);
    }

    return parsed;
  }

  async testConnection(connection) {
    const result = await this.runJavaTool("device-info", connection);
    return {
      ok: true,
      success: true,
      reachable: true,
      message: result?.message || "SDK connection successful",
      deviceInfo: result?.deviceInfo || null
    };
  }

  async getDeviceInfo(connection) {
    return this.runJavaTool("device-info", connection);
  }

  async getNetworkConfig(connection) {
    return this.runJavaTool("network-config", connection);
  }

  async setNetworkConfig(connection, values = {}) {
    return this.runJavaTool("set-network-config", connection, [
      withDefault(values.ipAddress),
      withDefault(values.subnetMask),
      withDefault(values.gateway),
      withDefault(values.dns1),
      withDefault(values.dns2),
      values.dhcpEnabled ? "1" : "0",
      String(Number(values.sdkPort || 0) || 0),
      String(Number(values.httpPort || 0) || 0),
      String(Number(values.mtu || 0) || 0),
      withDefault(values.alarmHostIp),
      String(Number(values.alarmHostPort || 0) || 0)
    ]);
  }

  async getCurrentTriggerMode(connection) {
    return this.runJavaTool("current-trigger-mode", connection);
  }

  async setCurrentTriggerMode(connection, values = {}) {
    return this.runJavaTool("set-current-trigger-mode", connection, [
      String(Number(values.triggerTypeCode || 0) || 0)
    ]);
  }

  async getTriggerConfig(connection) {
    return this.runJavaTool("trigger-config", connection);
  }

  async setTriggerConfig(connection, values = {}) {
    return this.runJavaTool("set-trigger-config", connection, [
      values.enabled ? "1" : "0",
      String(Number(values.triggerTypeCode || 0) || 0),
      String(Number(values.laneCount || 0) || 0),
      String(Number(values.triggerSpareMode || 0) || 0),
      String(Number(values.faultToleranceMinutes || 0) || 0),
      values.displayEnabled ? "1" : "0",
      String(Number(values.snapMode || 0) || 0),
      String(Number(values.speedDetector || 0) || 0),
      String(Number(values.sceneMode || 0) || 0),
      String(Number(values.capType || 0) || 0),
      String(Number(values.capMode || 0) || 0),
      String(Number(values.speedMode || 0) || 0)
    ]);
  }

  async getEnhancedTriggerConfig(connection) {
    return this.getTriggerConfig(connection);
  }

  async getFtpConfig(connection) {
    return this.runJavaTool("itc-ftp-config", connection);
  }

  async getPictureNamingRule(connection) {
    return this.runJavaTool("itc-ftp-config", connection);
  }
}

const hikvisionSdkBridge = new HikvisionSdkBridge();

export default hikvisionSdkBridge;
