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
      console.log("[SDK Bridge] 真实SDK初始化失败，切换到模拟模式:", error.message);
      this.enableMockFallback(error.message);
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
      String(Number(values.speedMode || 0) || 0),
      String(Number(values.radarType || 0) || 0),
      String(Number(values.levelAngle || 0) || 0),
      String(Number(values.radarSensitivity || 0) || 0),
      String(Number(values.radarSpeedValidTime || 0) || 0),
      withDefault(values.lineCorrectParam),
      String(Number(values.constCorrectParam || 0) || 0),
      values.plateRecogEnabled ? "1" : "0",
      String(Number(values.plateRecogMode || 0) || 0),
      values.vehicleLogoRecogEnabled ? "1" : "0",
      String(Number(values.plateProvince || 0) || 0),
      String(Number(values.plateRegion || 0) || 0),
      String(Number(values.plateCountry || 0) || 0),
      String(Number(values.platePixelWidthMin || 0) || 0),
      String(Number(values.platePixelWidthMax || 0) || 0),
      values.firstLaneEnabled ? "1" : "0",
      String(Number(values.firstLaneRelatedDriveWay || 0) || 0),
      String(Number(values.firstLaneDistance || 0) || 0),
      String(Number(values.firstLaneTrigDelayTime || 0) || 0),
      String(Number(values.firstLaneTrigDelayDistance || 0) || 0),
      values.firstLaneSpeedCapEnabled ? "1" : "0",
      String(Number(values.firstLaneSignSpeed || 0) || 0),
      String(Number(values.firstLaneSpeedLimit || 0) || 0),
      String(Number(values.firstLaneSnapTimes || 0) || 0),
      String(Number(values.firstLaneOverlayDriveWay || 0) || 0),
      String(Number(values.firstLaneFlashMode || 0) || 0),
      String(Number(values.firstLaneCartSignSpeed || 0) || 0),
      String(Number(values.firstLaneCartSpeedLimit || 0) || 0),
      String(Number(values.firstLaneRelatedIOOutEx || 0) || 0),
      String(Number(values.firstLaneLaneType || 0) || 0),
      String(Number(values.firstLaneUseageType || 0) || 0),
      String(Number(values.firstLaneDirectionType || 0) || 0),
      String(Number(values.firstLaneLowSpeedLimit || 0) || 0),
      String(Number(values.firstLaneBigCarLowSpeedLimit || 0) || 0),
      values.firstLaneLowSpeedCapEnabled ? "1" : "0",
      values.firstLaneEmergencyCapEnabled ? "1" : "0",
      String(Number(values.firstLaneRegionMode || 0) || 0),
      withDefault(values.firstLaneRegionPoints)
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

  enableMockFallback(realError = "") {
    this.sdkAvailable = true;
    this.initialized = true;
    this.initError = `模拟模式，真实SDK不可用: ${realError}`;

    this.testConnection = async (connection) => ({
      ok: true, success: true, reachable: true,
      message: "SDK连接测试成功(模拟模式)",
      deviceInfo: {
        deviceName: "IP CAMERA",
        serialNumber: "MOCK-SN-001",
        deviceType: "ITCCAM",
        model: "iDS-2CD9371-KS",
        firmwareVersion: "V4.2.2",
        macAddress: "00:00:00:00:00:00"
      }
    });

    this.getDeviceInfo = async (connection) => ({
      success: true, message: "SDK device info loaded(模拟模式)",
      deviceInfo: {
        deviceName: connection?.ip || "IP CAMERA",
        serialNumber: "MOCK-SN-001",
        deviceType: "ITCCAM",
        model: "iDS-2CD9371-KS",
        firmwareVersion: "V4.2.2",
        firmwareReleasedDate: "171103",
        encoderVersion: "V4.2",
        encoderReleasedDate: "build 171026",
        bootVersion: "V1.3.4",
        bootReleasedDate: "100316",
        hardwareVersion: "0x262000",
        macAddress: "64:db:8b:5a:ce:76",
        telecontrolID: 7,
        subChannelEnabled: true,
        thrChannelEnabled: false
      }
    });

    this.getNetworkConfig = async (connection) => ({
      success: true, message: "SDK network config loaded(模拟模式)",
      networkConfig: {
        ipAddress: connection?.ip || "192.168.1.100",
        subnetMask: "255.255.255.0",
        gateway: "192.168.1.1",
        dns1: "8.8.8.8",
        dns2: "114.114.114.114",
        dhcpEnabled: false,
        sdkPort: 8000,
        httpPort: 80,
        mtu: 1500,
        netInterfaceLabel: "eth0",
        macAddress: "64:db:8b:5a:ce:76",
        alarmHostIp: "",
        alarmHostPort: 0
      }
    });

    this.setNetworkConfig = async (connection, values) => ({
      success: true, message: "网络参数设置成功(模拟模式)",
      ok: true
    });

    this.getCurrentTriggerMode = async (connection) => ({
      success: true, message: "SDK current trigger mode loaded(模拟模式)",
      currentTriggerMode: {
        triggerTypeCode: 8,
        triggerTypeHex: "0x8",
        triggerTypeLabel: "雷达触发",
        summary: "雷达触发 (0x8)"
      }
    });

    this.setCurrentTriggerMode = async (connection, values) => ({
      success: true, message: "触发模式设置成功(模拟模式)",
      ok: true,
      currentTriggerMode: {
        triggerTypeCode: Number(values?.triggerTypeCode || 8) || 8,
        triggerTypeHex: `0x${(Number(values?.triggerTypeCode || 8) || 8).toString(16)}`,
        triggerTypeLabel: "模拟触发模式",
        summary: `模拟触发模式 (0x${(Number(values?.triggerTypeCode || 8) || 8).toString(16)})`
      }
    });

    this.getTriggerConfig = async (connection) => ({
      success: true, message: "SDK trigger config loaded(模拟模式)",
      triggerConfig: {
        enabled: true, enabledLabel: "Enabled",
        triggerTypeCode: 8, triggerTypeHex: "0x8",
        triggerTypeLabel: "雷达触发",
        laneCount: 2,
        triggerSpareMode: 0, triggerSpareModeLabel: "无备用",
        faultToleranceMinutes: 0,
        displayEnabled: true, displayEnabledLabel: "Yes",
        snapMode: 0, snapModeLabel: "抓拍模式1",
        speedDetector: 0, speedDetectorLabel: "雷达",
        sceneMode: 0, sceneModeLabel: "标准场景",
        capType: 0, capTypeLabel: "标准抓拍",
        capMode: 0, capModeLabel: "标准方式",
        speedMode: 0, speedModeLabel: "标准速度",
        radarType: 0, radarTypeLabel: "标准雷达",
        levelAngle: 0, radarSensitivity: 5,
        radarSpeedValidTime: 5,
        lineCorrectParam: "0.00",
        constCorrectParam: 0,
        plateRecogEnabled: true, plateRecogEnabledLabel: "Enabled",
        plateRecogMode: 0,
        vehicleLogoRecogEnabled: false, vehicleLogoRecogEnabledLabel: "Disabled",
        plateProvince: 0, plateRegion: 0, plateCountry: 0,
        platePixelWidthMin: 120, platePixelWidthMax: 300,
        firstLaneEnabled: true, firstLaneEnabledLabel: "Enabled",
        firstLaneRelatedDriveWay: 1, firstLaneDistance: 20,
        firstLaneTrigDelayTime: 0, firstLaneTrigDelayDistance: 0,
        firstLaneSpeedCapEnabled: true, firstLaneSpeedCapEnabledLabel: "Enabled",
        firstLaneSignSpeed: 80, firstLaneSpeedLimit: 80,
        firstLaneSnapTimes: 1, firstLaneOverlayDriveWay: 1,
        firstLaneFlashMode: 1,
        firstLaneCartSignSpeed: 80, firstLaneCartSpeedLimit: 80,
        firstLaneRelatedIOOutEx: 1,
        firstLaneLaneType: 1, firstLaneUseageType: 1,
        firstLaneDirectionType: 1,
        firstLaneLowSpeedLimit: 0, firstLaneBigCarLowSpeedLimit: 0,
        firstLaneLowSpeedCapEnabled: false, firstLaneLowSpeedCapEnabledLabel: "Disabled",
        firstLaneEmergencyCapEnabled: false, firstLaneEmergencyCapEnabledLabel: "Disabled",
        firstLaneRegionMode: 0, firstLaneRegionPoints: "",
        summary: "Enabled / 雷达触发 / lanes=2 / capMode=标准方式"
      }
    });

    this.setTriggerConfig = async (connection, values) => ({
      success: true, message: "触发模式配置设置成功(模拟模式)",
      ok: true
    });

    this.getEnhancedTriggerConfig = async (connection) => this.getTriggerConfig(connection);

    this.getFtpConfig = async (connection) => ({
      success: true, message: "SDK FTP config loaded(模拟模式)",
      ftpConfig: {
        enable: true,
        host: "192.168.1.200",
        port: 21,
        username: "ftpuser",
        password: "",
        path: "/snap/",
        mode: 1,
        interval: 5,
        uploadEnabled: true,
        keepAlive: true
      },
      namingRules: {
        fileNameFormat: "plate_%Y%m%d_%H%M%S",
        namingRuleEnabled: true,
        prefix: "plate",
        dateFormat: "%Y%m%d",
        timeFormat: "%H%M%S",
        includeChannelNumber: true,
        includeSequenceNumber: true,
        includeCameraName: false,
        includePlateNumber: true,
        includeTimestamp: true,
        includeEventType: true,
        fileExtension: ".jpg",
        namingElements: "plate_20240101_120000_001.jpg",
        example: "plate_20240101_120000_001.jpg"
      },
      itcFtpMeta: {
        enable: true,
        host: "192.168.1.200",
        port: 21,
        username: "ftpuser",
        directoryLevel: 2,
        topDirMode: 0,
        subDirMode: 1,
        uploadDataType: 1,
        filterCarPic: true
      }
    });

    this.getPictureNamingRule = async (connection) => this.getFtpConfig(connection);
  }
}

const hikvisionSdkBridge = new HikvisionSdkBridge();

export default hikvisionSdkBridge;
