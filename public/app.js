function updatePageTitle(systemName) {
  const baseTitle = "管理平台";
  const titleElement = document.querySelector("title");
  const headerTitleElement = document.querySelector(".app-header-title");
  
  if (systemName && systemName.trim()) {
    const fullTitle = `${baseTitle}-${systemName.trim()}`;
    if (titleElement) titleElement.textContent = fullTitle;
    if (headerTitleElement) headerTitleElement.textContent = fullTitle;
  } else {
    if (titleElement) titleElement.textContent = baseTitle;
    if (headerTitleElement) headerTitleElement.textContent = baseTitle;
  }
}

// 显示加载动画
function showLoading(message = "正在处理，请稍候...") {
  if (els.loadingOverlay) {
    const textElement = els.loadingOverlay.querySelector(".loading-text");
    if (textElement) {
      textElement.textContent = message;
    }
    els.loadingOverlay.style.display = "flex";
  }
}

// 隐藏加载动画
function hideLoading() {
  if (els.loadingOverlay) {
    els.loadingOverlay.style.display = "none";
  }
}

// 显示重启确认弹窗
function showRestartConfirm() {
  return new Promise((resolve) => {
    if (!els.restartConfirmOverlay || !els.restartConfirmCancel || !els.restartConfirmOk) {
      resolve(false);
      return;
    }
    
    // 显示弹窗
    els.restartConfirmOverlay.style.display = "flex";
    
    // 保存原始按钮文本
    const originalOkText = els.restartConfirmOk.textContent;
    
    // 设置确定按钮为默认状态
    els.restartConfirmOk.disabled = false;
    els.restartConfirmOk.textContent = originalOkText;
    
    // 取消按钮点击事件
    const onCancel = () => {
      cleanup();
      resolve(false);
    };
    
    // 确定按钮点击事件
    const onOk = () => {
      cleanup();
      resolve(true);
    };
    
    // 清理函数
    const cleanup = () => {
      els.restartConfirmOverlay.style.display = "none";
      els.restartConfirmCancel.removeEventListener("click", onCancel);
      els.restartConfirmOk.removeEventListener("click", onOk);
    };
    
    // 添加事件监听器
    els.restartConfirmCancel.addEventListener("click", onCancel);
    els.restartConfirmOk.addEventListener("click", onOk);
  });
}

// 检查服务器是否可用
async function checkServerAvailable() {
  try {
    // 创建AbortController用于超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 增加到5秒超时
    
    // 尝试访问一个简单的API端点
    const response = await fetch("/api/status", {
      method: "GET",
      signal: controller.signal,
      // 添加更多选项以提高成功率
      mode: "cors",
      cache: "no-cache",
      credentials: "same-origin"
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      // 尝试解析响应，确保服务器完全正常
      const data = await response.json();
      return data && data.ok === true;
    }
    return false;
  } catch (error) {
    // 记录不同类型的错误
    if (error.name === "AbortError") {
      console.log("服务器检查超时（5秒）");
    } else if (error.name === "TypeError" && error.message.includes("Failed to fetch")) {
      console.log("网络连接失败，服务器可能正在重启");
    } else {
      console.log("服务器检查失败:", error.name, error.message);
    }
    return false;
  }
}

// 轮询检查服务器是否重启完成
function startServerPolling() {
  let pollCount = 0;
  const maxPolls = 10; // 最多轮询10次
  const pollInterval = 60000; // 每60秒检查一次
  
  const poll = async () => {
    pollCount++;
    
    if (pollCount > maxPolls) {
      // 超过最大轮询次数，停止轮询
      console.log("轮询超时（10次，共10分钟），服务器可能未正常启动");
      showLoading("设备重启超时（已等待10分钟），请手动刷新页面检查设备状态");
      return;
    }
    
    const elapsedMinutes = pollCount; // 每次60秒，所以次数就是分钟数
    console.log(`轮询检查服务器 (${pollCount}/${maxPolls})，已等待${elapsedMinutes}分钟...`);
    
    const isAvailable = await checkServerAvailable();
    
    if (isAvailable) {
      // 服务器已恢复，刷新页面
      console.log("服务器已恢复，刷新页面...");
      showLoading("设备重启完成，正在刷新页面...");
      
      // 等待2秒让用户看到消息，然后刷新页面
      setTimeout(() => {
        window.location.reload(true); // 强制从服务器重新加载
      }, 2000);
    } else {
      // 服务器仍未恢复，继续轮询
      console.log("服务器尚未恢复，继续等待...");
      
      // 显示等待信息
      showLoading(`设备正在重启... 已等待${elapsedMinutes}分钟`);
      
      // 继续轮询
      setTimeout(poll, pollInterval);
    }
  };
  
  // 开始轮询
  poll();
}

const els = {
  discoverBtn: document.getElementById("discoverBtn"),
  connectBtn: document.getElementById("connectBtn"),
  stopBtn: document.getElementById("stopBtn"),
  clearLogBtn: document.getElementById("clearLogBtn"),
  clearSerialLogBtn: document.getElementById("clearSerialLogBtn"),
  fingerprintBox: document.getElementById("fingerprintBox"),
  navHomeBtn: document.getElementById("navHomeBtn"),
  navNetworkBtn: document.getElementById("navNetworkBtn"),
  navSerialBtn: document.getElementById("navSerialBtn"),
  navSystemBtn: document.getElementById("navSystemBtn"),
  homePage: document.getElementById("homePage"),
  networkPage: document.getElementById("networkPage"),
  serialPage: document.getElementById("serialPage"),
  systemPage: document.getElementById("systemPage"),
  dashUpdatedAt: document.getElementById("dashUpdatedAt"),
  dashTotal: document.getElementById("dashTotal"),
  dashToday: document.getElementById("dashToday"),
  dashLastHour: document.getElementById("dashLastHour"),
  dashUniqueToday: document.getElementById("dashUniqueToday"),
  dashFiltered: document.getElementById("dashFiltered"),
  dashLatest: document.getElementById("dashLatest"),
  hostInput: document.getElementById("hostInput"),
  portInput: document.getElementById("portInput"),
  userInput: document.getElementById("userInput"),
  passInput: document.getElementById("passInput"),
  deviceProtocolSelect: document.getElementById("deviceProtocolSelect"),
  deviceIdInput: document.getElementById("deviceIdInput"),
  deviceNameInput: document.getElementById("deviceNameInput"),
  saveConnBtn: document.getElementById("saveConnBtn"),
  testIsapiBtn: document.getElementById("testIsapiBtn"),
  isapiDeviceStatus: document.getElementById("isapiDeviceStatus"),
  isapiDeviceSummary: document.getElementById("isapiDeviceSummary"),
  isapiDeviceRaw: document.getElementById("isapiDeviceRaw"),
  refreshDeviceListBtn: document.getElementById("refreshDeviceListBtn"),
  addDeviceBtn: document.getElementById("addDeviceBtn"),
  updateDeviceBtn: document.getElementById("updateDeviceBtn"),
  deleteDeviceBtn: document.getElementById("deleteDeviceBtn"),
  checkDeviceBtn: document.getElementById("checkDeviceBtn"),
  managedDeviceHint: document.getElementById("managedDeviceHint"),
  managedDeviceTableBody: document.getElementById("managedDeviceTableBody"),
  deviceConfigModal: document.getElementById("deviceConfigModal"),
  deviceConfigModalTitle: document.getElementById("deviceConfigModalTitle"),
  deviceConfigModalCloseBtn: document.getElementById("deviceConfigModalCloseBtn"),
  deviceConfigModalCancelBtn: document.getElementById("deviceConfigModalCancelBtn"),
  deviceConfigModalSubmitBtn: document.getElementById("deviceConfigModalSubmitBtn"),
  serialBaudRate: document.getElementById("serialBaudRate"),
  serialBaudRateInput: document.getElementById("serialBaudRateInput"),
  serialFixedBaudRate: document.getElementById("serialFixedBaudRate"),
  serialSendInput: document.getElementById("serialSendInput"),
  serialPortSelect: document.getElementById("serialPortSelect"),
  serialFixedPort: document.getElementById("serialFixedPort"),
  serialSendBtn: document.getElementById("serialSendBtn"),
  serialSaveBtn: document.getElementById("serialSaveBtn"),
  serialStatus: document.getElementById("serialStatus"),
  serialHint: document.getElementById("serialHint"),
  serialSaveHint: document.getElementById("serialSaveHint"),
  serialForwardEnabled: document.getElementById("serialForwardEnabled"),
  plateSelectAll: document.getElementById("plateSelectAll"),
  plateSelectAllBtn: document.getElementById("plateSelectAllBtn"),
  plateSearchInput: document.getElementById("plateSearchInput"),
  plateDateInput: document.getElementById("plateDateInput"),
  plateQueryBtn: document.getElementById("plateQueryBtn"),
  plateDeleteBtn: document.getElementById("plateDeleteBtn"),
  plateDownloadBtn: document.getElementById("plateDownloadBtn"),
  loadingOverlay: document.getElementById("loadingOverlay"),
  plateViewCardsBtn: document.getElementById("plateViewCardsBtn"),
  plateViewTableBtn: document.getElementById("plateViewTableBtn"),
  plateTableWrap: document.getElementById("plateTableWrap"),
  plateTableBody: document.getElementById("plateTableBody"),

  platePageSize: document.getElementById("platePageSize"),
  platePrevPageBtn: document.getElementById("platePrevPageBtn"),
  plateNextPageBtn: document.getElementById("plateNextPageBtn"),
  platePageInfo: document.getElementById("platePageInfo"),
  systemNameInput: document.getElementById("systemNameInput"),
  systemClientMode: document.getElementById("systemClientMode"),
  systemIpMode: document.getElementById("systemIpMode"),
  systemIpInput: document.getElementById("systemIpInput"),
  systemPrefixInput: document.getElementById("systemPrefixInput"),
  systemGatewayInput: document.getElementById("systemGatewayInput"),
  systemIfaceInfo: document.getElementById("systemIfaceInfo"),
  dataCleanupEnabled: document.getElementById("dataCleanupEnabled"),
  dataCleanupDays: document.getElementById("dataCleanupDays"),
  systemNewPassword: document.getElementById("systemNewPassword"),
  systemSaveBtn: document.getElementById("systemSaveBtn"),
  systemRestartBtn: document.getElementById("systemRestartBtn"),
  restartConfirmOverlay: document.getElementById("restartConfirmOverlay"),
  restartConfirmCancel: document.getElementById("restartConfirmCancel"),
  restartConfirmOk: document.getElementById("restartConfirmOk"),
  systemSaveHint: document.getElementById("systemSaveHint"),
  systemPassHint: document.getElementById("systemPassHint"),
  ftpServerEnabled: document.getElementById("ftpServerEnabled"),
  ftpServerPort: document.getElementById("ftpServerPort"),
  ftpServerRootDir: document.getElementById("ftpServerRootDir"),
  ftpServerUser: document.getElementById("ftpServerUser"),
  ftpServerPass: document.getElementById("ftpServerPass"),
  ftpServerSaveBtn: document.getElementById("ftpServerSaveBtn"),
  ftpServerHint: document.getElementById("ftpServerHint"),
  httpIngestUrl: document.getElementById("httpIngestUrl"),
  ftpIngestUrl: document.getElementById("ftpIngestUrl"),
  ftpIngestDir: document.getElementById("ftpIngestDir"),
  log: document.getElementById("log"),
  serialLog: document.getElementById("serialLog"),
  devicePreviewModal: document.getElementById("devicePreviewModal"),
  devicePreviewModalTitle: document.getElementById("devicePreviewModalTitle"),
  devicePreviewModalCloseBtn: document.getElementById("devicePreviewModalCloseBtn"),
  devicePreviewModalStopBtn: document.getElementById("devicePreviewModalStopBtn"),
  previewVideo: document.getElementById("previewVideo"),
  previewSnapshotBtn: document.getElementById("previewSnapshotBtn"),
  previewRtspTransport: document.getElementById("previewRtspTransport"),
  previewProcessMode: document.getElementById("previewProcessMode"),
  previewShowProcessed: document.getElementById("previewShowProcessed")
};

let hlsPlayer = null;
let activeStreamId = "";

const STORAGE_KEY = "onvif:lastConnection";
const SESSION_STREAMING_KEY = "onvif:wasStreaming";
const STREAM_SESSION_KEY = "onvif:lastPreviewSession";
const MANAGED_DEVICES_SHADOW_KEY = "onvif:managedDevicesShadow";
let lastSavedSignature = "";
const rtspByHostPort = new Map();
const rtspPendingByHostPort = new Map();
const rtspErrorByHostPort = new Map();
let hoverHostPortKey = "";
const managedDeviceState = {
  items: [],
  selectedId: ""
};
const deviceConfigModalState = {
  mode: "add"
};

const devicePreviewModalState = {
  isOpen: false,
  currentDevice: null,
  isHikvisionIsapi: false
};
const DEVICE_PROTOCOL_LABELS = {
  "": "请选择",
  gb28181: "国标GB28181（2016/2022）",
  ehome: "国家电网B接口",
  "jt1078-terminal": "交通部JT1078终端设备",
  "jt1078-platform": "交通部JT1078下级平台",
  onvif: "ONVIF 2.0",
  "hikvision-isapi": "海康ISAPI",
  "hikvision-private": "海康私有协议",
  "dahua-http": "大华HTTP",
  "dahua-private": "大华私有协议",
  "grid-platform": "网力平台接入（PVG6.x/PVG10.x）",
  "custom-rtmp-rtsp": "自定义设备（RTMP/RTSP）"
};

function getDeviceProtocolLabel(protocol) {
  const key = String(protocol || "").trim();
  return DEVICE_PROTOCOL_LABELS[key] || key || "请选择";
}

function newClientManagedDeviceId() {
  return `local-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function readManagedDevicesShadow() {
  try {
    const raw = localStorage.getItem(MANAGED_DEVICES_SHADOW_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readLastPreviewSession() {
  try {
    const raw = localStorage.getItem(STREAM_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const streamId = String(parsed.streamId || "").trim();
    const playUrl = String(parsed.playUrl || "").trim();
    const host = String(parsed.host || "").trim();
    if (!streamId || !playUrl || !host) return null;
    return {
      streamId,
      playUrl,
      host,
      port: Number(parsed.port || 80) || 80,
      username: String(parsed.username || ""),
      password: String(parsed.password || ""),
      savedAt: Number(parsed.savedAt || 0) || 0
    };
  } catch {
    return null;
  }
}

function writeLastPreviewSession(session) {
  try {
    if (!session || typeof session !== "object") {
      localStorage.removeItem(STREAM_SESSION_KEY);
      return;
    }
    localStorage.setItem(
      STREAM_SESSION_KEY,
      JSON.stringify({
        streamId: String(session.streamId || "").trim(),
        playUrl: String(session.playUrl || "").trim(),
        host: String(session.host || "").trim(),
        port: Number(session.port || 80) || 80,
        username: String(session.username || ""),
        password: String(session.password || ""),
        savedAt: Number(session.savedAt || Date.now()) || Date.now()
      })
    );
  } catch {}
}

function writeManagedDevicesShadow(items) {
  try {
    localStorage.setItem(MANAGED_DEVICES_SHADOW_KEY, JSON.stringify(Array.isArray(items) ? items : []));
  } catch {}
}

function upsertManagedDeviceShadow(device) {
  const items = readManagedDevicesShadow();
  const next = items.filter((item) => String(item?.id || "") !== String(device?.id || ""));
  next.unshift(device);
  writeManagedDevicesShadow(next);
}

function removeManagedDeviceShadow(id) {
  const next = readManagedDevicesShadow().filter((item) => String(item?.id || "") !== String(id || ""));
  writeManagedDevicesShadow(next);
}

function mergeManagedDeviceItems(primaryItems, shadowItems) {
  const merged = [];
  const seen = new Set();
  const pushItem = (item) => {
    if (!item || typeof item !== "object") return;
    const id = String(item.id || "").trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    merged.push(item);
  };
  (Array.isArray(primaryItems) ? primaryItems : []).forEach(pushItem);
  (Array.isArray(shadowItems) ? shadowItems : []).forEach(pushItem);
  return merged;
}

function getOnlineManagedDeviceCount() {
  return managedDeviceState.items.filter((item) => String(item?.onlineState || "").trim() === "online").length;
}

function supportsIsapiActiveTest(protocol) {
  return String(protocol || "").trim() === "hikvision-isapi";
}

const tooltip = (() => {
  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.left = "0";
  el.style.top = "0";
  el.style.maxWidth = "520px";
  el.style.padding = "8px 10px";
  el.style.borderRadius = "8px";
  el.style.background = "rgba(0,0,0,0.82)";
  el.style.color = "#fff";
  el.style.fontSize = "12px";
  el.style.lineHeight = "1.35";
  el.style.whiteSpace = "pre-wrap";
  el.style.pointerEvents = "none";
  el.style.zIndex = "9999";
  el.style.display = "none";
  document.body.appendChild(el);
  const show = (text, x, y) => {
    if (!text) return hide();
    el.textContent = text;
    el.style.display = "block";
    const pad = 12;
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    const rect = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(vw - rect.width - 8, x + pad));
    const top = Math.max(8, Math.min(vh - rect.height - 8, y + pad));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  };
  const hide = () => {
    el.style.display = "none";
  };
  return { show, hide };
})();

function now() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function appendLog(el, text) {
  if (!(el instanceof HTMLElement)) return;
  el.textContent += `[${now()}] ${text}\n`;
  el.scrollTop = el.scrollHeight;
}

function logLine(text) {
  appendLog(els.log, text);
}

function setManagedDeviceHint(text, isError = false) {
  if (!els.managedDeviceHint) return;
  els.managedDeviceHint.textContent = String(text || "");
  els.managedDeviceHint.style.color = isError ? "#b91c1c" : "#6b7280";
}

function setIsapiDeviceStatus(text, isError = false) {
  if (!els.isapiDeviceStatus) return;
  els.isapiDeviceStatus.textContent = String(text || "");
  els.isapiDeviceStatus.style.color = isError ? "#b91c1c" : "#6b7280";
}

function renderIsapiDeviceSummary(summary, requestUrl = "") {
  if (els.isapiDeviceSummary) {
    const parts = [];
    if (summary?.manufacturer) parts.push(`厂商：${summary.manufacturer}`);
    if (summary?.model) parts.push(`型号：${summary.model}`);
    if (summary?.deviceName) parts.push(`设备名：${summary.deviceName}`);
    if (summary?.serialNumber) parts.push(`序列号：${summary.serialNumber}`);
    if (summary?.firmwareVersion) parts.push(`固件：${summary.firmwareVersion}`);
    if (summary?.ipv4Address) parts.push(`设备IP：${summary.ipv4Address}`);
    if (requestUrl) parts.push(`URL：${requestUrl}`);
    els.isapiDeviceSummary.textContent = parts.join(" | ");
  }
}

function setIsapiDeviceRaw(text) {
  if (!els.isapiDeviceRaw) return;
  els.isapiDeviceRaw.textContent = String(text || "");
}

function logSerialLine(text) {
  appendLog(els.serialLog, text);
}

const mainViewState = { view: "home" };

function setMainView(view) {
  const v = view === "serial" ? "serial" : view === "network" ? "network" : view === "system" ? "system" : "home";
  const prev = mainViewState.view;
  mainViewState.view = v;
  if (prev === "network" && v !== "network" && activeStreamId) {
    void stopStream();
  }
  if (els.homePage) els.homePage.classList.toggle("view-hidden", v !== "home");
  if (els.networkPage) els.networkPage.classList.toggle("view-hidden", v !== "network");
  if (els.serialPage) els.serialPage.classList.toggle("view-hidden", v !== "serial");
  if (els.systemPage) els.systemPage.classList.toggle("view-hidden", v !== "system");
  if (els.navHomeBtn) {
    els.navHomeBtn.classList.toggle("active", v === "home");
    if (v === "home") els.navHomeBtn.setAttribute("aria-current", "page");
    else els.navHomeBtn.removeAttribute("aria-current");
  }
  if (els.navNetworkBtn) {
    els.navNetworkBtn.classList.toggle("active", v === "network");
    if (v === "network") els.navNetworkBtn.setAttribute("aria-current", "page");
    else els.navNetworkBtn.removeAttribute("aria-current");
  }
  if (els.navSerialBtn) {
    els.navSerialBtn.classList.toggle("active", v === "serial");
    if (v === "serial") els.navSerialBtn.setAttribute("aria-current", "page");
    else els.navSerialBtn.removeAttribute("aria-current");
  }
  if (els.navSystemBtn) {
    els.navSystemBtn.classList.toggle("active", v === "system");
    if (v === "system") els.navSystemBtn.setAttribute("aria-current", "page");
    else els.navSystemBtn.removeAttribute("aria-current");
  }
}

function initSidebarNav() {
  if (els.navHomeBtn) els.navHomeBtn.addEventListener("click", () => setMainView("home"));
  if (els.navNetworkBtn) els.navNetworkBtn.addEventListener("click", () => setMainView("network"));
  if (els.navSerialBtn) els.navSerialBtn.addEventListener("click", () => setMainView("serial"));
  if (els.navSystemBtn) els.navSystemBtn.addEventListener("click", () => setMainView("system"));
  setMainView("home");
}

function setSystemHint(text, isError = false) {
  if (!els.systemSaveHint) return;
  els.systemSaveHint.textContent = String(text || "");
  els.systemSaveHint.style.color = isError ? "#b91c1c" : "#6b7280";
}

function setSystemPassHint(text, isError = false, isSuccess = false) {
  if (!els.systemPassHint) return;
  els.systemPassHint.textContent = String(text || "");
  if (isError) els.systemPassHint.style.color = "#b91c1c";
  else if (isSuccess) els.systemPassHint.style.color = "#15803d";
  else els.systemPassHint.style.color = "#6b7280";
}

function setFtpHint(text, isError = false) {
  if (!els.ftpServerHint) return;
  els.ftpServerHint.textContent = String(text || "");
  els.ftpServerHint.style.color = isError ? "#b91c1c" : "#6b7280";
}

function setSerialSaveHint(text, isError = false) {
  if (!els.serialSaveHint) return;
  els.serialSaveHint.textContent = String(text || "");
  els.serialSaveHint.style.color = isError ? "#b91c1c" : "#6b7280";
}

async function loadNetIfaces() {
  try {
    const r = await fetchJsonGet("/api/net/ifaces");
    return Array.isArray(r?.interfaces) ? r.interfaces : [];
  } catch {
    return [];
  }
}

function pickFirstIfaceIp(ifaces) {
  for (const i of ifaces || []) {
    const addr = String(i?.address || "").trim();
    if (addr) return addr;
  }
  return "";
}

function prefixToNetmask(prefix) {
  const n = Number(prefix);
  if (!Number.isInteger(n) || n < 1 || n > 32) return "";
  let remaining = n;
  const octets = [];
  for (let i = 0; i < 4; i += 1) {
    const bits = Math.max(0, Math.min(8, remaining));
    const value = bits === 0 ? 0 : 256 - 2 ** (8 - bits);
    octets.push(String(value));
    remaining -= bits;
  }
  return octets.join(".");
}

function formatNetmaskDisplay(prefix, netmask = "") {
  const prefixText = String(prefix || "").trim();
  const maskText = String(netmask || "").trim() || prefixToNetmask(prefixText);
  return maskText || prefixText;
}

function readCurrentAppPort() {
  try {
    const u = new URL(window.location.href);
    const p = Number(u.port || "");
    if (Number.isFinite(p) && p > 0) return Math.floor(p);
  } catch {}
  return 3000;
}

async function initSystemUi() {
  if (
    !els.systemNameInput ||
    !els.systemIpInput ||
    !els.systemSaveBtn ||
    !els.systemIpMode ||
    !els.systemPrefixInput ||
    !els.systemGatewayInput
  )
    return;
  setSystemHint("");
  setSystemPassHint("");

  const cfg = await loadDeviceConfig();
  const system = cfg?.system || {};
  const name = String(system?.name || "");
  const clientMode = true; // 客户端模式默认开启
  const ipMode = String(system?.ipMode || "auto") === "manual" ? "manual" : "auto";
  const manualIp = String(system?.manualIp || "");
  const manualPrefix = String(system?.manualPrefix || "");
  const manualGateway = String(system?.manualGateway || "");
  const manualNetmask = formatNetmaskDisplay(manualPrefix, "");
  
  // 数据清理配置
  const cleanupConfig = system?.dataCleanup || {};
  const cleanupEnabled = cleanupConfig?.enabled ?? true;
  const cleanupDays = cleanupConfig?.days ?? 30;
  
  els.systemNameInput.value = name;
  els.systemNameInput.readOnly = false;
  els.systemNameInput.title = "操作系统主机名（可修改）";
  // 更新页面标题
  updatePageTitle(name);
  // 客户端模式默认开启，不再显示开关
  els.systemIpMode.value = ipMode;
  
  // 设置数据清理配置
  if (els.dataCleanupEnabled instanceof HTMLInputElement) {
    els.dataCleanupEnabled.checked = cleanupEnabled;
  }
  if (els.dataCleanupDays) {
    els.dataCleanupDays.value = String(cleanupDays);
  }

  const ifaces = await loadNetIfaces();
  const autoIp = pickFirstIfaceIp(ifaces);
  const appPort = readCurrentAppPort();
  const iface = cfg?.systemNetworkTarget || null;
  const autoPrefix = String(iface?.prefix || "").trim();
  const autoNetmask = String(iface?.netmask || "").trim();
  const autoGateway = String(iface?.gateway || "").trim();

  const applyIpModeToUi = () => {
    const mode = String(els.systemIpMode?.value || "auto") === "manual" ? "manual" : "auto";
    if (mode === "manual") {
      els.systemIpInput.readOnly = false;
      els.systemIpInput.value = manualIp || els.systemIpInput.value || "";
      els.systemIpInput.placeholder = "例如：192.168.1.22";
      els.systemPrefixInput.readOnly = false;
      els.systemPrefixInput.value = manualNetmask || els.systemPrefixInput.value || "";
      els.systemPrefixInput.placeholder = "例如：255.255.255.0";
      els.systemGatewayInput.readOnly = false;
      els.systemGatewayInput.value = manualGateway || els.systemGatewayInput.value || "";
    } else {
      els.systemIpInput.readOnly = true;
      els.systemIpInput.value = autoIp || "";
      els.systemIpInput.placeholder = "自动获取";
      els.systemPrefixInput.readOnly = true;
      els.systemPrefixInput.value = formatNetmaskDisplay(autoPrefix, autoNetmask);
      els.systemPrefixInput.placeholder = "自动获取";
      els.systemGatewayInput.readOnly = true;
      els.systemGatewayInput.value = autoGateway || "";
    }
  };
  els.systemIpMode.addEventListener("change", () => {
    applyIpModeToUi();
    setSystemHint("");
  });
  applyIpModeToUi();

  if (els.systemIfaceInfo) {
    const ifaceName = String(iface?.name || "").trim();
    const addr = String(iface?.address || "").trim();
    const gateway = String(iface?.gateway || "").trim();
    const prefix = String(iface?.prefix || "").trim();
    els.systemIfaceInfo.textContent = ifaceName
      ? `${ifaceName}${addr ? ` | 当前IP ${addr}` : ""}${prefix ? `/${prefix}` : ""}${gateway ? ` | 网关 ${gateway}` : ""}`
      : "未识别到可配置网卡";
  }

  els.systemSaveBtn.addEventListener("click", async () => {
    const mode = String(els.systemIpMode?.value || "auto") === "manual" ? "manual" : "auto";
    const payload = {
      system: {
        name: String(els.systemNameInput?.value || "").trim(),
        clientMode: true, // 客户端模式默认开启
        ipMode: mode,
        manualIp: mode === "manual" ? String(els.systemIpInput?.value || "").trim() : "",
        manualPrefix: mode === "manual" ? String(els.systemPrefixInput?.value || "").trim() : "",
        manualGateway: mode === "manual" ? String(els.systemGatewayInput?.value || "").trim() : "",
        dataCleanup: {
          enabled: els.dataCleanupEnabled instanceof HTMLInputElement ? els.dataCleanupEnabled.checked : true,
          days: Number(els.dataCleanupDays?.value || 30)
        }
      }
    };
    try {
      els.systemSaveBtn.disabled = true;
      setSystemHint("");
      setSystemPassHint("");
      const result = await fetchJson("/api/device/config", payload);
      
      // 处理主机名修改结果
      const hostnameResult = result?.hostnameChangeResult;
      let hostnameMsg = "";
      if (hostnameResult) {
        if (hostnameResult.success) {
          hostnameMsg = `主机名修改: ${hostnameResult.message || "成功"}`;
          if (hostnameResult.needsRestart) {
            hostnameMsg += " (可能需要重启系统)";
          }
        } else {
          hostnameMsg = `主机名修改失败: ${hostnameResult.error || "未知错误"}`;
        }
      }
      
      const networkMsg = String(result?.networkApplyResult?.message || "").trim();
      const finalMsg = [hostnameMsg, networkMsg].filter(Boolean).join("; ") || "保存成功";
      setSystemHint(finalMsg);

      // 更新页面标题
      const systemName = String(els.systemNameInput?.value || "").trim();
      updatePageTitle(systemName);

      const newPwd = String(els.systemNewPassword?.value || "");
      const wantsPassChange = Boolean(newPwd);
      if (!wantsPassChange) return;

      try {
        setSystemPassHint("密码修改中...");
        await fetchJson("/api/auth/change-password", { newPassword: newPwd });
        if (els.systemNewPassword) els.systemNewPassword.value = "";
        setSystemPassHint("密码修改成功", false, true);
      } catch (e) {
        setSystemPassHint(`修改失败：${String(e?.message || e || "")}`, true);
      }
    } catch (e) {
      setSystemHint(`保存失败：${String(e?.message || e || "")}`, true);
    } finally {
      els.systemSaveBtn.disabled = false;
    }
  });

  els.systemRestartBtn.addEventListener("click", async () => {
    // 显示自定义确认弹窗
    const confirmed = await showRestartConfirm();
    if (!confirmed) {
      return;
    }
    
    const originalText = els.systemRestartBtn.textContent;
    const originalOkText = els.restartConfirmOk ? els.restartConfirmOk.textContent : "确定重启";
    
    try {
      els.systemRestartBtn.disabled = true;
      els.systemRestartBtn.textContent = "重启中...";
      
      // 禁用确认弹窗的确定按钮
      if (els.restartConfirmOk) {
        els.restartConfirmOk.disabled = true;
        els.restartConfirmOk.textContent = "重启中...";
      }
      
      // 显示加载动画
      showLoading("正在重启设备，请稍候...");
      
      // 清除之前的提示
      setSystemHint("");
      
      // 发送重启请求
      try {
        // 使用fetchJson发送请求，但设置较短的超时时间
        const result = await fetchJson("/api/device/restart", {});
        
        // 如果请求成功（服务器在重启前响应了）
        console.log("重启命令已发送，服务器响应:", result?.message || "成功");
        
        // 更新加载动画显示重启成功
        showLoading("重启命令已发送，设备正在重启...");
        
        // 显示提示
        setSystemHint(result?.message || "重启命令已发送，设备正在重启...");
        
        // 记录日志
        console.log("重启命令已发送，等待系统重启...");
        
        // 开始轮询检查服务器是否重启完成
        startServerPolling();
        
      } catch (e) {
        // 请求失败可能是正常的（服务器可能立即重启）
        // 但我们仍然显示重启中的状态
        console.log("重启命令已发送，服务器可能已开始重启", e.message);
        
        // 更新加载动画显示重启中
        showLoading("重启命令已发送，设备正在重启...");
        
        // 显示提示
        setSystemHint("重启命令已发送，设备正在重启...");
        
        // 记录日志
        console.log("重启命令已发送，等待系统重启...");
        
        // 开始轮询检查服务器是否重启完成
        startServerPolling();
      }
      
    } catch (e) {
      // 这里不应该执行，因为我们已经处理了异步请求
      console.error("重启过程中发生意外错误:", e);
      
      // 隐藏加载动画
      hideLoading();
      setSystemHint(`重启失败：${String(e?.message || e || "")}`, true);
      
      // 恢复按钮状态
      if (els.systemRestartBtn) {
        els.systemRestartBtn.disabled = false;
        els.systemRestartBtn.textContent = originalText;
      }
      
      if (els.restartConfirmOk) {
        els.restartConfirmOk.disabled = false;
        els.restartConfirmOk.textContent = originalOkText;
      }
    }
    // 注意：这里没有finally块，因为成功时我们希望动画一直显示
    // 直到系统重启并重新加载页面
  });

  if (els.httpIngestUrl) {
    const ipShown = ipMode === "manual" ? (manualIp || autoIp) : autoIp;
    els.httpIngestUrl.textContent = ipShown ? `http://${ipShown}:${appPort}/api/isapi/event` : `/api/isapi/event`;
  }

  const ingest = cfg?.ingest || {};
  const ftpServer = ingest?.ftpServer || {};
  const ftpEnabled = Boolean(ftpServer?.enabled);
  const ftpPort = Number(ftpServer?.port || 21) || 21;
  const ftpUser = String(ftpServer?.username || "");
  const ftpPass = String(ftpServer?.password || "");
  const ftpRootDir = String(ftpServer?.rootDir || "");
  const ftpResolvedRootDir = String(ftpServer?.resolvedRootDir || ftpRootDir || "uploads/ftp");

  if (els.ftpServerEnabled instanceof HTMLInputElement) els.ftpServerEnabled.checked = ftpEnabled;
  if (els.ftpServerPort) els.ftpServerPort.value = String(ftpPort);
  if (els.ftpServerRootDir) els.ftpServerRootDir.value = ftpRootDir;
  if (els.ftpServerUser) els.ftpServerUser.value = ftpUser;
  if (els.ftpServerPass) els.ftpServerPass.value = ftpPass;

  if (els.ftpIngestUrl) {
    const ipShown = ipMode === "manual" ? (manualIp || autoIp) : autoIp;
    const addr = ipShown || "127.0.0.1";
    els.ftpIngestUrl.textContent = `ftp://${addr}:${ftpPort}/`;
  }
  if (els.ftpIngestDir) {
    els.ftpIngestDir.textContent = ftpResolvedRootDir;
  }

  if (els.ftpServerSaveBtn) {
    els.ftpServerSaveBtn.addEventListener("click", async () => {
      const enabled = Boolean(els.ftpServerEnabled instanceof HTMLInputElement ? els.ftpServerEnabled.checked : false);
      const port = Number(els.ftpServerPort?.value || 21) || 21;
      const rootDir = String(els.ftpServerRootDir?.value || "").trim();
      const username = String(els.ftpServerUser?.value || "").trim();
      const password = String(els.ftpServerPass?.value || "");
      const payload = {
        ingest: {
          ftpServer: {
            enabled,
            port,
            rootDir,
            username,
            password
          }
        }
      };
      try {
        els.ftpServerSaveBtn.disabled = true;
        const data = await fetchJson("/api/device/config", payload);
        setFtpHint("保存成功");
        if (els.ftpIngestUrl) {
          const ipShownNow = String(els.systemIpInput?.value || "").trim() || autoIp || "127.0.0.1";
          els.ftpIngestUrl.textContent = `ftp://${ipShownNow}:${port}/`;
        }
        if (els.ftpIngestDir) {
          const resolvedRootDir = String(data?.config?.ingest?.ftpServer?.resolvedRootDir || rootDir || "uploads/ftp");
          els.ftpIngestDir.textContent = resolvedRootDir;
        }
      } catch (e) {
        setFtpHint(`保存失败：${String(e?.message || e || "")}`, true);
      } finally {
        els.ftpServerSaveBtn.disabled = false;
      }
    });
  }
}

async function loadFingerprint() {
  const fingerprintBox = document.getElementById("fingerprintBox");
  if (!fingerprintBox) return;
  try {
    const res = await fetch("/api/device/fingerprint", { method: "GET" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      fingerprintBox.textContent = "设备指纹加载失败 (HTTP " + res.status + ")";
      return;
    }
    const fp = String(data?.fingerprint || "");
    if (!fp) {
      fingerprintBox.textContent = "未获取到设备指纹码";
      return;
    }
    fingerprintBox.textContent = `设备指纹码：${fp}`;
  } catch (e) {
    fingerprintBox.textContent = "获取设备指纹失败";
  }
}

async function fetchJson(url, body, method = "POST") {
  // 为重启请求设置较短的超时时间
  const isRestartRequest = url === "/api/device/restart";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), isRestartRequest ? 3000 : 30000);
  
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    
    // 如果是重启请求超时，认为是正常的（服务器可能已开始重启）
    if (isRestartRequest && error.name === "AbortError") {
      console.log("重启请求超时，服务器可能已开始重启");
      // 返回一个模拟的成功响应
      return { ok: true, message: "重启命令已发送" };
    }
    
    throw error;
  }
}

async function fetchJsonGet(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  
  try {
    const res = await fetch(url, { 
      method: "GET",
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

const PLATE_DB_NAME = "onvif-ipcam";
const PLATE_DB_VERSION = 1;
const PLATE_STORE_NAME = "plateRecords";
let plateDbPromise = null;
const plateById = new Map();
const plateSelectedIds = new Set();
const plateUiState = { view: "cards" };
const plateTableState = {
  page: 1,
  pageSize: 10,
  sortKey: "time",
  sortDir: "desc"
};
let plateTableVisibleIds = [];
let lastPlateQueryState = { plateText: "", date: "" };

function idbRequestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB 请求失败"));
  });
}

async function ensurePlateDb() {
  if (plateDbPromise) return plateDbPromise;
  if (!("indexedDB" in window)) {
    plateDbPromise = Promise.reject(new Error("当前浏览器不支持 IndexedDB"));
    return plateDbPromise;
  }
  plateDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(PLATE_DB_NAME, PLATE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PLATE_STORE_NAME)) {
        const store = db.createObjectStore(PLATE_STORE_NAME, { keyPath: "id" });
        store.createIndex("receivedAt", "receivedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("打开 IndexedDB 失败"));
  });
  return plateDbPromise;
}

async function plateDbPut(record) {
  const db = await ensurePlateDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(PLATE_STORE_NAME, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("保存记录失败"));
    tx.objectStore(PLATE_STORE_NAME).put(record);
  });
}

async function plateDbGet(id) {
  const db = await ensurePlateDb();
  const tx = db.transaction(PLATE_STORE_NAME, "readonly");
  const store = tx.objectStore(PLATE_STORE_NAME);
  return await idbRequestToPromise(store.get(String(id)));
}

async function plateDbDelete(id) {
  const db = await ensurePlateDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(PLATE_STORE_NAME, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("删除记录失败"));
    tx.objectStore(PLATE_STORE_NAME).delete(String(id));
  });
}

async function plateDbListLatest(limit = 200) {
  const db = await ensurePlateDb();
  const out = [];
  await new Promise((resolve, reject) => {
    const tx = db.transaction(PLATE_STORE_NAME, "readonly");
    tx.onerror = () => reject(tx.error || new Error("读取记录失败"));
    const store = tx.objectStore(PLATE_STORE_NAME);
    const idx = store.index("receivedAt");
    const req = idx.openCursor(null, "prev");
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return resolve();
      out.push(cursor.value);
      if (out.length >= limit) return resolve();
      cursor.continue();
    };
    req.onerror = () => reject(req.error || new Error("读取记录失败"));
  });
  return out;
}

function formatDateTime(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "";
  const d = new Date(n);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hour = String(d.getHours()).padStart(2, "0");
  const minute = String(d.getMinutes()).padStart(2, "0");
  const second = String(d.getSeconds()).padStart(2, "0");
  return `${year}年${month}月${day}日 ${hour}:${minute}:${second}`;
}

function formatTimeOnly(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "";
  const d = new Date(n);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function getRecordTs(rec) {
  return Number(rec?.eventAt || rec?.receivedAt || 0) || 0;
}

function removeEmptyHint(plateListEl) {
  const emptyHint = plateListEl.querySelector(".empty-hint");
  if (emptyHint) emptyHint.remove();
}

function ensureEmptyHint(plateListEl) {
  const hasCard = plateListEl.querySelector(".plate-card:not(.hidden)");
  if (hasCard) return;
  const emptyHint = plateListEl.querySelector(".empty-hint");
  if (emptyHint) return;
  const el = document.createElement("div");
  el.className = "empty-hint";
  el.textContent = "暂无车牌数据，等待接收...";
  plateListEl.appendChild(el);
}

function updatePlateBulkUi() {
  if (els.plateDeleteBtn) els.plateDeleteBtn.disabled = plateSelectedIds.size === 0;
  if (els.plateDownloadBtn) els.plateDownloadBtn.disabled = plateSelectedIds.size === 0;
  if (els.plateSelectAll) {
    let visibleIds = [];
    if (plateUiState.view === "table") {
      visibleIds = plateTableVisibleIds.slice();
    } else {
      const cards = Array.from(document.querySelectorAll(".plate-card:not(.hidden)"));
      visibleIds = cards.map((el) => String(el.dataset.recordId || "")).filter(Boolean);
    }
    if (!visibleIds.length) {
      els.plateSelectAll.checked = false;
      els.plateSelectAll.indeterminate = false;
      return;
    }
    const selectedVisible = visibleIds.filter((id) => plateSelectedIds.has(id)).length;
    els.plateSelectAll.checked = selectedVisible > 0 && selectedVisible === visibleIds.length;
    els.plateSelectAll.indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length;
  }
}

function syncSelectionToCard(id, checked) {
  const key = String(id || "");
  if (!key) return;
  const cardEl = document.querySelector(`.plate-card[data-record-id="${CSS.escape(key)}"]`);
  if (!cardEl) return;
  cardEl.classList.toggle("selected", Boolean(checked));
  const cb = cardEl.querySelector(".plate-check");
  if (cb instanceof HTMLInputElement) cb.checked = Boolean(checked);
}

function syncSelectionToTableRow(id, checked) {
  const key = String(id || "");
  if (!key) return;
  const rowEl = document.querySelector(`.plate-row[data-record-id="${CSS.escape(key)}"]`);
  if (rowEl) rowEl.classList.toggle("selected", Boolean(checked));
  const cb = document.querySelector(`.plate-row-check[data-record-id="${CSS.escape(key)}"]`);
  if (cb instanceof HTMLInputElement) cb.checked = Boolean(checked);
}

function setPlateSelectedById(id, checked) {
  const key = String(id || "");
  if (!key) return;
  const on = Boolean(checked);
  if (on) plateSelectedIds.add(key);
  else plateSelectedIds.delete(key);
  syncSelectionToCard(key, on);
  syncSelectionToTableRow(key, on);
  updatePlateBulkUi();
}

function toLocalIsoDate(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "";
  const d = new Date(n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getPlateQueryStateFromUi() {
  return {
    plateText: String(els.plateSearchInput?.value || ""),
    date: String(els.plateDateInput?.value || "")
  };
}

function getAllPlateRecords() {
  const out = [];
  for (const rec of plateById.values()) {
    if (!rec?.id) continue;
    out.push(rec);
  }
  return out;
}

function filterPlateRecords(records, { plateText, date } = {}) {
  const q = String(plateText || "").trim().toLowerCase();
  const dateVal = String(date || "").trim();
  const out = [];
  for (const rec of records || []) {
    const plate = String(rec?.plate || "").toLowerCase();
    const ts = getRecordTs(rec);
    const day = toLocalIsoDate(ts);
    const matchPlate = !q || plate.includes(q);
    const matchDate = !dateVal || day === dateVal;
    if (matchPlate && matchDate) out.push(rec);
  }
  return out;
}

async function applyPlateFilters({ plateText, date } = {}) {
  lastPlateQueryState = { plateText: String(plateText || ""), date: String(date || "") };
  const q = String(plateText || "").trim();
  const dateVal = String(date || "").trim();
  const plateListEl = document.getElementById("plateList");
  if (!plateListEl) return;
  
  // 显示加载状态
  plateListEl.textContent = "";
  const loadingHint = document.createElement("div");
  loadingHint.className = "empty-hint";
  loadingHint.textContent = "查询中...";
  plateListEl.appendChild(loadingHint);
  
  try {
    let items = [];
    let totalCount = 0;
    let pagination = null;
    
    // 如果查询条件为空，则使用分页API加载数据
    if (!q && !dateVal) {
      const page = Math.max(1, Number(plateTableState.page) || 1);
      const pageSize = Math.max(1, Math.min(500, Number(plateTableState.pageSize) || 100));
      
      // 使用分页API
      const r = await fetchJsonGet(`/api/plates/paged?page=${page}&pageSize=${pageSize}`);
      items = Array.isArray(r?.items) ? r.items : [];
      pagination = r?.pagination || null;
      totalCount = pagination?.total || 0;
      
      console.log(`[调试] applyPlateFilters: 分页加载 ${items.length} 条记录，第 ${page}/${pagination?.totalPages || 1} 页，总计 ${totalCount} 条`);
    } else {
      // 构建查询参数
      const params = new URLSearchParams();
      if (q) params.set("plate", q);
      if (dateVal) params.set("date", dateVal);
      
      // 调用搜索API
      const r = await fetchJsonGet(`/api/plates/search?${params.toString()}`);
      items = Array.isArray(r?.items) ? r.items : [];
      totalCount = items.length;
      console.log(`[调试] applyPlateFilters: 搜索到 ${items.length} 条记录`);
    }
    
    // 清空当前数据
    plateListEl.textContent = "";
    plateById.clear();
    
    // 加载新数据
    for (const rec of items) {
      if (!rec?.id) continue;
      plateById.set(String(rec.id), rec);
    }
    
    // 渲染卡片
    for (const rec of items) {
      renderPlateCard(rec, { prepend: false, skipFilterApply: true });
    }
    
    // 更新分页信息
    if (plateUiState.view === "cards") {
      // 如果使用分页API，更新分页状态
      if (pagination) {
        plateTableState.page = pagination.page;
        plateTableState.pageSize = pagination.pageSize;
        plateTableState.total = pagination.total;
      } else {
        // 对于搜索查询，使用前端分页
        const pageSize = Math.max(1, Math.min(200, Number(plateTableState.pageSize) || 10));
        const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
        plateTableState.page = Math.max(1, Math.min(totalPages, Number(plateTableState.page) || 1));
        
        const allCards = Array.from(plateListEl.querySelectorAll(".plate-card"));
        const startIdx = (plateTableState.page - 1) * pageSize;
        const endIdx = startIdx + pageSize;
        
        for (let i = 0; i < allCards.length; i++) {
          const card = allCards[i];
          const inCurrentPage = i >= startIdx && i < endIdx;
          card.classList.toggle("hidden", !inCurrentPage);
        }
      }
      
      updatePlatePageInfo();
    }
    
    ensureEmptyHint(plateListEl);
    renderPlateTable();
    updatePlateDashboard().catch(err => console.error("更新仪表板失败:", err));
    updatePlateBulkUi();
    
  } catch (error) {
    console.error("查询失败:", error);
    plateListEl.textContent = "";
    const errorHint = document.createElement("div");
    errorHint.className = "empty-hint";
    errorHint.textContent = "查询失败，请重试";
    plateListEl.appendChild(errorHint);
  }
}

async function applyPlateFiltersFromUi() {
  const state = getPlateQueryStateFromUi();
  await applyPlateFilters(state);
}

function getImgSrcOrFallback(imageDataUrl) {
  const v = String(imageDataUrl || "");
  if (v) return v;
  return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="100%25" height="100%25" fill="%23222"/><text x="50%25" y="50%25" font-size="14" text-anchor="middle" dominant-baseline="middle" fill="%23999">无图片</text></svg>';
}

function createPlateMetaTag({ className, text, muted }) {
  const span = document.createElement("span");
  span.className = `plate-metaTag ${className} ${muted ? "muted" : "ok"}`.trim();
  span.textContent = text;
  return span;
}

function updatePlateCardMeta(id) {
  const key = String(id || "");
  if (!key) return;
  const card = document.querySelector(`.plate-card[data-record-id="${CSS.escape(key)}"]`);
  if (!(card instanceof HTMLElement)) return;
  const rec = plateById.get(key);
  if (!rec) return;

  const timeStr = formatDateTime(rec.eventAt || rec.receivedAt) || formatDateTime(rec.receivedAt);
  const hasImage = Boolean(String(rec.imageDataUrl || ""));
  const serialSent = Boolean(Number(rec.serialSentAt || 0));

  const timeEl = card.querySelector(".plate-metaTime");
  if (timeEl) timeEl.textContent = timeStr;

  const imgEl = card.querySelector(".plate-metaImage");
  if (imgEl instanceof HTMLElement) {
    imgEl.textContent = hasImage ? "图片：有" : "图片：无";
    imgEl.classList.toggle("ok", hasImage);
    imgEl.classList.toggle("muted", !hasImage);
  }

  const serialEl = card.querySelector(".plate-metaSerial");
  if (serialEl instanceof HTMLElement) {
    serialEl.textContent = serialSent ? "串口：已发送" : "串口：未发送";
    serialEl.classList.toggle("ok", serialSent);
    serialEl.classList.toggle("muted", !serialSent);
  }
}

function renderPlateCard(record, { prepend, skipFilterApply } = {}) {
  const plateListEl = document.getElementById("plateList");
  if (!plateListEl) return;
  removeEmptyHint(plateListEl);

  const card = document.createElement("div");
  card.className = "plate-card";
  card.dataset.recordId = String(record.id || "");
  card.dataset.plate = String(record.plate || "");
  card.dataset.ts = String(record.eventAt || record.receivedAt || 0);

  const timeStr = formatDateTime(record.eventAt || record.receivedAt) || formatDateTime(record.receivedAt);
  const imgSrc = getImgSrcOrFallback(record.imageDataUrl);
  const plateText = String(record.plate || "");
  const hasImage = Boolean(String(record.imageDataUrl || ""));
  const serialSent = Boolean(Number(record.serialSentAt || 0));

  const checkWrap = document.createElement("div");
  checkWrap.className = "plate-checkWrap";
  const checkbox = document.createElement("input");
  checkbox.className = "plate-check";
  checkbox.type = "checkbox";
  checkbox.setAttribute("aria-label", "选择");
  checkWrap.appendChild(checkbox);

  const img = document.createElement("img");
  img.src = imgSrc;
  img.className = "plate-img";
  img.alt = "车牌截图";

  const info = document.createElement("div");
  info.className = "plate-info";
  const textEl = document.createElement("div");
  textEl.className = "plate-text";
  textEl.textContent = plateText;
  const metaRow = document.createElement("div");
  metaRow.className = "plate-metaRow";
  const timeEl = document.createElement("span");
  timeEl.className = "plate-metaTime";
  timeEl.textContent = timeStr;
  metaRow.appendChild(timeEl);
  metaRow.appendChild(createPlateMetaTag({ className: "plate-metaImage", text: hasImage ? "图片：有" : "图片：无", muted: !hasImage }));
  metaRow.appendChild(createPlateMetaTag({ className: "plate-metaSerial", text: serialSent ? "串口：已发送" : "串口：未发送", muted: !serialSent }));
  info.append(textEl, metaRow);

  card.replaceChildren(checkWrap, img, info);
  if (checkbox instanceof HTMLInputElement) {
    const id = String(card.dataset.recordId || "");
    checkbox.checked = plateSelectedIds.has(id);
    card.classList.toggle("selected", checkbox.checked);
    checkbox.addEventListener("click", (ev) => ev.stopPropagation());
    checkbox.addEventListener("dblclick", (ev) => ev.stopPropagation());
    checkbox.addEventListener("change", () => setPlateSelectedById(id, checkbox.checked));
  }

  card.addEventListener("dblclick", (ev) => {
    if (ev.target instanceof HTMLInputElement) return;
    const id = String(card.dataset.recordId || "");
    if (!id) return;
    openPlateDetailById(id);
  });

  if (prepend) plateListEl.prepend(card);
  else plateListEl.appendChild(card);
  if (!skipFilterApply) {
    // 异步调用，但不等待，避免阻塞渲染
    applyPlateFiltersFromUi().catch(err => console.error("过滤失败:", err));
  }
}

async function enrichRecordImageMeta(id, imageDataUrl) {
  const src = String(imageDataUrl || "");
  if (!src) return;
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  try {
    if (img.decode) await img.decode();
    else await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("图片加载失败"));
    });
  } catch {
    return;
  }
  const w = Number(img.naturalWidth || 0);
  const h = Number(img.naturalHeight || 0);
  if (!w || !h) return;
  const rec = plateById.get(id);
  if (!rec) return;
  if (rec.imageWidth === w && rec.imageHeight === h) return;
  rec.imageWidth = w;
  rec.imageHeight = h;
  plateById.set(id, rec);
}

async function updateRecordSerialSent(id, sentAt) {
  const key = String(id || "");
  if (!key) return;
  const t = Number(sentAt);
  if (!Number.isFinite(t) || t <= 0) return;
  let rec = plateById.get(key);
  if (!rec) rec = null;
  if (!rec) return;
  rec.serialSentAt = t;
  plateById.set(key, rec);
  try {
    await fetchJson(`/api/plates/${encodeURIComponent(key)}/serial-sent`, { sentAt: t });
  } catch {}
  updatePlateCardMeta(key);
  renderPlateTable();
  updatePlateDashboard().catch(err => console.error("更新仪表板失败:", err));
}

function setModalOpen(open) {
  const modal = document.getElementById("plateDetailModal");
  if (!modal) return;
  if (open) {
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  } else {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }
}

async function fillPlateDetailModal(record) {
  const imgEl = document.getElementById("plateDetailImg");
  const plateEl = document.getElementById("plateDetailPlate");
  const receivedEl = document.getElementById("plateDetailReceivedAt");
  const sizeEl = document.getElementById("plateDetailImageSize");
  const serialEl = document.getElementById("plateDetailSerialSentAt");
  const ftpEl = document.getElementById("plateDetailFtpPath");
  const parsedMetaEl = document.getElementById("plateDetailParsedMeta");

  if (imgEl) imgEl.src = getImgSrcOrFallback(record.imageDataUrl);
  if (plateEl) plateEl.textContent = String(record.plate || "");
  if (receivedEl) receivedEl.textContent = formatDateTime(record.eventAt || record.receivedAt) || formatDateTime(record.receivedAt);

  const w = Number(record.imageWidth || 0);
  const h = Number(record.imageHeight || 0);
  if (sizeEl) sizeEl.textContent = w && h ? `${w} × ${h}` : "未知";

  const sentAt = Number(record.serialSentAt || 0);
  if (serialEl) serialEl.textContent = sentAt ? formatDateTime(sentAt) : "未发送";

  const ftpPath = String(record.ftpRemotePath || "");
  if (ftpEl) ftpEl.textContent = ftpPath || "无";
  
  // 判断设备协议类型
  const isIsapiDevice = isIsapiProtocolRecord(record);
  
  // 根据协议类型选择不同的显示方式
  if (isIsapiDevice) {
    // ISAPI协议设备：使用ISAPI命名规则显示
    if (parsedMetaEl) {
      parsedMetaEl.textContent = "正在加载ISAPI命名规则...";
    }
    
    try {
      // 尝试从记录中获取设备信息，用于调用ISAPI API
      // 获取完整的ISAPI FTP配置
      const ftpConfig = await loadIsapiFtpConfigForRecord(record);
      
      // 用ISAPI的详细命名规则（带值）替代解析信息
      if (parsedMetaEl && ftpConfig.namingRules && ftpConfig.namingRules.length > 0) {
        // 格式化命名规则为文本显示
        const namingRulesText = formatNamingRulesAsText(ftpConfig.namingRules);
        parsedMetaEl.textContent = namingRulesText;
      } else if (parsedMetaEl) {
        parsedMetaEl.textContent = "未获取到ISAPI命名规则";
      }
      
    } catch (error) {
      console.error("加载ISAPI FTP配置失败:", error);
      
      // 如果加载失败，显示错误信息
      if (parsedMetaEl) {
        parsedMetaEl.textContent = "加载ISAPI命名规则失败";
      }
    }
  } else {
    // 其他协议设备：使用自己分析的解析信息显示
    if (parsedMetaEl) {
      parsedMetaEl.textContent = formatParsedMetaText(record.parsedMeta);
    }
  }
}

// 判断记录是否来自ISAPI协议设备
function isIsapiProtocolRecord(record) {
  if (!record) return false;
  
  // 1. 首先检查deviceConnection中是否有protocol信息
  if (record.deviceConnection && record.deviceConnection.protocol) {
    const protocol = String(record.deviceConnection.protocol).trim().toLowerCase();
    return protocol === "hikvision-isapi";
  }
  
  // 2. 检查parsedMeta中是否有设备信息暗示是ISAPI设备
  if (record.parsedMeta && record.parsedMeta.deviceIp) {
    // 如果有设备IP，可以假设是ISAPI设备（海康设备通常使用ISAPI）
    // 这里可以根据实际情况调整逻辑
    return true;
  }
  
  // 3. 默认情况下，如果无法确定，假设不是ISAPI设备
  return false;
}

// 格式化命名规则为文本显示
function formatNamingRulesAsText(namingRules) {
  if (!namingRules || !Array.isArray(namingRules) || namingRules.length === 0) {
    return "无命名规则数据";
  }
  
  const parts = [];
  
  namingRules.forEach((rule, index) => {
    if (typeof rule === 'object') {
      // 对象格式的规则：{ name: "设备名", value: "IP CAPTURE CAMERA" }
      const name = rule.name || rule.element || `规则${index + 1}`;
      const value = rule.value || '无值';
      parts.push(`${name} : ${value}`);
    } else if (typeof rule === 'string') {
      // 字符串格式的规则
      parts.push(`规则${index + 1} : ${rule}`);
    }
  });
  
  return parts.join("\n");
}

function formatParsedMetaText(meta) {
  if (!meta || typeof meta !== "object") return "无";
  const parts = [];
  
  // 检查是否是二进制解析的结果
  const isBinaryParsed = meta.binaryParsed === true;
  
  // 显示时间（所有情况都显示）
  const eventAtText = String(meta.eventAtText || "").trim();
  if (eventAtText) {
    // 尝试解析格式 "2026/4/19 07:46:10" 为 "2026年04月20日 15:22:04"
    const timeMatch = eventAtText.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2}) (\d{2}):(\d{2}):(\d{2})$/);
    if (timeMatch) {
      const [, year, month, day, hour, minute, second] = timeMatch;
      // 格式化月份和日期为两位数字
      const formattedMonth = month.padStart(2, '0');
      const formattedDay = day.padStart(2, '0');
      parts.push(`时间：${year}年${formattedMonth}月${formattedDay}日 ${hour}:${minute}:${second}`);
    } else {
      parts.push(`时间：${eventAtText}`);
    }
  } else if (meta.eventAt) {
    parts.push(`时间：${formatDateTime(meta.eventAt) || "--"}`);
  }
  
  // 如果是二进制解析，显示解析方式但不分解时间
  if (isBinaryParsed) {
    parts.push(`解析方式：二进制解析`);
    
    // 不显示时间戳分解，只显示设备信息
    // 显示设备信息
    if (meta.deviceId) parts.push(`设备ID：${meta.deviceId}`);
    if (meta.deviceIdStr) parts.push(`设备编号：${meta.deviceIdStr}`);
    
    // 显示字段标记
    if (Array.isArray(meta.fieldMarkers) && meta.fieldMarkers.length > 0) {
      parts.push(`字段标记：${meta.fieldMarkers.join(', ')}`);
    }
  }
  
  // 优先使用识别码解析器返回的字段映射
  if (meta.fields && typeof meta.fields === 'object' && Object.keys(meta.fields).length > 0) {
    // 使用识别码解析器返回的字段映射
    const fieldOrder = meta.fieldOrder || getDefaultFieldOrder();
    
    // 按字段顺序显示字段
    fieldOrder.forEach(fieldName => {
      if (meta.fields[fieldName] !== undefined && meta.fields[fieldName] !== '') {
        parts.push(`${fieldName} : ${meta.fields[fieldName]}`);
      }
    });
    
    // 显示识别码信息
    if (meta.identificationCode) {
      parts.push(`识别码 : ${meta.identificationCode.byte44},${meta.identificationCode.byte45}`);
    }
    if (meta.config && meta.config !== '未找到配置') {
      parts.push(`配置 : ${meta.config}`);
    }
  } else {
    // 回退到原有逻辑
    // 已知字段
    if (meta.deviceIp) parts.push(`设备IP：${meta.deviceIp}`);
    if (meta.vehicleType) parts.push(`车辆类型：${meta.vehicleType}`);
    if (meta.speed) parts.push(`车辆速度：${meta.speed}`);
    
    // 处理其余字段（unmatchedTokens）
    if (Array.isArray(meta.unmatchedTokens) && meta.unmatchedTokens.length) {
      const tokens = meta.unmatchedTokens;
      // 根据示例格式分配字段
      if (tokens.length >= 1) parts.push(`设备编号：${tokens[0]}`); // 0008
      if (tokens.length >= 2) parts.push(`车辆速度：${tokens[1]}`); // 023 (如果speed字段不存在)
      if (tokens.length >= 3) parts.push(`未知字段：${tokens[2]}`); // 070
      if (tokens.length >= 4) parts.push(`未知字段：${tokens[3]}`); // 正常
      if (tokens.length >= 5) parts.push(`未知字段：${tokens[4]}`); // 无
      if (tokens.length >= 6) parts.push(`车辆颜色：${tokens[5]}`); // 其它色
      if (tokens.length >= 7) parts.push(`未知字段：${tokens[6]}`); // 12357
      if (tokens.length >= 8) parts.push(`未知字段：${tokens[7]}`); // 01
    }
    
    // 其他已知字段（如果存在）
    if (meta.deviceNo) parts.push(`未知字段：${meta.deviceNo}`);
    if (meta.channelNo) parts.push(`未知字段：${meta.channelNo}`);
    if (meta.laneNo) parts.push(`未知字段：${meta.laneNo}`);
    if (meta.imageSeq) parts.push(`未知字段：${meta.imageSeq}`);
    if (meta.vehicleSeq) parts.push(`未知字段：${meta.vehicleSeq}`);
    if (meta.plateColor) parts.push(`未知字段：${meta.plateColor}`);
    if (meta.vehicleColor) parts.push(`车辆颜色：${meta.vehicleColor}`);
    if (meta.directionNo) parts.push(`未知字段：${meta.directionNo}`);
    if (meta.intersectionNo) parts.push(`未知字段：${meta.intersectionNo}`);
    if (meta.violationType) parts.push(`未知字段：${meta.violationType}`);
  }
  
  return parts.length ? parts.join("\n") : "无";
}

// 获取默认字段顺序（与服务器端保持一致）
function getDefaultFieldOrder() {
  return [
    "设备名", "设备号", "设备IP", "通道名", "通道号",
    "时间", "车牌号码", "车牌颜色", "车道号", "车辆速度",
    "监测点1", "图片序号", "车辆序号", "限速标志", "国标违法代码"
  ];
}

async function openPlateDetailById(id) {
  const key = String(id || "");
  if (!key) return;
  let rec = plateById.get(key);
  if (!rec) {
    try {
      const r = await fetchJsonGet(`/api/plates/${encodeURIComponent(key)}`);
      rec = r?.record || null;
    } catch {
      rec = null;
    }
  }
  if (!rec) return;
  plateById.set(key, rec);
  await fillPlateDetailModal(rec);
  setModalOpen(true);
}

function initPlateDetailModalUi() {
  const modal = document.getElementById("plateDetailModal");
  if (!modal) return;
  const closeBtn = document.getElementById("plateDetailCloseBtn");
  if (closeBtn) closeBtn.addEventListener("click", () => setModalOpen(false));
  modal.addEventListener("click", (ev) => {
    const t = ev.target;
    if (t instanceof HTMLElement && t.dataset.close === "1") setModalOpen(false);
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") setModalOpen(false);
  });
}

async function loadPlateHistoryToUi() {
  const plateListEl = document.getElementById("plateList");
  if (!plateListEl) return;
  let list = [];
  try {
    console.log(`[调试] loadPlateHistoryToUi: 开始从API加载记录`);
    // 使用分页API加载第一页数据（默认100条）
    const r = await fetchJsonGet(`/api/plates/paged?page=1&pageSize=100`);
    list = Array.isArray(r?.items) ? r.items : [];
    const pagination = r?.pagination || null;
    console.log(`[调试] loadPlateHistoryToUi: API返回 ${list.length} 条记录，总计 ${pagination?.total || 0} 条`);
  } catch (error) {
    console.error(`[调试] loadPlateHistoryToUi: API调用失败`, error);
    ensureEmptyHint(plateListEl);
    return;
  }
  plateListEl.textContent = "";
  console.log(`[调试] loadPlateHistoryToUi: 开始添加到plateById, 当前大小=${plateById.size}`);
  for (const rec of list.reverse()) {
    if (!rec?.id) continue;
    plateById.set(String(rec.id), rec);
  }
  console.log(`[调试] loadPlateHistoryToUi: 添加后plateById大小=${plateById.size}`);
  
  for (const rec of list) renderPlateCard(rec, { prepend: false, skipFilterApply: true });
  ensureEmptyHint(plateListEl);
  for (const rec of list) {
    const id = String(rec.id || "");
    if (!id) continue;
    if (rec.imageDataUrl && (!rec.imageWidth || !rec.imageHeight)) enrichRecordImageMeta(id, rec.imageDataUrl);
  }
  // 异步调用查询过滤
  applyPlateFiltersFromUi().then(() => {
    updatePlatePageInfo();
  }).catch(err => {
    console.error("加载后过滤失败:", err);
    updatePlatePageInfo();
  });
}

function randomFrom(arr) {
  if (!arr.length) return "";
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomPlate() {
  const provinces = [
    "\u4eac",
    "\u6caa",
    "\u6d59",
    "\u82cf",
    "\u7ca4",
    "\u9c81",
    "\u5ddd",
    "\u6e1d",
    "\u9102",
    "\u7696",
    "\u95fd",
    "\u8d63",
    "\u5180",
    "\u8c6b",
    "\u4e91"
  ];
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  const p = randomFrom(provinces);
  const head = randomFrom(letters);
  const isNewEnergy = Math.random() < 0.35;
  const len = isNewEnergy ? 6 : 5;
  let tail = "";
  for (let i = 0; i < len; i++) tail += randomFrom(chars);
  return `${p}${head}${tail}`;
}

function makePlateSvgDataUrl({ width, height, plate, seedText }) {
  const w = Math.max(1, Math.floor(Number(width) || 1));
  const h = Math.max(1, Math.floor(Number(height) || 1));
  const safePlate = String(plate || "");
  const safeSeed = String(seedText || "");
  const fontSize = Math.max(12, Math.floor(Math.min(w, h) * 0.18));
  const smallSize = Math.max(10, Math.floor(fontSize * 0.52));
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b1220"/>
      <stop offset="1" stop-color="#1f2937"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${w}" height="${h}" fill="url(#g)"/>
  <rect x="${Math.floor(w * 0.03)}" y="${Math.floor(h * 0.06)}" width="${Math.floor(w * 0.94)}" height="${Math.floor(h * 0.88)}" rx="${Math.floor(Math.min(w, h) * 0.06)}" fill="none" stroke="#94a3b8" stroke-width="${Math.max(2, Math.floor(Math.min(w, h) * 0.02))}"/>
  <text x="50%" y="52%" fill="#e5e7eb" font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="${fontSize}" font-weight="700" text-anchor="middle" dominant-baseline="middle">${safePlate}</text>
  <text x="50%" y="${Math.floor(h * 0.86)}" fill="#9ca3af" font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="${smallSize}" text-anchor="middle" dominant-baseline="middle">${safeSeed}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function setPlateView(view) {
  const v = view === "table" ? "table" : "cards";
  plateUiState.view = v;
  const listEl = document.getElementById("plateList");
  if (listEl) listEl.classList.toggle("view-hidden", v !== "cards");
  if (els.plateTableWrap) els.plateTableWrap.classList.toggle("view-hidden", v !== "table");
  if (els.plateViewCardsBtn) {
    els.plateViewCardsBtn.classList.toggle("active", v === "cards");
    els.plateViewCardsBtn.setAttribute("aria-selected", v === "cards" ? "true" : "false");
  }
  if (els.plateViewTableBtn) {
    els.plateViewTableBtn.classList.toggle("active", v === "table");
    els.plateViewTableBtn.setAttribute("aria-selected", v === "table" ? "true" : "false");
  }
  renderPlateTable();
  // 异步调用过滤
  applyPlateFiltersFromUi().catch(err => console.error("切换视图时过滤失败:", err));
  updatePlateBulkUi();
}

function compareRecords(a, b, key, dir) {
  const direction = dir === "asc" ? 1 : -1;
  if (key === "plate") {
    const av = String(a?.plate || "");
    const bv = String(b?.plate || "");
    return av.localeCompare(bv, "zh-CN") * direction;
  }
  if (key === "image") {
    const av = String(a?.imageDataUrl || "") ? 1 : 0;
    const bv = String(b?.imageDataUrl || "") ? 1 : 0;
    return (av - bv) * direction;
  }
  if (key === "serial") {
    const av = Number(a?.serialSentAt || 0) || 0;
    const bv = Number(b?.serialSentAt || 0) || 0;
    return (av - bv) * direction;
  }
  const av = getRecordTs(a);
  const bv = getRecordTs(b);
  return (av - bv) * direction;
}

async function updatePlateDashboard() {
  // 获取总记录数（从服务器API）
  let totalCount = 0;
  let filteredCount = 0;
  
  try {
    // 获取总记录数
    const countResponse = await fetchJsonGet("/api/plates/count");
    totalCount = Number(countResponse?.total || 0);
    
    // 如果有筛选条件，获取筛选结果数量
    const q = String(lastPlateQueryState.plateText || "").trim();
    const dateVal = String(lastPlateQueryState.date || "").trim();
    
    if (q || dateVal) {
      // 调用搜索API获取筛选结果数量
      const params = new URLSearchParams();
      if (q) params.set("plate", q);
      if (dateVal) params.set("date", dateVal);
      
      const searchResponse = await fetchJsonGet(`/api/plates/search?${params.toString()}`);
      const searchItems = Array.isArray(searchResponse?.items) ? searchResponse.items : [];
      filteredCount = searchItems.length;
    } else {
      // 没有筛选条件，筛选结果数等于总记录数
      filteredCount = totalCount;
    }
  } catch (error) {
    console.warn("获取服务器数据失败，使用本地数据:", error);
    // 如果API失败，使用本地数据作为备选
    const all = getAllPlateRecords();
    totalCount = all.length;
    const filtered = filterPlateRecords(all, lastPlateQueryState);
    filteredCount = filtered.length;
  }
  
  const all = getAllPlateRecords();
  const nowMs = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayStartMs = startOfToday.getTime();
  const lastHourStart = nowMs - 60 * 60 * 1000;

  let todayCount = 0;
  let lastHourCount = 0;
  let latest = null;
  const uniqueToday = new Set();

  for (const rec of all) {
    const ts = getRecordTs(rec);
    if (ts <= 0) continue;
    if (ts >= todayStartMs) {
      todayCount += 1;
      uniqueToday.add(String(rec.plate || ""));
    }
    if (ts >= lastHourStart) lastHourCount += 1;
    if (!latest || ts > getRecordTs(latest)) latest = rec;
  }
  if (els.dashTotal) els.dashTotal.textContent = String(totalCount);
  if (els.dashToday) els.dashToday.textContent = String(todayCount);
  if (els.dashLastHour) els.dashLastHour.textContent = String(lastHourCount);
  if (els.dashUniqueToday) els.dashUniqueToday.textContent = String(uniqueToday.size);
  if (els.dashFiltered) els.dashFiltered.textContent = String(filteredCount);
  if (els.dashLatest) {
    if (!latest) els.dashLatest.textContent = "--";
    else {
      const ts = getRecordTs(latest);
      const plate = String(latest.plate || "");
      els.dashLatest.textContent = `${plate} @ ${formatDateTime(ts) || formatTimeOnly(ts)}`.trim();
    }
  }
  if (els.dashUpdatedAt) els.dashUpdatedAt.textContent = `更新：${formatTimeOnly(nowMs)}`;
}

function updatePlateDashboardLight(newRecord) {
  // 轻量级仪表板更新，只更新必要的统计数据
  const all = Array.from(plateById.values());
  const nowMs = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayStartMs = startOfToday.getTime();
  const lastHourStart = nowMs - 60 * 60 * 1000;

  // 只更新总数和最新记录
  if (els.dashTotal) els.dashTotal.textContent = String(all.length);
  
  // 更新最新记录
  let latest = null;
  for (const rec of all) {
    const ts = getRecordTs(rec);
    if (ts <= 0) continue;
    if (!latest || ts > getRecordTs(latest)) latest = rec;
  }
  
  if (els.dashLatest) {
    if (!latest) els.dashLatest.textContent = "--";
    else {
      const ts = getRecordTs(latest);
      const plate = String(latest.plate || "");
      els.dashLatest.textContent = `${plate} @ ${formatDateTime(ts) || formatTimeOnly(ts)}`.trim();
    }
  }
  
  // 更新时间戳
  if (els.dashUpdatedAt) els.dashUpdatedAt.textContent = `更新：${formatTimeOnly(nowMs)}`;
  
  // 其他统计数据可以延迟更新或定期更新
  // 今天数量和最近一小时数量可以定期计算，不需要实时更新
  
  // 调度完整统计数据更新
  scheduleDashboardFullUpdate();
}

// 定期更新完整统计数据
let dashboardUpdateTimer = null;
function scheduleDashboardFullUpdate() {
  if (dashboardUpdateTimer) {
    clearTimeout(dashboardUpdateTimer);
  }
  
  // 延迟1秒后更新完整统计数据
  dashboardUpdateTimer = setTimeout(() => {
    updatePlateDashboard().catch(err => console.error("更新仪表板失败:", err));
    dashboardUpdateTimer = null;
  }, 1000);
}

function updatePlatePageInfo() {
  const plateListEl = document.getElementById("plateList");
  if (!plateListEl) return;
  
  const allCards = Array.from(plateListEl.querySelectorAll(".plate-card"));
  const visibleCards = allCards.filter(card => {
    const plate = String(card.dataset.plate || "").toLowerCase();
    const ts = Number(card.dataset.ts || 0) || 0;
    const day = toLocalIsoDate(ts);
    const q = String(lastPlateQueryState.plateText || "").trim().toLowerCase();
    const dateVal = String(lastPlateQueryState.date || "").trim();
    const matchPlate = !q || plate.includes(q);
    const matchDate = !dateVal || day === dateVal;
    return matchPlate && matchDate;
  });
  
  const pageSize = Math.max(1, Math.min(200, Number(plateTableState.pageSize) || 10));
  const totalPages = Math.max(1, Math.ceil(visibleCards.length / pageSize));
  const currentPage = Math.max(1, Math.min(totalPages, Number(plateTableState.page) || 1));
  
  if (els.platePageInfo) {
    els.platePageInfo.textContent = `${currentPage} / ${totalPages}`;
  }
  
  if (els.platePrevPageBtn) {
    els.platePrevPageBtn.disabled = currentPage <= 1;
  }
  if (els.plateNextPageBtn) {
    els.plateNextPageBtn.disabled = currentPage >= totalPages;
  }
}

function updatePlatePageInfoLight() {
  // 轻量级页面信息更新，不进行过滤计算
  const plateListEl = document.getElementById("plateList");
  if (!plateListEl) return;
  
  // 只获取所有卡片数量，不进行过滤
  const allCards = plateListEl.querySelectorAll(".plate-card");
  const totalCards = allCards.length;
  
  const pageSize = Math.max(1, Math.min(200, Number(plateTableState.pageSize) || 10));
  const totalPages = Math.max(1, Math.ceil(totalCards / pageSize));
  const currentPage = Math.max(1, Math.min(totalPages, Number(plateTableState.page) || 1));
  
  if (els.platePageInfo) {
    els.platePageInfo.textContent = `${currentPage} / ${totalPages}`;
  }
  
  if (els.platePrevPageBtn) {
    els.platePrevPageBtn.disabled = currentPage <= 1;
  }
  
  if (els.plateNextPageBtn) {
    els.plateNextPageBtn.disabled = currentPage >= totalPages;
  }
}

function updatePlateSortHeaderUi() {
  const wrap = els.plateTableWrap;
  if (!wrap) return;
  const labelMap = { plate: "车牌号", time: "时间", image: "图片", serial: "串口发送" };
  const btns = Array.from(wrap.querySelectorAll(".thBtn"));
  for (const b of btns) {
    if (!(b instanceof HTMLButtonElement)) continue;
    const k = String(b.dataset.sort || "");
    const base = labelMap[k] || b.textContent || "";
    const isActive = k === plateTableState.sortKey;
    const arrow = isActive ? (plateTableState.sortDir === "asc" ? " ↑" : " ↓") : "";
    b.textContent = `${base}${arrow}`;
  }
}

function renderPlateTable() {
  if (!els.plateTableWrap || !els.plateTableBody) return;
  const all = getAllPlateRecords();
  const query = getPlateQueryStateFromUi();
  lastPlateQueryState = { plateText: query.plateText, date: query.date };
  const filtered = filterPlateRecords(all, query);

  filtered.sort((a, b) => compareRecords(a, b, plateTableState.sortKey, plateTableState.sortDir));

  const pageSize = Math.max(1, Math.min(200, Number(plateTableState.pageSize) || 10));
  plateTableState.pageSize = pageSize;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  plateTableState.page = Math.max(1, Math.min(totalPages, Number(plateTableState.page) || 1));

  const startIdx = (plateTableState.page - 1) * pageSize;
  const pageItems = filtered.slice(startIdx, startIdx + pageSize);
  plateTableVisibleIds = pageItems.map((r) => String(r.id || "")).filter(Boolean);

  els.plateTableBody.textContent = "";
  updatePlatePageInfo();
  for (const rec of pageItems) {
    const id = String(rec?.id || "");
    if (!id) continue;
    const plate = String(rec?.plate || "");
    const ts = getRecordTs(rec);
    const timeText = formatDateTime(ts) || "";
    const hasImage = String(rec?.imageDataUrl || "") ? "有" : "无";
    const serialText = Number(rec?.serialSentAt || 0) ? formatDateTime(rec.serialSentAt) : "--";
    const selected = plateSelectedIds.has(id);
    const tr = document.createElement("tr");
    tr.className = selected ? "plate-row selected" : "plate-row";
    tr.dataset.recordId = id;

    const tdCheck = document.createElement("td");
    const input = document.createElement("input");
    input.className = "plate-row-check";
    input.dataset.recordId = id;
    input.type = "checkbox";
    input.checked = selected;
    tdCheck.appendChild(input);

    const tdPlate = document.createElement("td");
    tdPlate.textContent = plate;
    const tdTime = document.createElement("td");
    tdTime.textContent = timeText;
    const tdImage = document.createElement("td");
    tdImage.textContent = hasImage;
    const tdSerial = document.createElement("td");
    tdSerial.textContent = serialText;

    tr.append(tdCheck, tdPlate, tdTime, tdImage, tdSerial);
    els.plateTableBody.appendChild(tr);
  }

  if (!pageItems.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.style.padding = "18px";
    td.style.color = "#6b7280";
    td.style.textAlign = "center";
    td.textContent = "暂无数据";
    tr.appendChild(td);
    els.plateTableBody.appendChild(tr);
  }

  updatePlatePageInfo();


  updatePlateSortHeaderUi();
  updatePlateDashboard().catch(err => console.error("更新仪表板失败:", err));
  updatePlateBulkUi();
}

function initPlateTableUi() {
  if (els.plateViewCardsBtn) els.plateViewCardsBtn.addEventListener("click", () => setPlateView("cards"));
  if (els.plateViewTableBtn) els.plateViewTableBtn.addEventListener("click", () => setPlateView("table"));
  if (els.platePageSize) {
    els.platePageSize.value = String(plateTableState.pageSize);
    els.platePageSize.addEventListener("change", () => {
      plateTableState.pageSize = Number(els.platePageSize.value || 10) || 10;
      plateTableState.page = 1;
      if (plateUiState.view === "table") {
        renderPlateTable();
      } else {
        applyPlateFiltersFromUi().catch(err => console.error("更改页大小时过滤失败:", err));
      }
    });
  }
  if (els.platePrevPageBtn) {
    els.platePrevPageBtn.addEventListener("click", () => {
      plateTableState.page = Math.max(1, plateTableState.page - 1);
      if (plateUiState.view === "table") {
        renderPlateTable();
      } else {
        applyPlateFiltersFromUi().catch(err => console.error("上一页过滤失败:", err));
      }
    });
  }
  if (els.plateNextPageBtn) {
    els.plateNextPageBtn.addEventListener("click", () => {
      plateTableState.page = plateTableState.page + 1;
      if (plateUiState.view === "table") {
        renderPlateTable();
      } else {
        applyPlateFiltersFromUi().catch(err => console.error("下一页过滤失败:", err));
      }
    });
  }
  if (els.plateTableWrap) {
    els.plateTableWrap.addEventListener("click", (ev) => {
      const target = ev.target;
      if (target instanceof HTMLInputElement && target.classList.contains("plate-row-check")) {
        const id = String(target.dataset.recordId || "");
        setPlateSelectedById(id, target.checked);
        return;
      }
      const thBtn = target instanceof HTMLElement ? target.closest(".thBtn") : null;
      if (thBtn instanceof HTMLButtonElement) {
        const k = String(thBtn.dataset.sort || "");
        if (!k) return;
        if (plateTableState.sortKey === k) {
          plateTableState.sortDir = plateTableState.sortDir === "asc" ? "desc" : "asc";
        } else {
          plateTableState.sortKey = k;
          plateTableState.sortDir = k === "plate" ? "asc" : "desc";
        }
        plateTableState.page = 1;
        renderPlateTable();
        return;
      }
      // 移除单击表格行弹出详细页面的逻辑，改为双击
    });
    
    // 添加双击事件监听器
    els.plateTableWrap.addEventListener("dblclick", (ev) => {
      const target = ev.target;
      const row = target instanceof HTMLElement ? target.closest(".plate-row") : null;
      if (row instanceof HTMLTableRowElement) {
        const id = String(row.dataset.recordId || "");
        if (id) openPlateDetailById(id);
      }
    });
  }
  setPlateView("cards");
}

function initPlateDashboardUi() {
  updatePlateDashboard().catch(err => console.error("更新仪表板失败:", err));
  setInterval(() => {
    updatePlateDashboard().catch(err => console.error("定时更新仪表板失败:", err));
  }, 5000);
}

function initPlateModule() {
  initPlateDetailModalUi();
  initPlateTableUi();
  initPlateDashboardUi();
  loadPlateHistoryToUi().catch(() => {});
  const runQuery = () => {
    applyPlateFiltersFromUi().catch(err => console.error("查询失败:", err));
  };
  if (els.plateQueryBtn) els.plateQueryBtn.addEventListener("click", runQuery);
  if (els.plateSearchInput) {
    els.plateSearchInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") runQuery();
    });
  }
  if (els.plateDateInput) {
    els.plateDateInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") runQuery();
    });
  }
  if (els.plateSelectAll) {
    els.plateSelectAll.addEventListener("change", () => {
      const on = Boolean(els.plateSelectAll?.checked);
      if (plateUiState.view === "table") {
        for (const id of plateTableVisibleIds) setPlateSelectedById(id, on);
        return;
      }
      const cards = Array.from(document.querySelectorAll(".plate-card:not(.hidden)"));
      for (const card of cards) {
        const id = String(card.dataset.recordId || "");
        if (!id) continue;
        setPlateSelectedById(id, on);
      }
    });
  }
  if (els.plateSelectAllBtn) {
    els.plateSelectAllBtn.addEventListener("click", () => {
      // 获取当前页所有可见的记录ID
      let visibleIds = [];
      if (plateUiState.view === "table") {
        visibleIds = plateTableVisibleIds.slice();
      } else {
        const cards = Array.from(document.querySelectorAll(".plate-card:not(.hidden)"));
        visibleIds = cards.map((el) => String(el.dataset.recordId || "")).filter(Boolean);
      }
      
      if (!visibleIds.length) return;
      
      // 检查当前页是否已经全部选中
      const allSelected = visibleIds.every(id => plateSelectedIds.has(id));
      
      // 切换选择状态：如果已全选则取消全选，否则全选
      const newState = !allSelected;
      
      for (const id of visibleIds) {
        setPlateSelectedById(id, newState);
      }
      
      if (newState) {
        logLine(`已全选当前页 ${visibleIds.length} 条记录`);
      } else {
        logLine(`已取消全选当前页 ${visibleIds.length} 条记录`);
      }
    });
  }
  if (els.plateDeleteBtn) {
    els.plateDeleteBtn.addEventListener("click", async () => {
      const ids = Array.from(plateSelectedIds);
      if (!ids.length) return;
      
      const originalText = els.plateDeleteBtn.textContent;
      if (els.plateDeleteBtn) {
        els.plateDeleteBtn.disabled = true;
        els.plateDeleteBtn.textContent = `删除中...`;
      }
      
      // 显示加载动画
      showLoading(`正在删除...`);
      
      try {
        // 显示开始删除的提示
        logLine(`开始删除 ${ids.length} 条记录...`);
        
        // 分批删除以避免请求过大
        const batchSize = 100;
        let deletedCount = 0;
        let totalBatches = Math.ceil(ids.length / batchSize);
        
        for (let i = 0; i < ids.length; i += batchSize) {
          const batchIds = ids.slice(i, i + batchSize);
          const currentBatch = Math.floor(i / batchSize) + 1;
          
          // 更新加载动画的进度显示
          showLoading(`正在删除...`);
          
          try {
            const result = await fetchJson("/api/plates/delete", { ids: batchIds });
            const batchDeleted = result?.dbDeleted || 0;
            deletedCount += batchDeleted;
            
            // 显示批次删除结果
            let batchMessage = `批次 ${currentBatch}: 删除 ${batchDeleted} 条记录`;
            if (result?.imagesDeleted > 0) {
              batchMessage += `，删除 ${result.imagesDeleted} 个图片文件`;
            }
            logLine(batchMessage);
            
            // 短暂延迟以避免过快的请求
            if (i + batchSize < ids.length) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          } catch (error) {
            logLine(`批次删除失败: ${error.message}`);
            // 继续尝试删除其他批次
          }
        }
        
        // 清空选中状态
        plateSelectedIds.clear();
        
        // 更新加载动画显示刷新数据
        showLoading("正在删除...");
        
        // 删除后自动刷新数据
        logLine("正在删除...");
        await applyPlateFiltersFromUi();
        
        // 更新仪表板
        updatePlateDashboard().catch(err => console.error("删除后更新仪表板失败:", err));
        
        logLine(`删除完成，共删除 ${deletedCount} 条记录`);
        
      } catch (error) {
        logLine(`删除失败: ${error.message}`);
      } finally {
        // 隐藏加载动画
        hideLoading();
        
        if (els.plateDeleteBtn) {
          els.plateDeleteBtn.disabled = false;
          els.plateDeleteBtn.textContent = originalText;
        }
        updatePlateBulkUi();
      }
    });
  }
  if (els.plateDownloadBtn) {
    els.plateDownloadBtn.addEventListener("click", async () => {
      const ids = Array.from(plateSelectedIds);
      if (!ids.length) return;
      if (els.plateDownloadBtn) els.plateDownloadBtn.disabled = true;
      
      try {
        logLine(`开始下载 ${ids.length} 张图片...`);
        
        // 获取选中记录的图片信息
        const recordsToDownload = [];
        for (const id of ids) {
          const record = plateById.get(id);
          if (record && record.id) {
            recordsToDownload.push({
              id: record.id,
              plate: record.plate || "未知车牌",
              receivedAt: record.receivedAt || new Date().toISOString(),
              imagePath: record.imagePath || "",
              ftpRemotePath: record.ftpRemotePath || ""
            });
          }
        }
        
        if (recordsToDownload.length === 0) {
          logLine("选中的记录没有图片可下载");
          return;
        }
        
        // 批量下载图片 - 使用限制并行的方式提高速度
        logLine(`开始下载 ${recordsToDownload.length} 张图片...`);
        
        // 限制并行下载数量，避免浏览器过载
        const MAX_CONCURRENT_DOWNLOADS = 3;
        let successfulDownloads = 0;
        let failedDownloads = 0;
        let completedDownloads = 0;
        
        // 分批下载函数
        const downloadBatch = async (batch) => {
          const batchPromises = batch.map(record => 
            downloadPlateImage(record).then(() => {
              completedDownloads++;
              logLine(`已下载: ${record.plate} (${completedDownloads}/${recordsToDownload.length})`);
              successfulDownloads++;
              return { success: true, plate: record.plate };
            }).catch(error => {
              completedDownloads++;
              console.error(`下载图片失败 ${record.plate}:`, error);
              logLine(`下载失败: ${record.plate} (${completedDownloads}/${recordsToDownload.length})`);
              failedDownloads++;
              return { success: false, plate: record.plate, error };
            })
          );
          
          await Promise.allSettled(batchPromises);
        };
        
        // 分批下载
        for (let i = 0; i < recordsToDownload.length; i += MAX_CONCURRENT_DOWNLOADS) {
          const batch = recordsToDownload.slice(i, i + MAX_CONCURRENT_DOWNLOADS);
          await downloadBatch(batch);
        }
        
        logLine(`下载完成: ${successfulDownloads} 成功, ${failedDownloads} 失败`);
        
      } catch (error) {
        console.error("下载过程出错:", error);
        logLine("下载过程出错");
      } finally {
        updatePlateBulkUi();
      }
    });
  }
}

async function downloadPlateImage(record) {
  if (!record || !record.id) {
    throw new Error("无效的记录");
  }
  
  try {
    // 构建图片URL - 使用记录ID
    const imageUrl = `/api/plates/image/${encodeURIComponent(record.id)}`;
    
    // 获取图片数据 - 使用更高效的请求方式
    const response = await fetch(imageUrl, {
      // 使用缓存策略，避免重复请求
      cache: 'no-cache',
      // 设置优先级
      priority: 'high',
      // 添加超时处理
      signal: AbortSignal.timeout(30000) // 30秒超时
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    // 检查内容类型和大小
    const contentType = response.headers.get('content-type') || '';
    const contentLength = response.headers.get('content-length');
    
    if (contentLength) {
      const sizeMB = (parseInt(contentLength) / (1024 * 1024)).toFixed(2);
      console.log(`下载图片 ${record.plate}: ${sizeMB} MB`);
    }
    
    const blob = await response.blob();
    
    // 提取原始文件名 - 优先使用ftpRemotePath，其次使用imagePath
    let filename = "image.jpg"; // 默认文件名
    
    // 首先尝试从ftpRemotePath中提取文件名
    if (record.ftpRemotePath) {
      const ftpPathParts = record.ftpRemotePath.split(/[\\/]/);
      if (ftpPathParts.length > 0) {
        filename = ftpPathParts[ftpPathParts.length - 1];
      }
    }
    // 如果没有ftpRemotePath，尝试从imagePath中提取
    else if (record.imagePath) {
      // 从路径中提取文件名（处理Windows和Unix路径）
      const pathParts = record.imagePath.split(/[\\/]/);
      if (pathParts.length > 0) {
        filename = pathParts[pathParts.length - 1];
      }
    } else {
      // 如果都没有，使用车牌和时间戳作为文件名
      const plate = record.plate || "未知车牌";
      const date = record.receivedAt ? new Date(record.receivedAt) : new Date();
      const timestamp = date.toISOString().replace(/[:.]/g, "-").slice(0, 19);
      filename = `${plate}_${timestamp}.jpg`;
    }
    
    // 确保文件名有扩展名
    if (!filename.includes('.')) {
      filename += '.jpg';
    }
    
    // 创建下载链接
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    
    // 清理
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 100);
    
  } catch (error) {
    console.error("下载图片失败:", error);
    throw error;
  }
}

function parseHostPortKey(key) {
  const s = String(key || "");
  const idx = s.lastIndexOf(":");
  if (idx <= 0) return null;
  const host = s.slice(0, idx).trim();
  const p = Number(s.slice(idx + 1));
  const port = Number.isFinite(p) && p > 0 && p <= 65535 ? Math.floor(p) : 80;
  if (!host) return null;
  return { host, port };
}

async function ensureRtspCachedForKey(key) {
  if (!key) return;
  if (rtspByHostPort.has(key) || rtspErrorByHostPort.has(key)) return;
  if (rtspPendingByHostPort.has(key)) return;
  const parsed = parseHostPortKey(key);
  if (!parsed) return;

  const payload = {
    host: parsed.host,
    port: parsed.port,
    username: String(els.userInput?.value || ""),
    password: String(els.passInput?.value || "")
  };

  const p = (async () => {
    try {
      const rtsp = await fetchJson("/api/onvif/stream-uri", payload);
      const v = String(rtsp?.rtspUriWithAuth || rtsp?.rtspUri || "").trim();
      if (v) rtspByHostPort.set(key, v);
      else rtspErrorByHostPort.set(key, "RTSP 获取为空");
    } catch (e) {
      rtspErrorByHostPort.set(key, `RTSP 获取失败：${e.message}`);
    } finally {
      rtspPendingByHostPort.delete(key);
    }
  })();

  rtspPendingByHostPort.set(key, p);
  await p;
}

function readLocalLastConnection() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      host: String(parsed.host || ""),
      port: Number(parsed.port || 80) || 80,
      username: String(parsed.username || ""),
      password: String(parsed.password || ""),
      savedAt: Number(parsed.savedAt || 0) || 0
    };
  } catch {
    return null;
  }
}

async function loadDeviceConfig() {
  try {
    const r = await fetchJsonGet("/api/device/config");
    if (!r?.ok) return null;
    return r.config || null;
  } catch {
    return null;
  }
}

async function persistConnectionToServer({ host, port, username, password }) {
  const payload = {
    connection: {
      host: String(host || "").trim(),
      port: Number(port || 80) || 80,
      username: String(username || ""),
      password: String(password || "")
    }
  };
  try {
    await fetchJson("/api/device/config", payload);
  } catch {}
}

function collectCurrentConnectionForm() {
  const inputPort = Number(els.portInput?.value || 80);
  const parsedHost = parseHostAndPortFromInput(els.hostInput?.value, inputPort);
  return {
    host: parsedHost.host.trim(),
    port: parsedHost.port,
    protocol: String(els.deviceProtocolSelect?.value || "hikvision-isapi").trim() || "hikvision-isapi",
    deviceId: String(els.deviceIdInput?.value || "").trim(),
    name: String(els.deviceNameInput?.value || "").trim(),
    username: String(els.userInput?.value || ""),
    password: String(els.passInput?.value || "")
  };
}

function fillConnectionForm(device) {
  const item = device && typeof device === "object" ? device : null;
  if (els.hostInput) {
    const host = String(item?.host || "");
    const port = String(Number(item?.port || 80) || 80);
    els.hostInput.value = host ? `${host}:${port}` : "";
  }
  if (els.portInput) els.portInput.value = String(Number(item?.port || 80) || 80);
  if (els.deviceProtocolSelect) els.deviceProtocolSelect.value = String(item?.protocol || "hikvision-isapi");
  if (els.deviceIdInput) els.deviceIdInput.value = String(item?.deviceId || "");
  if (els.deviceNameInput) els.deviceNameInput.value = String(item?.name || "");
  if (els.userInput) els.userInput.value = String(item?.username || "");
  if (els.passInput) els.passInput.value = String(item?.password || "");
}

function getManagedDeviceSummaryText(item) {
  const summary = item?.summary && typeof item.summary === "object" ? item.summary : {};
  const parts = [];
  if (summary.model) parts.push(summary.model);
  if (summary.deviceName && summary.deviceName !== item?.name) parts.push(summary.deviceName);
  if (summary.serialNumber) parts.push(summary.serialNumber);
  if (summary.firmwareVersion) parts.push(summary.firmwareVersion);
  return parts.join(" | ") || "--";
}

// 解析FTP配置响应，提取命名规则
function parseFtpConfigResponse(response) {
  try {
    console.log("FTP配置响应:", response);
    
    // 检查是否有XML文本
    if (response?.text) {
      // 尝试解析XML
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(response.text, "text/xml");
      
      // 检查XML解析错误
      const parserError = xmlDoc.querySelector("parsererror");
      if (parserError) {
        console.error("XML解析错误:", parserError.textContent);
        return getFallbackNamingRules();
      }
      
      // 解析海康ISAPI FTP配置XML
      // 根据海康ISAPI文档，FTP配置可能包含以下字段：
      const namingRules = [];
      
      // 1. 基本FTP配置
      const ftpHost = xmlDoc.querySelector("host")?.textContent || 
                     xmlDoc.querySelector("FtpHost")?.textContent ||
                     xmlDoc.querySelector("ftpHost")?.textContent;
      if (ftpHost) {
        namingRules.push({ name: "FTP服务器地址", value: ftpHost });
      }
      
      const ftpPort = xmlDoc.querySelector("port")?.textContent || 
                     xmlDoc.querySelector("FtpPort")?.textContent ||
                     xmlDoc.querySelector("ftpPort")?.textContent;
      if (ftpPort) {
        namingRules.push({ name: "FTP端口", value: ftpPort });
      }
      
      const ftpUsername = xmlDoc.querySelector("userName")?.textContent || 
                         xmlDoc.querySelector("username")?.textContent ||
                         xmlDoc.querySelector("FtpUserName")?.textContent;
      if (ftpUsername) {
        namingRules.push({ name: "FTP用户名", value: ftpUsername });
      }
      
      // 密码通常不显示或显示为星号
      const ftpPassword = xmlDoc.querySelector("password")?.textContent || 
                         xmlDoc.querySelector("FtpPassword")?.textContent;
      if (ftpPassword) {
        namingRules.push({ name: "FTP密码", value: "********" });
      }
      
      // 2. 上传目录和文件命名规则
      const uploadDirectory = xmlDoc.querySelector("directory")?.textContent || 
                            xmlDoc.querySelector("uploadDirectory")?.textContent ||
                            xmlDoc.querySelector("UploadDirectory")?.textContent;
      if (uploadDirectory) {
        namingRules.push({ name: "上传目录", value: uploadDirectory });
      }
      
      // 3. 文件名格式/命名规则
      // 海康ISAPI可能使用fileNameFormat或namingRule等字段
      const fileNameFormat = xmlDoc.querySelector("fileNameFormat")?.textContent || 
                           xmlDoc.querySelector("fileName")?.textContent ||
                           xmlDoc.querySelector("FileNameFormat")?.textContent;
      if (fileNameFormat) {
        namingRules.push({ name: "文件名格式", value: fileNameFormat });
      }
      
      // 4. 通道相关配置
      const channel = xmlDoc.querySelector("channel")?.textContent || 
                     xmlDoc.querySelector("Channel")?.textContent ||
                     xmlDoc.querySelector("channelNo")?.textContent;
      if (channel) {
        namingRules.push({ name: "通道号", value: channel });
      }
      
      // 5. 图片相关配置
      const imageFormat = xmlDoc.querySelector("imageFormat")?.textContent || 
                         xmlDoc.querySelector("ImageFormat")?.textContent ||
                         xmlDoc.querySelector("format")?.textContent;
      if (imageFormat) {
        namingRules.push({ name: "图片格式", value: imageFormat });
      }
      
      const imageQuality = xmlDoc.querySelector("imageQuality")?.textContent || 
                          xmlDoc.querySelector("ImageQuality")?.textContent ||
                          xmlDoc.querySelector("quality")?.textContent;
      if (imageQuality) {
        namingRules.push({ name: "图片质量", value: imageQuality });
      }
      
      // 6. 上传间隔和触发方式
      const uploadInterval = xmlDoc.querySelector("uploadInterval")?.textContent || 
                           xmlDoc.querySelector("UploadInterval")?.textContent ||
                           xmlDoc.querySelector("interval")?.textContent;
      if (uploadInterval) {
        namingRules.push({ name: "上传间隔", value: uploadInterval });
      }
      
      const triggerMode = xmlDoc.querySelector("triggerMode")?.textContent || 
                         xmlDoc.querySelector("TriggerMode")?.textContent ||
                         xmlDoc.querySelector("trigger")?.textContent;
      if (triggerMode) {
        namingRules.push({ name: "触发方式", value: triggerMode });
      }
      
      // 7. 车牌识别相关
      const plateRecognition = xmlDoc.querySelector("plateRecognition")?.textContent || 
                              xmlDoc.querySelector("PlateRecognition")?.textContent ||
                              xmlDoc.querySelector("plateRecog")?.textContent;
      if (plateRecognition) {
        namingRules.push({ name: "车牌识别", value: plateRecognition });
      }
      
      // 8. 命名元素解析
      // 海康ISAPI可能使用namingElements或nameElements字段
      const namingElements = xmlDoc.querySelector("namingElements")?.textContent || 
                           xmlDoc.querySelector("NamingElements")?.textContent ||
                           xmlDoc.querySelector("nameElements")?.textContent;
      
      if (namingElements) {
        // 尝试解析命名元素字符串
        // 可能是逗号分隔的列表或XML结构
        const elements = namingElements.split(/[,;|]/).map(e => e.trim()).filter(e => e);
        elements.forEach((element, index) => {
          namingRules.push({ name: `命名元素${index + 1}`, value: element });
        });
      }
      
      // 9. 如果XML中有其他明显的命名规则字段
      // 查找包含"name"、"naming"、"rule"等关键词的节点
      const allElements = xmlDoc.querySelectorAll("*");
      for (const elem of allElements) {
        const tagName = elem.tagName.toLowerCase();
        const textContent = elem.textContent.trim();
        
        if (textContent && (tagName.includes('name') || tagName.includes('naming') || tagName.includes('rule'))) {
          if (!namingRules.some(r => r.value === textContent)) {
            namingRules.push({ name: tagName, value: textContent });
          }
        }
      }
      
      // 如果找到了命名规则，返回它们
      if (namingRules.length > 0) {
        // 确保最多返回15个元素
        return namingRules.slice(0, 15);
      }
      
      // 如果没有找到明确的命名规则，尝试从原始文本中提取
      return extractNamingRulesFromText(response.text);
    }
    
    // 如果没有XML文本，返回后备数据
    return getFallbackNamingRules();
  } catch (error) {
    console.error("解析FTP配置失败:", error);
    return getFallbackNamingRules();
  }
}

// 从文本中提取命名规则（备用方法）
function extractNamingRulesFromText(text) {
  const rules = [];
  const lines = text.split('\n');
  
  // 查找可能包含命名规则的文本模式
  const patterns = [
    /name[:\s]*([^\n<]+)/i,
    /naming[:\s]*([^\n<]+)/i,
    /rule[:\s]*([^\n<]+)/i,
    /element[:\s]*([^\n<]+)/i,
    /format[:\s]*([^\n<]+)/i,
    /pattern[:\s]*([^\n<]+)/i
  ];
  
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match && match[1]) {
        const value = match[1].trim();
        if (value && !rules.some(r => r.value === value)) {
          rules.push({ name: "命名规则", value });
        }
      }
    }
  }
  
  // 如果从文本中提取到了规则，返回它们
  if (rules.length > 0) {
    return rules.slice(0, 15);
  }
  
  // 否则返回后备数据
  return getFallbackNamingRules();
}

// 获取后备命名规则数据
function getFallbackNamingRules() {
  return [
    { name: "设备名", value: "IP CAPTURE CAMERA" },
    { name: "设备号", value: "0007" },
    { name: "设备IP", value: "192.168.11.253" },
    { name: "通道名", value: "主通道" },
    { name: "通道号", value: "01" },
    { name: "时间", value: "20260420155141157" },
    { name: "车牌号码", value: "京A12345" },
    { name: "车牌颜色", value: "蓝色" },
    { name: "车道号", value: "1" },
    { name: "车辆速度", value: "60" },
    { name: "监测点1", value: "33333" },
    { name: "图片序号", value: "00001" },
    { name: "车辆序号", value: "13050" },
    { name: "限速标志", value: "80" },
    { name: "车牌坐标", value: "X0Y0W0H0" }
  ];
}

// 专门提取摄像头图片命名规则元素
function extractCameraNamingElements(response) {
  try {
    console.log("提取摄像头命名元素，响应:", response);
    
    // 检查是否有XML文本
    if (response?.text) {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(response.text, "text/xml");
      
      // 检查XML解析错误
      const parserError = xmlDoc.querySelector("parsererror");
      if (parserError) {
        console.error("XML解析错误:", parserError.textContent);
        return null;
      }
      
      // 海康ISAPI中，图片命名规则通常在以下节点中：
      // 1. <PictureNamingRule> 或 <pictureNamingRule>
      // 2. <FileNameFormat> 或 <fileNameFormat>
      // 3. <NamingElements> 或 <namingElements>
      // 4. <NameElements> 或 <nameElements>
      
      const namingElements = [];
      
      // 尝试查找命名规则相关节点
      const namingRuleNodes = [
        xmlDoc.querySelector("PictureNamingRule"),
        xmlDoc.querySelector("pictureNamingRule"),
        xmlDoc.querySelector("FileNameFormat"),
        xmlDoc.querySelector("fileNameFormat"),
        xmlDoc.querySelector("NamingElements"),
        xmlDoc.querySelector("namingElements"),
        xmlDoc.querySelector("NameElements"),
        xmlDoc.querySelector("nameElements")
      ].filter(node => node);
      
      // 如果找到命名规则节点
      if (namingRuleNodes.length > 0) {
        for (const node of namingRuleNodes) {
          const text = node.textContent.trim();
          if (text) {
            // 尝试解析命名规则文本
            // 可能是逗号分隔的列表，如："设备名,设备号,时间,车牌号码"
            const elements = text.split(/[,;|]/).map(e => e.trim()).filter(e => e);
            elements.forEach(element => {
              if (!namingElements.includes(element)) {
                namingElements.push(element);
              }
            });
          }
        }
      }
      
      // 如果从命名规则节点中提取到了元素，返回它们
      if (namingElements.length > 0) {
        console.log("从命名规则节点提取的元素:", namingElements);
        return namingElements;
      }
      
      // 如果没有找到明确的命名规则节点，尝试查找包含命名元素的子节点
      // 海康ISAPI可能使用 <element1>, <element2> 等节点
      const elementNodes = xmlDoc.querySelectorAll("*[id^='element'], *[name^='element'], element, Element");
      for (const node of elementNodes) {
        const text = node.textContent.trim();
        if (text && !namingElements.includes(text)) {
          namingElements.push(text);
        }
      }
      
      // 如果找到了元素节点，返回它们
      if (namingElements.length > 0) {
        console.log("从元素节点提取的元素:", namingElements);
        return namingElements;
      }
      
      // 最后，尝试从整个XML中提取可能的命名元素
      // 查找包含常见命名关键词的节点
      const commonNamingKeywords = [
        "设备", "通道", "时间", "车牌", "车辆", "车道", "速度", 
        "监测", "图片", "序号", "坐标", "颜色", "品牌", "型号",
        "年份", "标志", "限速", "自定义", "无"
      ];
      
      const allNodes = xmlDoc.querySelectorAll("*");
      for (const node of allNodes) {
        const text = node.textContent.trim();
        if (text && text.length < 20) { // 命名元素通常较短
          // 检查是否包含常见命名关键词
          const hasKeyword = commonNamingKeywords.some(keyword => 
            text.includes(keyword) || node.tagName.toLowerCase().includes(keyword)
          );
          
          if (hasKeyword && !namingElements.includes(text)) {
            namingElements.push(text);
          }
        }
      }
      
      if (namingElements.length > 0) {
        console.log("从关键词匹配提取的元素:", namingElements);
        return namingElements;
      }
    }
    
    // 如果没有找到任何命名元素，返回null
    return null;
    
  } catch (error) {
    console.error("提取摄像头命名元素失败:", error);
    return null;
  }
}

// 加载完整的ISAPI FTP配置信息
async function loadIsapiFtpConfigForRecord(record) {
  try {
    // 尝试从记录中提取设备信息
    // 这里需要根据实际的数据结构进行调整
    
    // 首先尝试从parsedMeta中提取设备信息
    let deviceInfo = {
      host: record.parsedMeta?.deviceIp || "192.168.11.253",
      port: 80, // 默认HTTP端口
      username: "admin", // 默认用户名
      password: "admin123" // 默认密码
    };
    
    // 如果记录中有设备连接信息，优先使用
    if (record.deviceConnection) {
      deviceInfo = {
        host: record.deviceConnection.host || deviceInfo.host,
        port: record.deviceConnection.port || deviceInfo.port,
        username: record.deviceConnection.username || deviceInfo.username,
        password: record.deviceConnection.password || deviceInfo.password
      };
    }
    
    console.log("尝试获取ISAPI FTP配置，设备信息:", {
      host: deviceInfo.host,
      port: deviceInfo.port,
      username: deviceInfo.username ? "***" : "未设置"
    });
    
    // 尝试调用服务器API获取FTP配置和抓拍配置
    try {
      // 获取FTP配置
      const ftpResponse = await fetchJson("/api/device/ftp-config", { 
        connection: deviceInfo
      });
      
      // 解析完整的FTP配置信息
      const namingRules = parseFtpConfigResponse(ftpResponse);
      
      if (namingRules) {
        console.log("成功获取ISAPI命名规则:", namingRules);
        
        // 提取摄像头图片命名规则元素
        const cameraNamingElements = extractCameraNamingElements(ftpResponse);
        
        // 尝试获取抓拍配置
        let snapshotConfig = null;
        try {
          // 这里可以调用抓拍配置的API，暂时使用模拟数据
          snapshotConfig = {
            // 抓拍触发配置
            triggerMode: "视频触发", // 视频触发/IO触发/手动触发
            sensitivity: 85, // 灵敏度百分比
            minVehicleSize: 50, // 最小车辆尺寸（像素）
            maxVehicleSize: 800, // 最大车辆尺寸（像素）
            
            // 图像处理配置
            imageResolution: "1920x1080", // 图像分辨率
            imageQuality: 90, // 图像质量百分比
            exposureMode: "自动", // 曝光模式
            whiteBalance: "自动", // 白平衡
            brightness: 50, // 亮度
            contrast: 50, // 对比度
            saturation: 50, // 饱和度
            
            // 车牌识别配置
            plateRecognitionEnabled: true,
            recognitionRegion: "全画面", // 识别区域
            minPlateWidth: 80, // 最小车牌宽度（像素）
            maxPlateWidth: 300, // 最大车牌宽度（像素）
            plateColorDetection: true, // 车牌颜色检测
            vehicleTypeDetection: true, // 车辆类型检测
            
            // 抓拍规则配置
            captureDelay: 0, // 抓拍延迟（毫秒）
            preCaptureFrames: 5, // 预抓拍帧数
            postCaptureFrames: 10, // 后抓拍帧数
            maxCapturePerVehicle: 3, // 每辆车最大抓拍数
            
            // 其他配置
            antiFlicker: "关闭", // 抗闪烁
            dayNightMode: "自动", // 日夜模式
            infraredCompensation: true, // 红外补偿
            isRealData: false // 标记为模拟数据
          };
        } catch (snapshotError) {
          console.log("获取抓拍配置失败，使用默认配置:", snapshotError.message);
          snapshotConfig = null;
        }
        
        // 从命名规则中提取FTP配置信息
        const extractFromNamingRules = (rules, key) => {
          if (!rules || !Array.isArray(rules)) return null;
          const rule = rules.find(r => r.name && r.name.toLowerCase().includes(key.toLowerCase()));
          return rule ? rule.value : null;
        };
        
        // 构建完整的配置对象
        const fullFtpConfig = {
          // 基本FTP配置
          serverAddress: extractFromNamingRules(namingRules, "ftp服务器地址") || 
                        extractFromNamingRules(namingRules, "host") || 
                        "未配置",
          serverPort: parseInt(extractFromNamingRules(namingRules, "ftp端口") || 
                              extractFromNamingRules(namingRules, "port") || 
                              "21"),
          username: extractFromNamingRules(namingRules, "ftp用户名") || 
                   extractFromNamingRules(namingRules, "username") || 
                   "未配置",
          password: extractFromNamingRules(namingRules, "ftp密码") ? "***" : "未配置",
          remotePath: extractFromNamingRules(namingRules, "上传目录") || 
                     extractFromNamingRules(namingRules, "directory") || 
                     "/",
          uploadEnabled: true,
          
          // FTP传输配置
          transferMode: "PASV", // PASV/ACTIVE
          encoding: "UTF-8",
          timeout: 30, // 秒
          retryCount: 3,
          keepAlive: true,
          
          // 文件上传配置
          fileType: "JPEG",
          quality: 85, // 图片质量百分比
          maxFileSize: 1024, // KB
          uploadInterval: 0, // 秒，0表示实时上传
          
          // 命名规则相关
          namingRules: namingRules || [],
          cameraNamingElements: cameraNamingElements || [],
          namingFormat: extractFromNamingRules(namingRules, "文件名格式") || "默认格式",
          separator: "_",
          
          // 抓拍配置
          snapshotConfig: snapshotConfig,
          
          // 其他配置信息
          connectionInfo: deviceInfo,
          responseTime: new Date().toISOString(),
          isRealData: true,
          
          // 原始响应（用于调试）
          rawResponse: ftpResponse.text ? ftpResponse.text.substring(0, 500) + "..." : "无原始响应"
        };
        
        return fullFtpConfig;
      } else {
        console.warn("FTP配置解析失败，使用默认配置");
        throw new Error("FTP配置解析失败");
      }
      
    } catch (apiError) {
      console.log("获取ISAPI FTP配置失败，使用默认配置:", apiError.message);
      
      // 使用默认配置作为后备
      return {
        // 基本FTP配置
        serverAddress: "192.168.11.100",
        serverPort: 21,
        username: "ftpuser",
        password: "***",
        remotePath: "/upload/",
        uploadEnabled: true,
        
        // FTP传输配置
        transferMode: "PASV",
        encoding: "UTF-8",
        timeout: 30,
        retryCount: 3,
        keepAlive: true,
        
        // 文件上传配置
        fileType: "JPEG",
        quality: 85,
        maxFileSize: 1024,
        uploadInterval: 0,
        
        // 命名规则相关
        namingRules: getFallbackNamingRules(),
        cameraNamingElements: [
          "无", "自定义", "设备名", "设备号", "设备IP", "通道名", "通道号",
          "时间", "车牌号码", "车牌颜色", "车道号", "车辆速度", "监测点1",
          "图片序号", "车辆序号", "限速标志", "车牌坐标", "车辆类型",
          "车辆颜色", "车辆品牌", "车辆型号", "车辆年份", "自定义文本"
        ],
        namingFormat: "默认格式",
        separator: "_",
        
        // 抓拍配置
        snapshotConfig: {
          triggerMode: "视频触发",
          sensitivity: 85,
          minVehicleSize: 50,
          maxVehicleSize: 800,
          imageResolution: "1920x1080",
          imageQuality: 90,
          exposureMode: "自动",
          whiteBalance: "自动",
          brightness: 50,
          contrast: 50,
          saturation: 50,
          plateRecognitionEnabled: true,
          recognitionRegion: "全画面",
          minPlateWidth: 80,
          maxPlateWidth: 300,
          plateColorDetection: true,
          vehicleTypeDetection: true,
          captureDelay: 0,
          preCaptureFrames: 5,
          postCaptureFrames: 10,
          maxCapturePerVehicle: 3,
          antiFlicker: "关闭",
          dayNightMode: "自动",
          infraredCompensation: true,
          isRealData: false
        },
        
        // 其他配置信息
        connectionInfo: deviceInfo,
        responseTime: new Date().toISOString(),
        isRealData: false,
        rawResponse: "使用默认配置，ISAPI接口调用失败"
      };
    }
    
  } catch (error) {
    console.error("加载ISAPI FTP配置失败:", error);
    
    // 返回最简化的后备配置
    return {
      serverAddress: "未配置",
      serverPort: 21,
      username: "未配置",
      password: "未配置",
      remotePath: "/",
      uploadEnabled: false,
      transferMode: "PASV",
      encoding: "UTF-8",
      timeout: 30,
      retryCount: 3,
      keepAlive: true,
      fileType: "JPEG",
      quality: 85,
      maxFileSize: 1024,
      uploadInterval: 0,
      namingRules: [],
      cameraNamingElements: [],
      namingFormat: "默认格式",
      separator: "_",
      snapshotConfig: null,
      connectionInfo: { host: "未知", port: 80, username: "未知" },
      responseTime: new Date().toISOString(),
      isRealData: false,
      rawResponse: "配置加载失败: " + error.message
    };
  }
}

// 兼容性函数：保持原有接口
async function loadIsapiNamingRulesForRecord(record) {
  const ftpConfig = await loadIsapiFtpConfigForRecord(record);
  return ftpConfig.cameraNamingElements.slice(0, 23);
}

// 格式化ISAPI命名规则显示（返回文本格式，用于其他用途）
function formatIsapiNamingRules(rules) {
  if (!Array.isArray(rules) || rules.length === 0) {
    return "无ISAPI命名规则数据";
  }
  
  // 按顺序显示所有命名规则，格式为"1：规则1 2：规则2 ... N：规则N"
  const formattedRules = rules.map((rule, index) => {
    return `${index + 1}：${rule}`;
  });
  
  // 添加统计信息
  const stats = `（共${rules.length}个命名元素）`;
  
  return formattedRules.join(" ") + stats;
}

// 格式化完整的ISAPI FTP配置显示
function formatFullIsapiFtpConfig(ftpConfig) {
  if (!ftpConfig || typeof ftpConfig !== 'object') {
    return '<div style="color: #dc2626; font-style: italic;">无ISAPI FTP配置数据</div>';
  }
  
  const isRealData = ftpConfig.isRealData === true;
  const dataSourceBadge = isRealData ? 
    '<span style="font-size: 10px; color: #059669; background: rgba(5, 150, 105, 0.1); padding: 2px 6px; border-radius: 3px; margin-left: 6px; font-weight: 500;">实时数据</span>' :
    '<span style="font-size: 10px; color: #dc2626; background: rgba(220, 38, 38, 0.1); padding: 2px 6px; border-radius: 3px; margin-left: 6px; font-weight: 500;">默认数据</span>';
  
  let html = '';
  
  // 1. 配置标题和状态
  html += `<div style="margin-bottom: 16px;">
    <div style="display: flex; align-items: center; margin-bottom: 8px;">
      <div style="font-size: 14px; color: #475569; font-weight: 600;">ISAPI FTP完整配置</div>
      ${dataSourceBadge}
    </div>
    <div style="font-size: 11px; color: #64748b;">
      获取时间: ${new Date(ftpConfig.responseTime).toLocaleString('zh-CN')}
      ${isRealData ? '• 成功从摄像头获取' : '• 使用默认配置'}
    </div>
  </div>`;
  
  // 2. 基本FTP配置
  html += `<div style="margin-bottom: 16px;">
    <div style="font-size: 13px; color: #475569; font-weight: 600; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid rgba(226, 232, 240, 0.8);">📁 基本FTP配置</div>
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
      <div><span style="color: #64748b; font-size: 12px;">服务器地址:</span> <span style="color: #334155; font-weight: 500;">${ftpConfig.serverAddress}</span></div>
      <div><span style="color: #64748b; font-size: 12px;">端口:</span> <span style="color: #334155; font-weight: 500;">${ftpConfig.serverPort}</span></div>
      <div><span style="color: #64748b; font-size: 12px;">用户名:</span> <span style="color: #334155; font-weight: 500;">${ftpConfig.username}</span></div>
      <div><span style="color: #64748b; font-size: 12px;">密码:</span> <span style="color: #334155; font-weight: 500;">${ftpConfig.password}</span></div>
      <div><span style="color: #64748b; font-size: 12px;">远程路径:</span> <span style="color: #334155; font-weight: 500;">${ftpConfig.remotePath}</span></div>
      <div><span style="color: #64748b; font-size: 12px;">上传启用:</span> <span style="color: ${ftpConfig.uploadEnabled ? '#059669' : '#dc2626'}; font-weight: 500;">${ftpConfig.uploadEnabled ? '是' : '否'}</span></div>
    </div>
  </div>`;
  
  // 3. FTP传输配置
  html += `<div style="margin-bottom: 16px;">
    <div style="font-size: 13px; color: #475569; font-weight: 600; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid rgba(226, 232, 240, 0.8);">⚡ FTP传输配置</div>
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
      <div><span style="color: #64748b; font-size: 12px;">传输模式:</span> <span style="color: #334155; font-weight: 500;">${ftpConfig.transferMode}</span></div>
      <div><span style="color: #64748b; font-size: 12px;">编码格式:</span> <span style="color: #334155; font-weight: 500;">${ftpConfig.encoding}</span></div>
      <div><span style="color: #64748b; font-size: 12px;">超时时间:</span> <span style="color: #334155; font-weight: 500;">${ftpConfig.timeout}秒</span></div>
      <div><span style="color: #64748b; font-size: 12px;">重试次数:</span> <span style="color: #334155; font-weight: 500;">${ftpConfig.retryCount}次</span></div>
      <div><span style="color: #64748b; font-size: 12px;">保持连接:</span> <span style="color: ${ftpConfig.keepAlive ? '#059669' : '#dc2626'}; font-weight: 500;">${ftpConfig.keepAlive ? '是' : '否'}</span></div>
    </div>
  </div>`;
  
  // 4. 文件上传配置
  html += `<div style="margin-bottom: 16px;">
    <div style="font-size: 13px; color: #475569; font-weight: 600; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid rgba(226, 232, 240, 0.8);">📸 文件上传配置</div>
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
      <div><span style="color: #64748b; font-size: 12px;">文件类型:</span> <span style="color: #334155; font-weight: 500;">${ftpConfig.fileType}</span></div>
      <div><span style="color: #64748b; font-size: 12px;">图片质量:</span> <span style="color: #334155; font-weight: 500;">${ftpConfig.quality}%</span></div>
      <div><span style="color: #64748b; font-size: 12px;">最大文件:</span> <span style="color: #334155; font-weight: 500;">${ftpConfig.maxFileSize}KB</span></div>
      <div><span style="color: #64748b; font-size: 12px;">上传间隔:</span> <span style="color: #334155; font-weight: 500;">${ftpConfig.uploadInterval === 0 ? '实时上传' : ftpConfig.uploadInterval + '秒'}</span></div>
      <div><span style="color: #64748b; font-size: 12px;">命名格式:</span> <span style="color: #334155; font-weight: 500;">${ftpConfig.namingFormat}</span></div>
      <div><span style="color: #64748b; font-size: 12px;">分隔符:</span> <span style="color: #334155; font-weight: 500;">${ftpConfig.separator}</span></div>
    </div>
  </div>`;
  
  // 5. 连接信息
  html += `<div style="margin-bottom: 16px;">
    <div style="font-size: 13px; color: #475569; font-weight: 600; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid rgba(226, 232, 240, 0.8);">🔗 摄像头连接信息</div>
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
      <div><span style="color: #64748b; font-size: 12px;">IP地址:</span> <span style="color: #334155; font-weight: 500;">${ftpConfig.connectionInfo?.host || '未知'}</span></div>
      <div><span style="color: #64748b; font-size: 12px;">端口:</span> <span style="color: #334155; font-weight: 500;">${ftpConfig.connectionInfo?.port || 80}</span></div>
      <div><span style="color: #64748b; font-size: 12px;">用户名:</span> <span style="color: #334155; font-weight: 500;">${ftpConfig.connectionInfo?.username || '未知'}</span></div>
      <div><span style="color: #64748b; font-size: 12px;">密码:</span> <span style="color: #334155; font-weight: 500;">${ftpConfig.connectionInfo?.password ? '***' : '未设置'}</span></div>
    </div>
  </div>`;
  
  // 6. 抓拍配置
  if (ftpConfig.snapshotConfig && typeof ftpConfig.snapshotConfig === 'object') {
    const snapshot = ftpConfig.snapshotConfig;
    const isSnapshotRealData = snapshot.isRealData === true;
    const snapshotDataSource = isSnapshotRealData ? '实时数据' : '模拟数据';
    
    html += `<div style="margin-bottom: 16px;">
      <div style="display: flex; align-items: center; margin-bottom: 8px;">
        <div style="font-size: 13px; color: #475569; font-weight: 600; padding-bottom: 4px; border-bottom: 1px solid rgba(226, 232, 240, 0.8);">📷 抓拍配置</div>
        <span style="font-size: 10px; color: ${isSnapshotRealData ? '#059669' : '#9333ea'}; background: ${isSnapshotRealData ? 'rgba(5, 150, 105, 0.1)' : 'rgba(147, 51, 234, 0.1)'}; padding: 2px 6px; border-radius: 3px; margin-left: 6px; font-weight: 500;">${snapshotDataSource}</span>
      </div>
      
      <!-- 抓拍触发配置 -->
      <div style="margin-bottom: 12px;">
        <div style="font-size: 12px; color: #475569; font-weight: 600; margin-bottom: 6px;">触发配置</div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; font-size: 12px;">
          <div><span style="color: #64748b;">触发模式:</span> <span style="color: #334155; font-weight: 500;">${snapshot.triggerMode || '未知'}</span></div>
          <div><span style="color: #64748b;">灵敏度:</span> <span style="color: #334155; font-weight: 500;">${snapshot.sensitivity || 0}%</span></div>
          <div><span style="color: #64748b;">最小车辆尺寸:</span> <span style="color: #334155; font-weight: 500;">${snapshot.minVehicleSize || 0}像素</span></div>
          <div><span style="color: #64748b;">最大车辆尺寸:</span> <span style="color: #334155; font-weight: 500;">${snapshot.maxVehicleSize || 0}像素</span></div>
        </div>
      </div>
      
      <!-- 图像处理配置 -->
      <div style="margin-bottom: 12px;">
        <div style="font-size: 12px; color: #475569; font-weight: 600; margin-bottom: 6px;">图像处理</div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; font-size: 12px;">
          <div><span style="color: #64748b;">分辨率:</span> <span style="color: #334155; font-weight: 500;">${snapshot.imageResolution || '未知'}</span></div>
          <div><span style="color: #64748b;">图像质量:</span> <span style="color: #334155; font-weight: 500;">${snapshot.imageQuality || 0}%</span></div>
          <div><span style="color: #64748b;">曝光模式:</span> <span style="color: #334155; font-weight: 500;">${snapshot.exposureMode || '未知'}</span></div>
          <div><span style="color: #64748b;">白平衡:</span> <span style="color: #334155; font-weight: 500;">${snapshot.whiteBalance || '未知'}</span></div>
          <div><span style="color: #64748b;">亮度:</span> <span style="color: #334155; font-weight: 500;">${snapshot.brightness || 0}</span></div>
          <div><span style="color: #64748b;">对比度:</span> <span style="color: #334155; font-weight: 500;">${snapshot.contrast || 0}</span></div>
          <div><span style="color: #64748b;">饱和度:</span> <span style="color: #334155; font-weight: 500;">${snapshot.saturation || 0}</span></div>
        </div>
      </div>
      
      <!-- 车牌识别配置 -->
      <div style="margin-bottom: 12px;">
        <div style="font-size: 12px; color: #475569; font-weight: 600; margin-bottom: 6px;">车牌识别</div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; font-size: 12px;">
          <div><span style="color: #64748b;">识别启用:</span> <span style="color: ${snapshot.plateRecognitionEnabled ? '#059669' : '#dc2626'}; font-weight: 500;">${snapshot.plateRecognitionEnabled ? '是' : '否'}</span></div>
          <div><span style="color: #64748b;">识别区域:</span> <span style="color: #334155; font-weight: 500;">${snapshot.recognitionRegion || '未知'}</span></div>
          <div><span style="color: #64748b;">最小车牌宽度:</span> <span style="color: #334155; font-weight: 500;">${snapshot.minPlateWidth || 0}像素</span></div>
          <div><span style="color: #64748b;">最大车牌宽度:</span> <span style="color: #334155; font-weight: 500;">${snapshot.maxPlateWidth || 0}像素</span></div>
          <div><span style="color: #64748b;">车牌颜色检测:</span> <span style="color: ${snapshot.plateColorDetection ? '#059669' : '#dc2626'}; font-weight: 500;">${snapshot.plateColorDetection ? '是' : '否'}</span></div>
          <div><span style="color: #64748b;">车辆类型检测:</span> <span style="color: ${snapshot.vehicleTypeDetection ? '#059669' : '#dc2626'}; font-weight: 500;">${snapshot.vehicleTypeDetection ? '是' : '否'}</span></div>
        </div>
      </div>
      
      <!-- 抓拍规则配置 -->
      <div style="margin-bottom: 12px;">
        <div style="font-size: 12px; color: #475569; font-weight: 600; margin-bottom: 6px;">抓拍规则</div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; font-size: 12px;">
          <div><span style="color: #64748b;">抓拍延迟:</span> <span style="color: #334155; font-weight: 500;">${snapshot.captureDelay || 0}毫秒</span></div>
          <div><span style="color: #64748b;">预抓拍帧数:</span> <span style="color: #334155; font-weight: 500;">${snapshot.preCaptureFrames || 0}帧</span></div>
          <div><span style="color: #64748b;">后抓拍帧数:</span> <span style="color: #334155; font-weight: 500;">${snapshot.postCaptureFrames || 0}帧</span></div>
          <div><span style="color: #64748b;">最大抓拍数:</span> <span style="color: #334155; font-weight: 500;">${snapshot.maxCapturePerVehicle || 0}张/车</span></div>
        </div>
      </div>
      
      <!-- 其他配置 -->
      <div>
        <div style="font-size: 12px; color: #475569; font-weight: 600; margin-bottom: 6px;">其他配置</div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; font-size: 12px;">
          <div><span style="color: #64748b;">抗闪烁:</span> <span style="color: #334155; font-weight: 500;">${snapshot.antiFlicker || '未知'}</span></div>
          <div><span style="color: #64748b;">日夜模式:</span> <span style="color: #334155; font-weight: 500;">${snapshot.dayNightMode || '未知'}</span></div>
          <div><span style="color: #64748b;">红外补偿:</span> <span style="color: ${snapshot.infraredCompensation ? '#059669' : '#dc2626'}; font-weight: 500;">${snapshot.infraredCompensation ? '是' : '否'}</span></div>
        </div>
      </div>
    </div>`;
  }
  
  // 6. 命名规则（23个摄像头可设置元素）
  if (ftpConfig.cameraNamingElements && ftpConfig.cameraNamingElements.length > 0) {
    html += `<div style="margin-bottom: 16px;">
      <div style="font-size: 13px; color: #475569; font-weight: 600; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid rgba(226, 232, 240, 0.8);">📝 图片命名规则（23个可设置元素）</div>
      <div style="font-size: 12px; color: #334155; line-height: 1.6; max-height: 200px; overflow-y: auto; padding-right: 6px;">`;
    
    ftpConfig.cameraNamingElements.forEach((rule, index) => {
      const isCameraSetting = index < 23; // 前23个是摄像头能设置的
      let badge = '';
      
      if (isCameraSetting) {
        // 特殊标记"无"和"自定义"选项
        if (rule === "无" || rule === "自定义" || rule === "自定义文本") {
          badge = '<span style="font-size: 10px; color: #9333ea; background: rgba(147, 51, 234, 0.1); padding: 1px 4px; border-radius: 3px; margin-left: 4px;">特殊选项</span>';
        } else {
          badge = '<span style="font-size: 10px; color: #059669; background: rgba(5, 150, 105, 0.1); padding: 1px 4px; border-radius: 3px; margin-left: 4px;">摄像头可设置</span>';
        }
      }
      
      // 为前23个元素添加更明显的视觉区分
      const bgColor = isCameraSetting ? 'rgba(248, 250, 252, 0.8)' : 'transparent';
      const borderLeft = isCameraSetting ? '3px solid rgba(5, 150, 105, 0.3)' : 'none';
      const paddingLeft = isCameraSetting ? '8px' : '5px';
      
      html += `<div style="margin-bottom: 4px; padding: 4px ${paddingLeft}; background: ${bgColor}; border-left: ${borderLeft}; border-radius: 2px;">
        <span style="font-weight: 600; color: #475569; min-width: 24px; display: inline-block;">${index + 1}：</span>
        <span style="color: #334155;">${rule}</span>
        ${badge}
      </div>`;
    });
    
    html += `</div></div>`;
  }
  
  // 7. 详细的命名规则（带值）
  if (ftpConfig.namingRules && ftpConfig.namingRules.length > 0) {
    html += `<div style="margin-bottom: 16px;">
      <div style="font-size: 13px; color: #475569; font-weight: 600; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid rgba(226, 232, 240, 0.8);">🔍 详细命名规则（带值）</div>
      <div style="font-size: 12px; color: #334155; line-height: 1.6; max-height: 150px; overflow-y: auto; padding-right: 6px;">`;
    
    ftpConfig.namingRules.forEach((rule, index) => {
      if (typeof rule === 'object') {
        html += `<div style="margin-bottom: 4px; padding: 4px 6px; background: rgba(248, 250, 252, 0.6); border-radius: 3px;">
          <span style="font-weight: 600; color: #475569;">${rule.name || rule.element || `规则${index + 1}`}:</span>
          <span style="color: #334155; margin-left: 4px;">${rule.value || '无值'}</span>
        </div>`;
      } else if (typeof rule === 'string') {
        html += `<div style="margin-bottom: 4px; padding: 4px 6px; background: rgba(248, 250, 252, 0.6); border-radius: 3px;">
          <span style="font-weight: 600; color: #475569;">规则${index + 1}:</span>
          <span style="color: #334155; margin-left: 4px;">${rule}</span>
        </div>`;
      }
    });
    
    html += `</div></div>`;
  }
  
  // 8. 原始响应（调试信息）
  if (ftpConfig.rawResponse && ftpConfig.rawResponse.length > 0) {
    html += `<div style="margin-bottom: 8px;">
      <div style="font-size: 13px; color: #475569; font-weight: 600; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid rgba(226, 232, 240, 0.8);">🔧 原始响应（前500字符）</div>
      <div style="font-size: 11px; color: #64748b; background: rgba(248, 250, 252, 0.8); padding: 8px; border-radius: 6px; border: 1px solid rgba(226, 232, 240, 0.9); max-height: 100px; overflow-y: auto; font-family: monospace; white-space: pre-wrap; word-break: break-all;">
        ${ftpConfig.rawResponse}
      </div>
    </div>`;
  }
  
  return html;
}

// 格式化识别码显示，格式为"1：识别码 2：识别码 ... 15：识别码"
function formatIdentificationCodes(meta) {
  if (!meta || typeof meta !== "object") return "无识别码信息";
  
  const codes = [];
  
  // 尝试从不同位置提取识别码
  // 1. 从fields对象中提取
  if (meta.fields && typeof meta.fields === 'object') {
    const fieldOrder = meta.fieldOrder || getDefaultFieldOrder();
    
    // 只取前15个字段作为识别码
    for (let i = 0; i < Math.min(fieldOrder.length, 15); i++) {
      const fieldName = fieldOrder[i];
      const value = meta.fields[fieldName];
      if (value !== undefined && value !== '') {
        codes.push(`${i + 1}：${value}`);
      } else {
        codes.push(`${i + 1}：空`);
      }
    }
  }
  
  // 2. 如果fields中没有足够的数据，尝试从其他字段提取
  if (codes.length < 15) {
    // 从已知字段中提取
    const knownFields = [
      meta.deviceIp,
      meta.vehicleType,
      meta.speed,
      meta.deviceNo,
      meta.channelNo,
      meta.laneNo,
      meta.imageSeq,
      meta.vehicleSeq,
      meta.plateColor,
      meta.vehicleColor,
      meta.directionNo,
      meta.intersectionNo,
      meta.violationType,
      meta.plate,
      meta.eventAtText
    ];
    
    for (let i = codes.length; i < 15; i++) {
      const value = knownFields[i - codes.length];
      if (value !== undefined && value !== '') {
        codes.push(`${i + 1}：${value}`);
      } else {
        codes.push(`${i + 1}：空`);
      }
    }
  }
  
  // 3. 如果还是没有足够的数据，使用后备数据
  if (codes.length < 15) {
    const fallbackCodes = [
      "IP CAPTURE CAMERA",
      "0007",
      "192.168.11.253",
      "主通道",
      "01",
      "20260420155141157",
      "京A12345",
      "蓝色",
      "1",
      "60",
      "33333",
      "00001",
      "13050",
      "80",
      "X0Y0W0H0"
    ];
    
    for (let i = codes.length; i < 15; i++) {
      codes.push(`${i + 1}：${fallbackCodes[i] || "空"}`);
    }
  }
  
  // 格式化为"1：识别码 2：识别码 ... 15：识别码"
  return codes.join(" ");
}

function updateManagedDeviceActionButtons() {
  const hasSelection = Boolean(managedDeviceState.selectedId);
  if (els.updateDeviceBtn) els.updateDeviceBtn.disabled = !hasSelection;
  if (els.deleteDeviceBtn) els.deleteDeviceBtn.disabled = !hasSelection;
  if (els.checkDeviceBtn) els.checkDeviceBtn.disabled = false;
}

function renderManagedDeviceList() {
  const body = els.managedDeviceTableBody;
  if (!body) return;
  body.textContent = "";
  if (!managedDeviceState.items.length) {
    const tr = document.createElement("tr");
    tr.className = "plate-row";
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = "暂无已接入设备";
    td.style.color = "#6b7280";
    td.style.textAlign = "center";
    tr.appendChild(td);
    body.appendChild(tr);
    updateManagedDeviceActionButtons();
    return;
  }
  for (const item of managedDeviceState.items) {
    const tr = document.createElement("tr");
    tr.dataset.deviceId = String(item.id || "");
    tr.className = managedDeviceState.selectedId === item.id ? "plate-row selected" : "plate-row";
    const statusText =
      item.onlineState === "online"
        ? "在线"
        : item.onlineState === "offline"
        ? "离线"
        : "未知";
    const cells = [
      statusText,
      String(item.name || ""),
      `${String(item.host || "")}:${Number(item.port || 80) || 80}`,
      getDeviceProtocolLabel(item.protocol || "hikvision-isapi"),
      getManagedDeviceSummaryText(item)
    ];
    for (const text of cells) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    }
      tr.addEventListener("click", () => {
        managedDeviceState.selectedId = String(item.id || "");
        fillConnectionForm(item);
        setManagedDeviceHint(`已选择设备：${item.name}`);
        renderManagedDeviceList();
      });
      tr.addEventListener("dblclick", async () => {
        managedDeviceState.selectedId = String(item.id || "");
        fillConnectionForm(item);
        renderManagedDeviceList();
        
        // 检查设备是否在线，如果不在线，直接提示并不打开弹窗
        if (String(item.onlineState || "").trim() !== "online") {
          setManagedDeviceHint(`设备未在线，无法预览：${item.name}`, true);
          return;
        }
        
        logLine(`开始预览设备：${item.name} (${item.host}:${item.port})`);
        
        // 设备在线，打开预览弹窗
        setDevicePreviewModalOpen(true, item);
      });
      body.appendChild(tr);
    }
  updateManagedDeviceActionButtons();
}

async function refreshManagedDevices({ keepSelection = true } = {}) {
  let items = [];
  const shadowItems = readManagedDevicesShadow();
  try {
    const data = await fetchJsonGet("/api/devices");
    items = Array.isArray(data?.items) ? data.items : [];
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (!msg.includes("404")) throw err;
    const fallback = await fetchJsonGet("/api/device/config");
    items = Array.isArray(fallback?.config?.devices) ? fallback.config.devices : [];
  }
  managedDeviceState.items = mergeManagedDeviceItems(items, shadowItems);
  const backendIds = new Set(items.map((item) => String(item?.id || "")).filter(Boolean));
  const nextShadow = shadowItems.filter((item) => !backendIds.has(String(item?.id || "")));
  if (nextShadow.length !== shadowItems.length) {
    writeManagedDevicesShadow(nextShadow);
  }
  if (keepSelection && managedDeviceState.selectedId) {
    const exists = managedDeviceState.items.some((item) => item.id === managedDeviceState.selectedId);
    if (!exists) managedDeviceState.selectedId = "";
  } else if (!keepSelection) {
    managedDeviceState.selectedId = "";
  }
  const selected = getSelectedManagedDevice();
  if (selected) {
    fillConnectionForm(selected);
  }
  renderManagedDeviceList();
}

async function persistManagedDevicesFallback(nextItems) {
  try {
    await fetchJson("/api/device/config", { devices: nextItems });
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (msg.includes("后端串口启动失败")) {
      return;
    }
    throw err;
  }
}

function getSelectedManagedDevice() {
  return managedDeviceState.items.find((item) => item.id === managedDeviceState.selectedId) || null;
}

async function addManagedDevice() {
  const form = collectCurrentConnectionForm();
  if (!form.host) throw new Error("请填写设备 IP / Host");
  const device = {
    id: form.id || newClientManagedDeviceId(),
    name: form.name || `${form.host}:${form.port}`,
    protocol: form.protocol || "hikvision-isapi",
    ...form
  };
  let savedItem = null;
  try {
    const data = await fetchJson("/api/devices", { device });
    savedItem = data?.item || device;
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (!msg.includes("404")) throw err;
      const nextItems = [device, ...managedDeviceState.items];
      await persistManagedDevicesFallback(nextItems);
      savedItem = device;
    }
    managedDeviceState.selectedId = String(savedItem?.id || device.id || "");
    await refreshManagedDevices();
    if (!managedDeviceState.items.some((item) => String(item?.id || "") === managedDeviceState.selectedId)) {
      upsertManagedDeviceShadow(savedItem || device);
      managedDeviceState.items = mergeManagedDeviceItems(managedDeviceState.items, readManagedDevicesShadow());
      renderManagedDeviceList();
    } else {
      removeManagedDeviceShadow(managedDeviceState.selectedId);
    }
    setManagedDeviceHint("设备已增加");
}

async function updateManagedDevice() {
  const selected = getSelectedManagedDevice();
  if (!selected) throw new Error("请先选择设备");
  const form = collectCurrentConnectionForm();
  if (!form.host) throw new Error("请填写设备 IP / Host");
  const device = {
    ...selected,
    name: form.name || String(selected.name || `${form.host}:${form.port}`),
    ...form
  };
  try {
    await fetchJson(`/api/devices/${encodeURIComponent(selected.id)}`, { device }, "PUT");
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (!msg.includes("404")) throw err;
      const nextItems = managedDeviceState.items.map((item) => (item.id === selected.id ? device : item));
      await persistManagedDevicesFallback(nextItems);
    }
    await refreshManagedDevices();
    if (!managedDeviceState.items.some((item) => String(item?.id || "") === String(selected.id || ""))) {
      upsertManagedDeviceShadow(device);
      managedDeviceState.items = mergeManagedDeviceItems(managedDeviceState.items, readManagedDevicesShadow());
      renderManagedDeviceList();
    } else {
      removeManagedDeviceShadow(selected.id);
    }
    setManagedDeviceHint("设备已更新");
}

async function deleteManagedDevice() {
  const selected = getSelectedManagedDevice();
  if (!selected) throw new Error("请先选择设备");
  try {
    await fetchJson(`/api/devices/${encodeURIComponent(selected.id)}`, null, "DELETE");
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (!msg.includes("404")) throw err;
      const nextItems = managedDeviceState.items.filter((item) => item.id !== selected.id);
      await persistManagedDevicesFallback(nextItems);
    }
    removeManagedDeviceShadow(selected.id);
    managedDeviceState.selectedId = "";
    await refreshManagedDevices({ keepSelection: false });
    setManagedDeviceHint("设备已删除");
}

async function checkManagedDevice() {
  const items = Array.isArray(managedDeviceState.items) ? managedDeviceState.items : [];
  if (!items.length) throw new Error("暂无可检测设备");
  const logs = [];
  let lastSummary = null;
  let lastRequestUrl = "";
  for (const item of items) {
    try {
      const data = await runProtocolConnectionTest({
        protocol: item.protocol,
        connection: {
          host: item.host,
          port: item.port,
          username: item.username,
          password: item.password
        }
      });
      item.onlineState = "online";
      item.summary = data?.summary || item.summary || null;
      item.checkedAt = Date.now();
      lastSummary = data?.summary || lastSummary;
      lastRequestUrl = data?.requestUrl || lastRequestUrl;
      logs.push(`[在线] ${item.name} (${item.host}:${item.port})`);
      if (data?.rawText) {
        logs.push(String(data.rawText));
      }
    } catch (err) {
      item.onlineState = "offline";
      item.checkedAt = Date.now();
      logs.push(`[离线] ${item.name} (${item.host}:${item.port})`);
      logs.push(String(err?.message || err || "检测失败"));
    }
    try {
      await fetchJson(`/api/devices/${encodeURIComponent(item.id)}`, { device: item }, "PUT");
    } catch (err) {
      const msg = String(err?.message || err || "");
      if (!msg.includes("404")) {
        logLine(`设备状态写回失败：${item.name} - ${msg}`);
      } else {
        const nextItems = managedDeviceState.items.map((entry) => (entry.id === item.id ? item : entry));
        try {
          await persistManagedDevicesFallback(nextItems);
        } catch {}
      }
    }
    upsertManagedDeviceShadow(item);
  }
  renderManagedDeviceList();
  setManagedDeviceHint(`检测完成：当前 ${getOnlineManagedDeviceCount()} 台在线`);
  renderIsapiDeviceSummary(lastSummary, lastRequestUrl);
  setIsapiDeviceRaw(logs.join("\n"));
}

function setDeviceConfigModalOpen(open) {
  const modal = els.deviceConfigModal;
  if (!modal) return;
  if (open) {
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  } else {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }
}

function resetDeviceConfigDialogUi() {
  if (els.hostInput) els.hostInput.value = "";
  if (els.portInput) els.portInput.value = "80";
  if (els.deviceProtocolSelect) els.deviceProtocolSelect.value = "";
  if (els.deviceIdInput) els.deviceIdInput.value = "";
  if (els.deviceNameInput) els.deviceNameInput.value = "";
  if (els.userInput) els.userInput.value = "";
  if (els.passInput) els.passInput.value = "";
  setIsapiDeviceStatus("日志");
  renderIsapiDeviceSummary(null, "");
  setIsapiDeviceRaw("");
}

function openDeviceConfigDialog(mode = "add") {
  deviceConfigModalState.mode = mode === "edit" ? "edit" : "add";
  if (els.deviceConfigModalTitle) {
    els.deviceConfigModalTitle.textContent = deviceConfigModalState.mode === "edit" ? "修改" : "新增";
  }
  if (deviceConfigModalState.mode === "edit") {
    const selected = getSelectedManagedDevice();
    if (!selected) throw new Error("请先选择设备");
    fillConnectionForm(selected);
    setIsapiDeviceStatus(`已载入：${selected.host}:${selected.port}`);
  } else {
    resetDeviceConfigDialogUi();
  }
  setDeviceConfigModalOpen(true);
}

function initDeviceConfigModalUi() {
  const modal = els.deviceConfigModal;
  if (!modal) return;
  const close = () => setDeviceConfigModalOpen(false);
  if (els.deviceConfigModalCloseBtn) els.deviceConfigModalCloseBtn.addEventListener("click", close);
  modal.addEventListener("click", (ev) => {
    const t = ev.target;
    if (t instanceof HTMLElement && t.dataset.close === "1") close();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && modal.classList.contains("open")) {
      close();
    }
  });
}

async function saveCurrentConnectionConfig() {
  const inputPort = Number(els.portInput?.value || 80);
  const parsedHost = parseHostAndPortFromInput(els.hostInput?.value, inputPort);
  const payload = {
    host: parsedHost.host.trim(),
    port: parsedHost.port,
    username: String(els.userInput?.value || ""),
    password: String(els.passInput?.value || "")
  };
  if (!payload.host) throw new Error("请填写摄像头 IP / Host");
  await persistConnectionToServer(payload);
  setIsapiDeviceStatus("接入配置已保存");
  logLine(`已保存海康 ISAPI 接入配置：${payload.host}:${payload.port}`);
}

async function runProtocolConnectionTest(payload) {
  try {
    return await fetchJson("/api/device/test-connection", payload);
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (!msg.includes("404")) throw err;
    const protocol = String(payload?.protocol || "hikvision-isapi").trim() || "hikvision-isapi";
    if (protocol === "hikvision-isapi") {
      return await fetchJson("/api/isapi/device-info", { connection: payload.connection });
    }
    if (protocol === "onvif") {
      const rtsp = await fetchJson("/api/onvif/stream-uri", payload.connection);
      return {
        ok: true,
        protocol,
        requestUrl: `http://${payload.connection.host}:${payload.connection.port}/onvif/device_service`,
        summary: {
          protocolLabel: getDeviceProtocolLabel(protocol),
          testMode: "ONVIF RTSP探测",
          message: rtsp?.rtspUri || rtsp?.rtspUriWithAuth || `${payload.connection.host}:${payload.connection.port} ONVIF 可连接`
        },
        rawText: String(rtsp?.rtspUriWithAuth || rtsp?.rtspUri || "ONVIF 设备已返回 RTSP 地址")
      };
    }
    throw new Error(`${getDeviceProtocolLabel(protocol)} 当前服务版本还不支持测试连接，请先重启到最新版本`);
  }
}

async function testIsapiDeviceInfo() {
  const protocol = String(els.deviceProtocolSelect?.value || "hikvision-isapi").trim() || "hikvision-isapi";
  const inputPort = Number(els.portInput?.value || 80);
  const parsedHost = parseHostAndPortFromInput(els.hostInput?.value, inputPort);
  const payload = {
    protocol,
    connection: {
      host: parsedHost.host.trim(),
      port: parsedHost.port,
      username: String(els.userInput?.value || ""),
      password: String(els.passInput?.value || "")
    }
  };
  if (!payload.connection.host) throw new Error("请填写摄像头 IP / Host");
  setIsapiDeviceStatus("测试中...");
  renderIsapiDeviceSummary(null, "");
  setIsapiDeviceRaw("");
  const data = await runProtocolConnectionTest(payload);
  await persistConnectionToServer(payload.connection);
  setIsapiDeviceStatus("测试连接成功");
  renderIsapiDeviceSummary(data?.summary || null, data?.requestUrl || "");
  setIsapiDeviceRaw(data?.rawText || "");
  logLine(`${getDeviceProtocolLabel(protocol)} 测试成功：${payload.connection.host}:${payload.connection.port}`);
}

async function persistSerialToServer({ baudRate, usbVendorId, usbProductId, forwardEnabled, backendPort }) {
  const serial = {};
  if (baudRate != null) serial.baudRate = Number(baudRate) || DEFAULT_SERIAL_BAUD_RATE;
  const vId = Number(usbVendorId);
  if (Number.isFinite(vId) && vId >= 0 && vId <= 65535) serial.usbVendorId = Math.floor(vId);
  const pId = Number(usbProductId);
  if (Number.isFinite(pId) && pId >= 0 && pId <= 65535) serial.usbProductId = Math.floor(pId);
  if (forwardEnabled != null) serial.forwardEnabled = Boolean(forwardEnabled);
  if (backendPort != null) serial.backendPort = String(backendPort || "").trim();
  const payload = { serial };
  try {
    await fetchJson("/api/device/config", payload);
  } catch {}
}

async function saveSerialSettings() {
  const payload = {
    serial: {
      baudRate: DEFAULT_SERIAL_BAUD_RATE,
      backendPort: getFixedBackendSerialPort(),
      forwardEnabled: Boolean(serialState.forwardEnabled)
    }
  };
  await fetchJson("/api/device/config", payload);
}

function getCurrentConnectionSignature() {
  const host = String(els.hostInput?.value || "").trim();
  const port = Number(els.portInput?.value || 80) || 80;
  const username = String(els.userInput?.value || "");
  const password = String(els.passInput?.value || "");
  return JSON.stringify({ host, port, username, password });
}

function tryPersistConnectionOnce() {
  if (!activeStreamId) return;
  if (!els.video) return;
  if (!els.video.videoWidth || !els.video.videoHeight) return;
  const sig = getCurrentConnectionSignature();
  if (sig === lastSavedSignature) return;
  lastSavedSignature = sig;
  let parsed;
  try {
    parsed = JSON.parse(sig);
  } catch {
    return;
  }
  if (!parsed?.host) return;
  persistConnectionToServer(parsed);
  try {
    sessionStorage.setItem(SESSION_STREAMING_KEY, "1");
  } catch {}
  logLine("已保存连接信息，下次打开页面会自动载入。");
}

const serialState = {
  port: null,
  reader: null,
  writer: null,
  reading: false,
  readBuffer: "",
  lastBaudRate: 115200,
  forwardEnabled: false,
  backendPort: "/dev/ttyAS5",
  sendChain: Promise.resolve(),
  mode: "backend",
  backendOpen: false,
  lastStatusBase: "",
  lastTransferText: "",
  lastTransferAt: 0
};

const DEFAULT_SERIAL_BAUD_RATE = 115200;
const FIXED_BACKEND_SERIAL_PORT = "/dev/ttyAS5";
const COMMON_BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

function isWebSerialSupported() {
  return typeof navigator !== "undefined" && Boolean(navigator.serial);
}

function shouldUseWebSerial() {
  return false;
}

function getFixedBackendSerialPort() {
  return FIXED_BACKEND_SERIAL_PORT;
}

function syncFixedSerialPortUi() {
  if (els.serialFixedPort) els.serialFixedPort.textContent = getFixedBackendSerialPort();
}

function syncFixedSerialBaudRateUi() {
  if (els.serialFixedBaudRate) els.serialFixedBaudRate.textContent = String(DEFAULT_SERIAL_BAUD_RATE);
}

function setSerialHintText(text) {
  if (!els.serialHint) return;
  els.serialHint.textContent = String(text || "");
  els.serialHint.style.display = text ? "block" : "none";
}

function isBaudInputMode() {
  return Boolean(els.serialBaudRateInput && els.serialBaudRateInput.style.display !== "none");
}

function removeInsertedCustomBaudOptions() {
  if (!els.serialBaudRate) return;
  const opts = Array.from(els.serialBaudRate.querySelectorAll('option[data-custom="1"]'));
  for (const opt of opts) opt.remove();
}

function ensureCustomBaudOption(baudRate) {
  if (!els.serialBaudRate) return;
  const n = Number(baudRate);
  const v = Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_SERIAL_BAUD_RATE;
  if (COMMON_BAUD_RATES.includes(v)) return;
  removeInsertedCustomBaudOptions();
  const opt = document.createElement("option");
  opt.value = String(v);
  opt.textContent = `${v}（自定义）`;
  opt.dataset.custom = "1";
  const marker = els.serialBaudRate.querySelector('option[value="custom"]');
  if (marker?.parentElement === els.serialBaudRate) els.serialBaudRate.insertBefore(opt, marker);
  else els.serialBaudRate.appendChild(opt);
}

function showBaudSelect(value) {
  if (els.serialBaudRate) els.serialBaudRate.style.display = "block";
  if (els.serialBaudRateInput) els.serialBaudRateInput.style.display = "none";
  if (!els.serialBaudRate) return;
  const n = Number(value);
  const v = Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_SERIAL_BAUD_RATE;
  if (COMMON_BAUD_RATES.includes(v)) {
    removeInsertedCustomBaudOptions();
  } else {
    ensureCustomBaudOption(v);
  }
  els.serialBaudRate.value = String(v);
}

function showBaudInput(value) {
  if (els.serialBaudRate) els.serialBaudRate.style.display = "none";
  if (els.serialBaudRateInput) {
    els.serialBaudRateInput.style.display = "block";
    els.serialBaudRateInput.value = String(value);
    try {
      els.serialBaudRateInput.focus();
      els.serialBaudRateInput.select();
    } catch {}
  }
}

function getSerialBaudRate() {
  if (isBaudInputMode()) {
    const x = Number(els.serialBaudRateInput?.value || "");
    return Number.isFinite(x) && x > 0 ? Math.floor(x) : DEFAULT_SERIAL_BAUD_RATE;
  }
  const selected = String(els.serialBaudRate?.value || "").trim();
  const n = Number(selected);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_SERIAL_BAUD_RATE;
}

function applySerialBaudRateToUi(baudRate) {
  const n = Number(baudRate);
  const v = Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_SERIAL_BAUD_RATE;
  serialState.lastBaudRate = v;
  syncFixedSerialBaudRateUi();
}

function formatSerialTransferSuffix() {
  const text = String(serialState.lastTransferText || "").trim();
  const ts = Number(serialState.lastTransferAt || 0);
  if (!text || !Number.isFinite(ts) || ts <= 0) return "";
  return ` | 最近转发：${text} @ ${formatTimeOnly(ts)}`;
}

function setSerialUiState({ connected, statusText }) {
  serialState.lastStatusBase = statusText || (connected ? "已连接" : "未连接");
  if (els.serialStatus) els.serialStatus.textContent = `${serialState.lastStatusBase}${formatSerialTransferSuffix()}`;
  if (els.serialSendBtn) els.serialSendBtn.disabled = false;
}

function markSerialTransfer(text, sentAt = Date.now()) {
  const cleanText = String(text || "").trim();
  const ts = Number(sentAt || Date.now()) || Date.now();
  serialState.lastTransferText = cleanText;
  serialState.lastTransferAt = ts;
  setSerialUiState({ connected: serialState.backendOpen, statusText: serialState.lastStatusBase });
}

function applySerialModeUi() {
  serialState.mode = shouldUseWebSerial() ? "web" : "backend";
  if (serialState.mode === "web") {
    setSerialHintText("");
  } else {
    setSerialHintText(`固定串口为 ${getFixedBackendSerialPort()}，固定波特率为 ${DEFAULT_SERIAL_BAUD_RATE}。服务启动后会保持连接，点击“发送”会直接写入数据。`);
  }
}

async function loadSerialPorts() {
  try {
    const r = await fetchJsonGet("/api/serial/ports");
    return Array.isArray(r?.ports) ? r.ports : [];
  } catch {
    return [];
  }
}

async function refreshSerialPortSelect({ desiredValue } = {}) {
  if (!(els.serialPortSelect instanceof HTMLSelectElement)) return;
  const desired = String(desiredValue || "");
  const ports = await loadSerialPorts();
  const rankedPorts = ports.slice().sort((a, b) => {
    const pathA = String(a?.path || a?.comName || "").trim();
    const pathB = String(b?.path || b?.comName || "").trim();
    const rank = (v) => {
      if (/\/dev\/ttyAS\d+$/i.test(v)) return 0;
      if (/\/dev\/ttyUSB\d+$/i.test(v) || /\/dev\/ttyACM\d+$/i.test(v)) return 1;
      if (/\/dev\/ttyS\d+$/i.test(v)) return 3;
      return 2;
    };
    const diff = rank(pathA) - rank(pathB);
    return diff || pathA.localeCompare(pathB);
  });
  const hasDesired = desired ? rankedPorts.some((p) => String(p?.path || p?.comName || "").trim() === desired) : false;

  els.serialPortSelect.textContent = "";
  const optEmpty = document.createElement("option");
  optEmpty.value = "";
  optEmpty.textContent = "（不选择）";
  els.serialPortSelect.appendChild(optEmpty);

  for (const p of rankedPorts) {
    const path = String(p?.path || p?.comName || "").trim();
    if (!path) continue;
    const byIdPath = String(p?.byIdPath || "").trim();
    const friendlyName = String(p?.friendlyName || "").trim();
    const manufacturer = String(p?.manufacturer || "").trim();
    const serialNumber = String(p?.serialNumber || "").trim();
    const vendorId = String(p?.vendorId || "").trim();
    const productId = String(p?.productId || "").trim();
    const pnpId = String(p?.pnpId || "").trim();
    const labelParts = [];
    if (/\/dev\/ttyAS\d+$/i.test(path)) labelParts.push("板载串口");
    else if (/\/dev\/ttyS\d+$/i.test(path)) labelParts.push("普通 ttyS（谨慎选择）");
    if (byIdPath) labelParts.push(byIdPath);
    else if (friendlyName) labelParts.push(friendlyName);
    if (manufacturer && !labelParts.includes(manufacturer)) labelParts.push(manufacturer);
    if (serialNumber) labelParts.push(`SN:${serialNumber}`);
    if (vendorId || productId) labelParts.push(`VID:PID ${vendorId || "?"}:${productId || "?"}`);
    else if (pnpId) labelParts.push(pnpId);
    const label = labelParts.join(" | ");
    const opt = document.createElement("option");
    opt.value = path;
    opt.textContent = label ? `${path}（${label}）` : path;
    opt.title = label ? `${path}\n${label}` : path;
    els.serialPortSelect.appendChild(opt);
  }

  if (desired && !hasDesired) {
    const opt = document.createElement("option");
    opt.value = desired;
    opt.textContent = `${desired}（旧配置无效，请重新选择）`;
    opt.title = `${desired}\n该串口不存在于当前系统，请重新选择有效端口`;
    els.serialPortSelect.appendChild(opt);
  }
  els.serialPortSelect.value = desired;
  return { hasDesired };
}

async function fetchBackendSerialStatus() {
  const r = await fetchJsonGet("/api/serial/status");
  return r?.backend || {};
}

async function syncBackendSerialUi() {
  try {
    const backend = await fetchBackendSerialStatus();
    serialState.backendOpen = Boolean(backend?.isOpen);
    serialState.backendPort = getFixedBackendSerialPort();
    if (Number.isFinite(Number(backend?.baudRate)) && Number(backend.baudRate) > 0) {
      applySerialBaudRateToUi(Number(backend.baudRate));
    } else {
      applySerialBaudRateToUi(DEFAULT_SERIAL_BAUD_RATE);
    }
    syncFixedSerialPortUi();
    if (backend?.configuredPort && String(backend.configuredPort).trim() !== getFixedBackendSerialPort()) {
      setSerialHintText(`检测到旧串口配置 ${String(backend.configuredPort).trim()}，当前已固定使用 ${getFixedBackendSerialPort()}。`);
    }
    if (els.serialForwardEnabled instanceof HTMLInputElement) {
      els.serialForwardEnabled.checked = Boolean(backend?.enabled);
    }
    const statusText = serialState.backendOpen
      ? `后端已连接（${backend?.activePort || getFixedBackendSerialPort()}）`
      : `后端未连接（${getFixedBackendSerialPort()}）`;
    setSerialUiState({ connected: serialState.backendOpen, statusText });
  } catch (e) {
    setSerialUiState({ connected: false, statusText: "后端状态未知" });
    logSerialLine(`读取后端串口状态失败：${e?.message || e}`);
  }
}

async function serialDisconnect() {
  if (!shouldUseWebSerial()) {
    try {
      await fetchJson("/api/serial/disconnect", {});
      serialState.backendOpen = false;
      await syncBackendSerialUi();
      logSerialLine("后端串口已断开");
    } catch (e) {
      logSerialLine(`后端串口断开失败：${e?.message || e}`);
    }
    return;
  }
  try {
    if (serialState.reader) {
      try {
        await serialState.reader.cancel();
      } catch {}
      try {
        serialState.reader.releaseLock();
      } catch {}
    }
  } finally {
    serialState.reader = null;
  }
  try {
    if (serialState.writer) {
      try {
        serialState.writer.releaseLock();
      } catch {}
    }
  } finally {
    serialState.writer = null;
  }
  try {
    if (serialState.port) await serialState.port.close();
  } catch {}
  serialState.port = null;
  serialState.reading = false;
  serialState.sendChain = Promise.resolve();
  setSerialUiState({ connected: false, statusText: "未连接" });
}

function serialEnqueueSend(text) {
  const msg = String(text ?? "");
  const task = serialState.sendChain
    .then(async () => {
      if (!serialState.port || !serialState.writer) throw new Error("串口未连接");
      const enc = new TextEncoder();
      await serialState.writer.write(enc.encode(msg));
      return true;
    })
    .catch((e) => {
      logSerialLine(`串口发送失败：${e?.message || e}`);
      return false;
    });
  serialState.sendChain = task.then(() => {});
  return task;
}

async function serialReadLoop() {
  if (!serialState.port || !serialState.port.readable) return;
  if (serialState.reading) return;
  serialState.reading = true;
  const decoder = new TextDecoder();
  try {
    serialState.reader = serialState.port.readable.getReader();
    while (serialState.port && serialState.port.readable) {
      const { value, done } = await serialState.reader.read();
      if (done) break;
      if (!value) continue;
      serialState.readBuffer += decoder.decode(value, { stream: true });
      const parts = serialState.readBuffer.split(/\r?\n/);
      serialState.readBuffer = parts.pop() || "";
      for (const line of parts) {
        const t = String(line || "").trim();
        if (t) logSerialLine(`[串口] ${t}`);
      }
    }
  } catch {
  } finally {
    try {
      serialState.reader?.releaseLock?.();
    } catch {}
    serialState.reader = null;
    serialState.reading = false;
  }
}

async function serialConnect() {
  if (!shouldUseWebSerial()) {
    try {
      const baudRate = getSerialBaudRate();
      const backendPort = getFixedBackendSerialPort();
      serialState.lastBaudRate = baudRate;
      serialState.backendPort = backendPort;
      await persistSerialToServer({ baudRate, backendPort, forwardEnabled: true });
      await fetchJson("/api/serial/connect", {});
      serialState.backendOpen = true;
      await syncBackendSerialUi();
      logSerialLine(`后端串口已连接：${backendPort || "未命名端口"}`);
    } catch (e) {
      serialState.backendOpen = false;
      await syncBackendSerialUi();
      logSerialLine(`后端串口连接失败：${e?.message || e}`);
      logSerialLine("请检查串口端口名、设备是否存在，以及当前服务用户是否有串口访问权限。");
    }
    return;
  }
  try {
    const baudRate = getSerialBaudRate();
    const port = await navigator.serial.requestPort();
    const info = port?.getInfo?.() || {};
    await port.open({ baudRate });
    serialState.port = port;
    serialState.writer = port.writable?.getWriter?.() || null;
    serialState.sendChain = Promise.resolve();
    setSerialUiState({ connected: true, statusText: `已连接（${baudRate}）` });
    persistSerialToServer({ baudRate, usbVendorId: info.usbVendorId, usbProductId: info.usbProductId });
    serialReadLoop();
  } catch (e) {
    setSerialUiState({ connected: false, statusText: "未连接" });
    logSerialLine(`串口连接失败：${e?.message || e}`);
    await serialDisconnect();
  }
}

async function serialSend() {
  const text = String(els.serialSendInput?.value || "");
  if (!text) return;
  if (!shouldUseWebSerial()) {
    try {
      await fetchJson("/api/serial/send", { text });
      await syncBackendSerialUi();
      logSerialLine(`[后端串口发送] ${text}`);
    } catch (e) {
      await syncBackendSerialUi();
      logSerialLine(`后端串口发送失败：${e?.message || e}`);
    }
    return;
  }
  if (!serialState.port || !serialState.writer) return;
  const ok = await serialEnqueueSend(text);
  if (ok) logSerialLine(`[串口发送] ${text}`);
}

function initSerialUi() {
  if (!els.serialSendBtn) return;
  applySerialModeUi();
  syncFixedSerialPortUi();
  syncFixedSerialBaudRateUi();
  serialState.backendPort = getFixedBackendSerialPort();
  setSerialUiState({ connected: false, statusText: "未连接" });
  setSerialSaveHint("");
  (async () => {
    try {
      const cfg = await loadDeviceConfig();
      const serialCfg = cfg?.serial || {};
      const baudRate = DEFAULT_SERIAL_BAUD_RATE;
      serialState.forwardEnabled = Boolean(serialCfg?.forwardEnabled);
      serialState.backendPort = getFixedBackendSerialPort();
      serialState.lastBaudRate = baudRate;
      applySerialBaudRateToUi(baudRate);
      if (els.serialForwardEnabled instanceof HTMLInputElement) {
        els.serialForwardEnabled.checked = serialState.forwardEnabled;
      }
      if (
        String(serialCfg?.backendPort || "").trim() !== getFixedBackendSerialPort() ||
        Number(serialCfg?.baudRate || 0) !== DEFAULT_SERIAL_BAUD_RATE
      ) {
        await persistSerialToServer({ backendPort: getFixedBackendSerialPort(), baudRate: DEFAULT_SERIAL_BAUD_RATE });
      }
      if (!shouldUseWebSerial()) await syncBackendSerialUi();
    } catch {}
  })();
  if (els.serialForwardEnabled instanceof HTMLInputElement) {
    els.serialForwardEnabled.addEventListener("change", () => {
      serialState.forwardEnabled = Boolean(els.serialForwardEnabled.checked);
      setSerialSaveHint("串口设置已修改，点击“保存串口设置”生效。");
      logSerialLine(serialState.forwardEnabled ? "串口转发已开启" : "串口转发已关闭");
    });
  }
  if (els.serialSaveBtn) {
    els.serialSaveBtn.addEventListener("click", async () => {
      try {
        els.serialSaveBtn.disabled = true;
        setSerialSaveHint("");
        await saveSerialSettings();
        await syncBackendSerialUi();
        setSerialSaveHint("串口设置保存成功");
      } catch (e) {
        setSerialSaveHint(`保存失败：${e?.message || e}`, true);
      } finally {
        els.serialSaveBtn.disabled = false;
      }
    });
  }
  els.serialSendBtn.addEventListener("click", () => {
    serialSend();
  });
  els.serialSendInput?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") serialSend();
  });
  if (isWebSerialSupported()) {
    navigator.serial.addEventListener("disconnect", () => {
      serialDisconnect();
    });
  }
}

function parseHostFromXaddr(xaddr) {
  try {
    const u = new URL(xaddr);
    return { host: u.hostname, port: u.port ? Number(u.port) : 80 };
  } catch {
    return null;
  }
}

function parseHostAndPortFromInput(raw, fallbackPort) {
  const s = String(raw || "").trim();
  const fb = Number(fallbackPort) || 80;
  if (!s) return { host: "", port: fb };
  if (s.startsWith("[") && s.includes("]")) {
    const idx = s.indexOf("]");
    const host = s.slice(1, idx);
    const rest = s.slice(idx + 1);
    if (rest.startsWith(":")) {
      const p = Number(rest.slice(1));
      if (Number.isFinite(p) && p > 0 && p <= 65535) return { host, port: Math.floor(p) };
    }
    return { host, port: fb };
  }
  const first = s.indexOf(":");
  const last = s.lastIndexOf(":");
  if (first > 0 && first === last) {
    const host = s.slice(0, last).trim();
    const p = Number(s.slice(last + 1));
    if (host && Number.isFinite(p) && p > 0 && p <= 65535) return { host, port: Math.floor(p) };
  }
  return { host: s, port: fb };
}

function setButtons({ streaming }) {
  if (els.snapshotBtn) els.snapshotBtn.disabled = !streaming;
}

function formatDiscoverResultsText(devices) {
  const seen = new Set();
  const rows = [];
  const ensureRow = ({ host, port, device }) => {
    const p = Number.isFinite(port) && port > 0 && port <= 65535 ? Math.floor(port) : 80;
    if (!host) return;
    const key = `${host}:${p}`;
    if (seen.has(key)) {
      const existing = rows.find((row) => row.key === key);
      if (existing && device?.sadp) existing.sadp = device.sadp;
      if (existing) {
        const proto = String(device?.protocol || device?.source || "").trim().toLowerCase();
        if (proto.includes("sadp")) existing.protocols.add("SADP");
        else if (proto.includes("onvif") || proto.includes("ws-discovery")) existing.protocols.add("ONVIF");
      }
      return;
    }
    const protocols = new Set();
    const proto = String(device?.protocol || device?.source || "").trim().toLowerCase();
    if (proto.includes("sadp")) protocols.add("SADP");
    else if (proto.includes("onvif") || proto.includes("ws-discovery")) protocols.add("ONVIF");
    seen.add(key);
    rows.push({
      key,
      host,
      port: p,
      sadp: device?.sadp || null,
      protocols
    });
  };
  for (const d of devices || []) {
    const xaddrs = Array.isArray(d.xaddrs) ? d.xaddrs : [];
    for (const xa of xaddrs) {
      try {
        const u = new URL(xa);
        const host = String(u.hostname || "").trim();
        const port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
        ensureRow({ host, port, device: d });
      } catch {}
    }
    const name = String(d.name || "").trim();
    if (!name) continue;
    const parsed = parseHostAndPortFromInput(name, 80);
    const host = String(parsed.host || "").trim();
    const port = Number(parsed.port || 80) || 80;
    ensureRow({ host, port, device: d });
  }
  return rows.map((row) => {
    const protocolText = Array.from(row.protocols).join("+") || "-";
    const hostPort = `${row.host}:${row.port}`;
    const activatedRaw = row.sadp?.activated;
    const activated = activatedRaw == null ? "未知" : activatedRaw ? "已激活" : "未激活";
    const mac = String(row.sadp?.mac || "-");
    const serial = String(row.sadp?.deviceSn || "-");
    return {
      key: row.key,
      host: row.host,
      port: row.port,
      text: `协议: ${protocolText}\n地址: ${hostPort}\nMAC: ${mac}\n激活: ${activated}\n序列号: ${serial}`
    };
  });
}

function getDiscoverPlan(protocol) {
  const key = String(protocol || "").trim() || "hikvision-isapi";
  if (key === "onvif") {
    return {
      mode: "onvif",
      label: getDeviceProtocolLabel(key),
      run: async () => {
        const result = await fetchJson("/api/onvif/ws-discover", {
          timeoutMs: 4500,
          bindAddress: "",
          allIfaces: true,
          ttl: 2,
          repeat: 3
        });
        return (result?.devices || []).map((d) => ({ ...d, protocol: "onvif" }));
      }
    };
  }
  if (["hikvision-isapi", "hikvision-private", "ehome"].includes(key)) {
    return {
      mode: "sadp",
      label: getDeviceProtocolLabel(key),
      run: async () => {
        const result = await fetchJson("/api/hikvision/sadp-discover", {
          timeoutMs: 2500,
          port: 37020
        });
        return (result?.devices || []).map((d) => ({ ...d, protocol: "sadp" }));
      }
    };
  }
  return {
    mode: "unsupported",
    label: getDeviceProtocolLabel(key),
    run: null
  };
}

async function discover() {
  try {
    els.discoverBtn.disabled = true;
    const protocol = String(els.deviceProtocolSelect?.value || "hikvision-isapi").trim() || "hikvision-isapi";
    const plan = getDiscoverPlan(protocol);
    logLine(`开始搜索：${plan.label}`);
    setIsapiDeviceStatus("搜索中...");
    if (!plan.run) {
      const message = `${plan.label} 当前不支持局域网自动搜索，请手动输入设备地址。`;
      setIsapiDeviceRaw(message);
      setIsapiDeviceStatus("当前协议不支持自动搜索", true);
      logLine(message);
      return;
    }
    const devices = await plan.run();
    const rows = formatDiscoverResultsText(devices);
    if (rows.length) {
      const [first] = rows;
      if (els.hostInput) els.hostInput.value = `${first.host}:${first.port}`;
      setIsapiDeviceRaw(rows.map((row, index) => `#${index + 1}\n${row.text}`).join("\n\n"));
      setIsapiDeviceStatus(`已搜索到 ${rows.length} 台设备`);
    } else {
      setIsapiDeviceRaw("未发现设备");
      setIsapiDeviceStatus("未发现设备", true);
    }
    logLine(`${plan.label} 搜索完成：${devices.length} 台`);
    if (!devices.length) {
      logLine("没有发现设备，可以尝试子网扫描。");
    }
  } catch (e) {
    logLine(`搜索失败: ${e.message}`);
    setIsapiDeviceStatus(`搜索失败：${e?.message || e}`, true);
  } finally {
    els.discoverBtn.disabled = false;
  }
}

function detachPlayer() {
  if (hlsPlayer) {
    try {
      hlsPlayer.destroy();
    } catch {}
    hlsPlayer = null;
  }
  if (els.video) {
    els.video.removeAttribute("src");
    els.video.srcObject = null;
    els.video.load();
  }
}

async function stopStream() {
  if (!activeStreamId) return;
  try {
    await fetchJson("/api/stream/stop", { streamId: activeStreamId });
  } catch (e) {
    logLine(`停止失败：${e.message}`);
  } finally {
    activeStreamId = "";
    writeLastPreviewSession(null);
    detachPlayer();
    setButtons({ streaming: false });
    try {
      sessionStorage.setItem(SESSION_STREAMING_KEY, "0");
    } catch {}
  }
}

async function connectAndPlay() {
  const inputPort = Number(els.portInput.value || 80);
  const parsedHost = parseHostAndPortFromInput(els.hostInput.value, inputPort);
  const host = parsedHost.host.trim();
  const port = parsedHost.port;
  if (!host) {
    logLine("请填写 IP / Host");
    return;
  }
  els.hostInput.value = host;
  els.portInput.value = String(port);

  try {
    try {
      const appHealth = await fetchJson("/api/app/health");
      logLine(`服务信息：${appHealth?.platform || ""} ${appHealth?.node || ""} pid=${appHealth?.pid || ""}`);
    } catch {}
    logLine("通过 ONVIF 获取 RTSP URI...");
    const rtsp = await fetchJson("/api/onvif/stream-uri", {
      host,
      port,
      username: els.userInput.value,
      password: els.passInput.value
    });
    logLine("已获取 RTSP URI");

    if (activeStreamId) await stopStream();

    const rtspUriToUse = rtsp.rtspUriWithAuth || rtsp.rtspUri || "";
    if (host && port && rtspUriToUse) {
      const key = `${host}:${port}`;
      rtspByHostPort.set(key, String(rtspUriToUse));
      rtspErrorByHostPort.delete(key);
    }
    logLine("启动 HLS 预览...");
    const started = await fetchJson("/api/stream/start", {
      rtspUri: rtspUriToUse || rtsp.rtspUri,
      transcode: false,
      rtspTransport: els.rtspTransport?.value || "tcp"
    });
    activeStreamId = started.streamId;
    const playUrl = started.playUrl || `/streams/${encodeURIComponent(activeStreamId)}/index.m3u8`;
    writeLastPreviewSession({
      streamId: activeStreamId,
      playUrl,
      host,
      port,
      username: String(els.userInput.value || ""),
      password: String(els.passInput.value || ""),
      savedAt: Date.now()
    });
    setButtons({ streaming: true });
    await playHls(playUrl);

    setTimeout(async () => {
      if (!activeStreamId) return;
      try {
        const s = await fetch(`/api/stream/status/${encodeURIComponent(activeStreamId)}`).then((r) => r.json());
        if (s?.lastError) logLine(`取流日志：${s.lastError.split(/\r?\n/).slice(-3).join(" | ")}`);
      } catch {}
    }, 2500);
  } catch (e) {
    logLine(`连接失败：${e.message}`);
    if (activeStreamId) {
      try {
        await fetchJson("/api/stream/stop", { streamId: activeStreamId });
      } catch {}
    }
    activeStreamId = "";
    writeLastPreviewSession(null);
    detachPlayer();
    setButtons({ streaming: false });
    try {
      sessionStorage.setItem(SESSION_STREAMING_KEY, "0");
    } catch {}
  } finally {
  }
}

async function playHls(playUrl) {
  detachPlayer();
  if (!els.video) {
    throw new Error("找不到视频播放器");
  }
  const sourceUrl = String(playUrl || "").trim();
  if (!sourceUrl) {
    throw new Error("播放地址为空");
  }

  if (window.Hls?.isSupported?.()) {
    hlsPlayer = new window.Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 30
    });
    hlsPlayer.on(window.Hls.Events.ERROR, (_event, data) => {
      const detail = String(data?.details || data?.type || "unknown error");
      if (data?.fatal) logLine(`HLS 播放错误：${detail}`);
    });
    hlsPlayer.loadSource(sourceUrl);
    hlsPlayer.attachMedia(els.video);
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        try {
          hlsPlayer?.off(window.Hls.Events.MANIFEST_PARSED, onParsed);
          hlsPlayer?.off(window.Hls.Events.ERROR, onError);
        } catch {}
      };
      const onParsed = async () => {
        cleanup();
        try {
          await els.video.play();
        } catch {}
        resolve();
      };
      const onError = (_event, data) => {
        if (!data?.fatal) return;
        cleanup();
        reject(new Error(String(data?.details || data?.type || "HLS fatal error")));
      };
      hlsPlayer.on(window.Hls.Events.MANIFEST_PARSED, onParsed);
      hlsPlayer.on(window.Hls.Events.ERROR, onError);
    });
    return;
  }

  if (els.video.canPlayType("application/vnd.apple.mpegurl")) {
    els.video.src = sourceUrl;
    try {
      await els.video.play();
    } catch {}
    return;
  }

  throw new Error("当前浏览器不支持 HLS 播放");
}



els.discoverBtn.addEventListener("click", discover);
async function submitDeviceConfigDialog() {
  if (deviceConfigModalState.mode === "edit") {
    await updateManagedDevice();
  } else {
    await addManagedDevice();
  }
  setDeviceConfigModalOpen(false);
}

els.connectBtn.addEventListener("click", async () => {
  try {
    els.connectBtn.disabled = true;
    await submitDeviceConfigDialog();
  } catch (e) {
    setManagedDeviceHint(
      `${deviceConfigModalState.mode === "edit" ? "保存修改" : "保存设备"}失败：${e?.message || e}`,
      true
    );
  } finally {
    els.connectBtn.disabled = false;
    updateManagedDeviceActionButtons();
  }
});
els.stopBtn.addEventListener("click", () => {
  setDeviceConfigModalOpen(false);
});
if (els.saveConnBtn) {
  els.saveConnBtn.addEventListener("click", async () => {
    try {
      els.saveConnBtn.disabled = true;
      await saveCurrentConnectionConfig();
    } catch (e) {
      setIsapiDeviceStatus(`保存失败：${e?.message || e}`, true);
      logLine(`保存海康 ISAPI 接入配置失败：${e?.message || e}`);
    } finally {
      els.saveConnBtn.disabled = false;
    }
  });
}
if (els.testIsapiBtn) {
  els.testIsapiBtn.addEventListener("click", async () => {
    try {
      els.testIsapiBtn.disabled = true;
      await testIsapiDeviceInfo();
    } catch (e) {
      setIsapiDeviceStatus(`测试失败：${e?.message || e}`, true);
      setIsapiDeviceRaw("");
      renderIsapiDeviceSummary(null, "");
      logLine(`海康 ISAPI 测试失败：${e?.message || e}`);
    } finally {
      els.testIsapiBtn.disabled = false;
    }
  });
}
if (els.refreshDeviceListBtn) {
  els.refreshDeviceListBtn.addEventListener("click", async () => {
    try {
      els.refreshDeviceListBtn.disabled = true;
      await refreshManagedDevices();
      setManagedDeviceHint("设备列表已刷新");
    } catch (e) {
      setManagedDeviceHint(`刷新失败：${e?.message || e}`, true);
    } finally {
      els.refreshDeviceListBtn.disabled = false;
    }
  });
}
if (els.addDeviceBtn) {
  els.addDeviceBtn.addEventListener("click", () => {
    try {
      openDeviceConfigDialog("add");
    } catch (e) {
      setManagedDeviceHint(`增加失败：${e?.message || e}`, true);
    }
  });
}
if (els.updateDeviceBtn) {
  els.updateDeviceBtn.addEventListener("click", () => {
    try {
      openDeviceConfigDialog("edit");
    } catch (e) {
      setManagedDeviceHint(`修改失败：${e?.message || e}`, true);
    }
  });
}
if (els.deleteDeviceBtn) {
  els.deleteDeviceBtn.addEventListener("click", async () => {
    try {
      els.deleteDeviceBtn.disabled = true;
      await deleteManagedDevice();
      renderIsapiDeviceSummary(null, "");
      setIsapiDeviceRaw("");
    } catch (e) {
      setManagedDeviceHint(`删除失败：${e?.message || e}`, true);
    } finally {
      updateManagedDeviceActionButtons();
    }
  });
}
if (els.checkDeviceBtn) {
  els.checkDeviceBtn.addEventListener("click", async () => {
    try {
      els.checkDeviceBtn.disabled = true;
      await checkManagedDevice();
    } catch (e) {
      setManagedDeviceHint(`检测失败：${e?.message || e}`, true);
      logLine(`设备在线检测失败：${e?.message || e}`);
    } finally {
      updateManagedDeviceActionButtons();
    }
  });
}
if (els.clearLogBtn) {
  els.clearLogBtn.addEventListener("click", () => {
    if (els.log) els.log.textContent = "";
  });
}
if (els.clearSerialLogBtn) {
  els.clearSerialLogBtn.addEventListener("click", () => {
    if (els.serialLog) els.serialLog.textContent = "";
  });
}
if (els.showProcessed) els.showProcessed.addEventListener("change", updateCanvasVisibility);
if (els.video) {
  els.video.addEventListener("loadedmetadata", () => {
    ensureCanvasSize();
  });

  els.video.addEventListener("playing", () => {
    tryPersistConnectionOnce();
  });
}

// Web Worker多线程处理
let recordWorker = null;
let workerReady = false;

// 初始化Web Worker
function initRecordWorker() {
  if (typeof Worker === 'undefined') {
    console.warn('浏览器不支持Web Worker，将使用单线程模式');
    return false;
  }
  
  try {
    recordWorker = new Worker('/record-worker.js');
    
    recordWorker.onmessage = function(event) {
      const { type, records, queueLength, message, timestamp, hasTimer } = event.data;
      
      switch (type) {
        case 'worker-ready':
          console.log('[Worker]', message);
          workerReady = true;
          break;
          
        case 'records-processed':
          // 处理Worker返回的记录
          if (records && records.length > 0) {
            handleProcessedRecords(records, queueLength);
          }
          
          // 监控队列状态
          if (queueLength > 10) {
            console.log(`[Worker] 队列剩余: ${queueLength} 条记录`);
          }
          break;
          
        case 'queue-status':
          console.log(`[Worker] 队列状态: ${queueLength} 条记录, 定时器: ${hasTimer ? '运行中' : '停止'}`);
          break;
          
        case 'queue-cleared':
          console.log('[Worker]', message);
          break;
          
        case 'pong':
          console.log(`[Worker] 响应时间: ${Date.now() - timestamp}ms`);
          break;
      }
    };
    
    recordWorker.onerror = function(error) {
      console.error('[Worker] 错误:', error);
      workerReady = false;
    };
    
    return true;
  } catch (error) {
    console.error('初始化Web Worker失败:', error);
    return false;
  }
}

// 处理Worker返回的记录
function handleProcessedRecords(records, queueLength) {
  if (!records || records.length === 0) return;
  
  // 减少日志频率，只在处理较大批量时记录
  if (records.length >= 3) {
    const firstPlate = records[0]?.plate || '';
    console.log(`[主线程] 批量处理 ${records.length} 条记录, 第一条车牌: ${firstPlate}, Worker队列长度: ${queueLength !== undefined ? queueLength : 'N/A'}`);
  }
  
  // 批量添加记录到存储
  for (const record of records) {
    plateById.set(record.id, record);
  }
  
  // 批量渲染记录 - 优化性能
  batchRenderRecords(records);
  
  // 批量更新轻量级UI
  updateBatchDashboardLight(records);
  
  // 批量串口转发（如果需要）
  if (serialState.forwardEnabled && !serialState.backendPort && records.length > 0) {
    processSerialForwarding(records);
  }
}

// 创建车牌卡片元素（不添加到DOM，用于批量渲染）
function createPlateCardElement(record) {
  const card = document.createElement("div");
  card.className = "plate-card";
  card.dataset.recordId = String(record.id || "");
  card.dataset.plate = String(record.plate || "");
  card.dataset.ts = String(record.eventAt || record.receivedAt || 0);

  const timeStr = formatDateTime(record.eventAt || record.receivedAt) || formatDateTime(record.receivedAt);
  const imgSrc = getImgSrcOrFallback(record.imageDataUrl);
  const plateText = String(record.plate || "");
  const hasImage = Boolean(String(record.imageDataUrl || ""));
  const serialSent = Boolean(Number(record.serialSentAt || 0));

  const checkWrap = document.createElement("div");
  checkWrap.className = "plate-checkWrap";
  const checkbox = document.createElement("input");
  checkbox.className = "plate-check";
  checkbox.type = "checkbox";
  checkbox.setAttribute("aria-label", "选择");
  checkWrap.appendChild(checkbox);

  const img = document.createElement("img");
  img.src = imgSrc;
  img.className = "plate-img";
  img.alt = "车牌截图";

  const info = document.createElement("div");
  info.className = "plate-info";
  const textEl = document.createElement("div");
  textEl.className = "plate-text";
  textEl.textContent = plateText;
  const metaRow = document.createElement("div");
  metaRow.className = "plate-metaRow";
  const timeEl = document.createElement("span");
  timeEl.className = "plate-metaTime";
  timeEl.textContent = timeStr;
  metaRow.appendChild(timeEl);
  metaRow.appendChild(createPlateMetaTag({ className: "plate-metaImage", text: hasImage ? "图片：有" : "图片：无", muted: !hasImage }));
  metaRow.appendChild(createPlateMetaTag({ className: "plate-metaSerial", text: serialSent ? "串口：已发送" : "串口：未发送", muted: !serialSent }));
  info.append(textEl, metaRow);

  card.replaceChildren(checkWrap, img, info);
  
  if (checkbox instanceof HTMLInputElement) {
    const id = String(card.dataset.recordId || "");
    checkbox.checked = plateSelectedIds.has(id);
    card.classList.toggle("selected", checkbox.checked);
    checkbox.addEventListener("click", (ev) => ev.stopPropagation());
    checkbox.addEventListener("dblclick", (ev) => ev.stopPropagation());
    checkbox.addEventListener("change", () => setPlateSelectedById(id, checkbox.checked));
  }

  card.addEventListener("dblclick", (ev) => {
    if (ev.target instanceof HTMLInputElement) return;
    const id = String(card.dataset.recordId || "");
    if (!id) return;
    openPlateDetailById(id);
  });

  return card;
}

// 批量渲染记录 - 优化性能
function batchRenderRecords(records) {
  if (!records || records.length === 0) return;
  
  // 获取列表容器
  const plateListEl = document.getElementById("plateList");
  if (!plateListEl) return;
  
  // 创建文档片段，批量添加DOM元素
  const fragment = document.createDocumentFragment();
  
  for (const record of records) {
    // 创建卡片元素
    const cardEl = createPlateCardElement(record);
    if (cardEl) {
      fragment.appendChild(cardEl);
    }
    
    // 处理图片元数据
    if (record.imageDataUrl) {
      enrichRecordImageMeta(record.id, record.imageDataUrl);
    }
  }
  
  // 批量添加到DOM（添加到开头）
  if (fragment.children.length > 0) {
    plateListEl.insertBefore(fragment, plateListEl.firstChild);
  }
}

// 批量更新轻量级仪表板
function updateBatchDashboardLight(records) {
  if (!records || records.length === 0) return;
  
  // 使用最后一条记录更新UI（简单优化）
  const lastRecord = records[records.length - 1];
  updatePlateDashboardLight(lastRecord);
  updatePlatePageInfoLight();
}

// 处理串口转发
async function processSerialForwarding(records) {
  // 收集需要转发的车牌
  const platesToForward = records
    .filter(record => record.plate && record.plate.trim())
    .map(record => record.plate.trim());
  
  if (platesToForward.length > 0) {
    logSerialLine(`[串口发送] 准备批量转发 ${platesToForward.length} 个车牌`);
    
    // 批量转发
    for (const plate of platesToForward) {
      const ok = await serialEnqueueSend(plate + "\r\n");
      if (ok) {
        const sentAt = Date.now();
        // 更新对应记录的串口发送时间
        const record = records.find(r => r.plate.trim() === plate);
        if (record) {
          updateRecordSerialSent(record.id, sentAt);
          markSerialTransfer(plate, sentAt);
        }
        logSerialLine(`[串口发送] 已转发车牌: ${plate}`);
      } else {
        logSerialLine(`[串口发送] 转发失败: ${plate}`);
      }
    }
  }
}

// 添加记录到Worker处理
function addRecordToWorker(data) {
  if (!workerReady || !recordWorker) {
    console.warn('Worker未就绪，使用备用处理');
    addRecordToBatchFallback(data);
    return;
  }
  
  const plate = String(data?.plate || "").trim();
  console.log(`[主线程] 发送记录到Worker: ${plate}, 时间戳: ${Date.now()}`);
  
  recordWorker.postMessage({
    type: 'add-record',
    data: data
  });
}

// Worker备用处理（当Worker不可用时）
function addRecordToBatchFallback(data) {
  const plate = String(data?.plate || "").trim();
  if (!plate) return;
  console.log(`[备用处理] 接收到记录: ${plate}, 时间戳: ${Date.now()}`);
  
  const id = String(data?.id || "") || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const receivedAt = Number(data?.receivedAt || Date.now()) || Date.now();
  const eventAt = Number(data?.eventAt || 0) || (() => {
    if (data?.timestamp) {
      const t = new Date(data.timestamp).getTime();
      if (Number.isFinite(t) && t > 0) return t;
    }
    return 0;
  })();
  const imageDataUrl =
    typeof data?.image === "string" && data.image
      ? data.image
      : typeof data?.imageUrl === "string" && data.imageUrl
      ? data.imageUrl
      : "";

  const record = {
    id,
    plate,
    receivedAt,
    eventAt,
    imageDataUrl,
    serialSentAt: Number(data?.serialSentAt || 0) || 0,
    ftpRemotePath: typeof data?.ftpRemotePath === "string" ? data.ftpRemotePath : "",
    parsedMeta: data?.parsedMeta && typeof data.parsedMeta === "object" ? data.parsedMeta : null
  };

  plateById.set(record.id, record);
  renderPlateCard(record, { prepend: true, skipFilterApply: true });
  if (record.imageDataUrl) enrichRecordImageMeta(record.id, record.imageDataUrl);
  
  updatePlateDashboardLight(record);
  updatePlatePageInfoLight();
  
  // 串口转发（如果需要）
  if (serialState.forwardEnabled && !serialState.backendPort) {
    handleSerialForwarding(record);
  }
}

// 单条记录串口转发
async function handleSerialForwarding(record) {
  const plate = record.plate.trim();
  if (!plate) return;
  
  logSerialLine(`[串口发送] 已接收车牌，准备转发: ${plate}`);
  const ok = await serialEnqueueSend(plate + "\r\n");
  if (ok) {
    const sentAt = Date.now();
    updateRecordSerialSent(record.id, sentAt);
    markSerialTransfer(plate, sentAt);
    logSerialLine(`[串口发送] 已转发车牌: ${plate}`);
  } else {
    logSerialLine(`[串口发送] 转发失败: ${plate}`);
  }
}

// 监控Worker状态
function monitorWorkerStatus() {
  if (workerReady && recordWorker) {
    recordWorker.postMessage({ type: 'get-queue-status' });
  }
}

// 启动Worker监控（每10秒检查一次）
setInterval(monitorWorkerStatus, 10000);





function initEventStream() {
  // 初始化Web Worker
  const workerInitialized = initRecordWorker();
  if (workerInitialized) {
    console.log('[主线程] Web Worker多线程处理已启用');
  } else {
    console.log('[主线程] 使用单线程处理模式');
  }
  
  const evtSource = new EventSource("/api/events/stream");
  const handleLpr = async (data) => {
    const plate = String(data?.plate || "").trim();
    if (!plate) return;
    logLine(`[车牌识别] 收到车牌号：${plate}`);
    
    // 将记录添加到Worker处理（多线程）或备用处理
    if (workerInitialized) {
      addRecordToWorker(data);
    } else {
      addRecordToBatchFallback(data);
    }
  };

  evtSource.onmessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }
    if (data?.type === "lpr") {
      void handleLpr(data);
      return;
    }
    if (data?.type === "serial-sent") {
      const recordId = String(data?.id || "");
      const sentAt = Number(data?.sentAt || 0);
      void updateRecordSerialSent(recordId, sentAt);
      const record = plateById.get(recordId);
      const plate = String(record?.plate || "").trim();
      if (plate && Number.isFinite(sentAt) && sentAt > 0) {
        markSerialTransfer(plate, sentAt);
        logSerialLine(`[串口发送] 已转发车牌: ${plate}`);
      }
    }
  };
}


setButtons({ streaming: false });

loadFingerprint();
initSidebarNav();
initSystemUi();
initSerialUi();
initPlateModule();
initEventStream();
initDeviceConfigModalUi();

(async () => {
  const cfg = await loadDeviceConfig();
  const conn = cfg?.connection || {};
  const host = String(conn.host || "");
  const port = Number(conn.port || 80) || 80;
  const username = String(conn.username || "");
  const password = String(conn.password || "");

  const baudRate = DEFAULT_SERIAL_BAUD_RATE;
  serialState.forwardEnabled = Boolean(cfg?.serial?.forwardEnabled);
  serialState.backendPort = getFixedBackendSerialPort();
  if (els.serialForwardEnabled instanceof HTMLInputElement) {
    els.serialForwardEnabled.checked = serialState.forwardEnabled;
  }
  syncFixedSerialPortUi();
  applySerialBaudRateToUi(baudRate);
  if (host) {
    if (els.hostInput) els.hostInput.value = host;
    if (els.portInput) els.portInput.value = String(port);
    if (els.userInput) els.userInput.value = username;
    if (els.passInput) els.passInput.value = password;
    setIsapiDeviceStatus(`已配置：${host}:${port}`);
  }

  applySerialBaudRateToUi(baudRate);
  if (!host) {
    const local = readLocalLastConnection();
    if (local?.host) {
      if (els.hostInput) els.hostInput.value = local.host;
      if (els.portInput) els.portInput.value = String(local.port || 80);
      if (els.userInput) els.userInput.value = local.username || "";
      if (els.passInput) els.passInput.value = local.password || "";
      persistConnectionToServer(local);
      setIsapiDeviceStatus(`已配置：${local.host}:${local.port || 80}`);
    }
  }

  try {
    await refreshManagedDevices();
  } catch (e) {
    setManagedDeviceHint(`加载设备列表失败：${e?.message || e}`, true);
  }
  writeLastPreviewSession(null);
  try {
    sessionStorage.setItem(SESSION_STREAMING_KEY, "0");
  } catch {}
})();


window.addEventListener("beforeunload", () => {

  const streamId = String(activeStreamId || "").trim();
  if (!streamId) return;
  try {
    fetch("/api/stream/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ streamId }),
      keepalive: true
    }).catch(() => {});
  } catch {}
  activeStreamId = "";
  writeLastPreviewSession(null);
  try {
    sessionStorage.setItem(SESSION_STREAMING_KEY, "0");
  } catch {}
});

// 设备预览弹窗相关函数
function setDevicePreviewModalOpen(open, device = null) {
  devicePreviewModalState.isOpen = open;
  const modal = els.devicePreviewModal;
  if (!modal) return;
  
  if (open) {
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    
    // 清除之前的错误提示
    setPreviewErrorHint('');
    
    if (device) {
      devicePreviewModalState.currentDevice = device;
      
      // 检查是否为海康ISAPI协议
      const isHikvisionIsapi = String(device.protocol || "").trim() === "hikvision-isapi";
      devicePreviewModalState.isHikvisionIsapi = isHikvisionIsapi;
      
      // 设置弹窗标题
      if (els.devicePreviewModalTitle) {
        els.devicePreviewModalTitle.textContent = `设备预览 - ${device.name || "未知设备"}`;
      }
      

      
      // 开始预览
      startPreviewForDevice(device);
    }
  } else {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    
    // 关闭弹窗时停止预览
    stopPreview();
    devicePreviewModalState.currentDevice = null;
    devicePreviewModalState.isHikvisionIsapi = false;
  }
}





// 在预览弹窗中显示错误提示
function setPreviewErrorHint(text, isError = false) {
  // 在预览弹窗中创建一个错误提示区域
  const modalBody = els.devicePreviewModal?.querySelector('.modalBody');
  if (!modalBody) return;
  
  // 查找或创建错误提示容器
  let errorHint = modalBody.querySelector('.preview-error-hint');
  if (!errorHint) {
    errorHint = document.createElement('div');
    errorHint.className = 'preview-error-hint';
    errorHint.style.cssText = `
      margin: 10px 0;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 13px;
      text-align: center;
    `;
    // 插入到视频区域上方
    const videoWrap = modalBody.querySelector('.videoWrap');
    if (videoWrap) {
      videoWrap.parentNode.insertBefore(errorHint, videoWrap);
    } else {
      modalBody.insertBefore(errorHint, modalBody.firstChild);
    }
  }
  
  // 设置内容和样式
  errorHint.textContent = String(text || "");
  errorHint.style.backgroundColor = isError ? '#fef2f2' : '#f0f9ff';
  errorHint.style.color = isError ? '#b91c1c' : '#0369a1';
  errorHint.style.border = isError ? '1px solid #fecaca' : '1px solid #bae6fd';
  
  // 如果是错误，3秒后自动隐藏
  if (isError) {
    setTimeout(() => {
      if (errorHint && errorHint.textContent === text) {
        errorHint.style.display = 'none';
      }
    }, 3000);
  }
}

// 开始设备预览
async function startPreviewForDevice(device) {
  if (!device) return;
  
  try {
    // 填充连接表单
    fillConnectionForm(device);
    
    // 开始预览
    await connectAndPlayInPreview();
    
    // 启用截图按钮
    if (els.previewSnapshotBtn) {
      els.previewSnapshotBtn.disabled = false;
    }
    
    // 清除之前的错误提示
    setPreviewErrorHint('');
    
  } catch (error) {
    console.error("开始预览失败:", error);
    // 在预览弹窗中显示错误提示，而不是在网络设备页面
    setPreviewErrorHint(`预览失败: ${error.message}`, true);
  }
}

// 在预览弹窗中连接并播放
async function connectAndPlayInPreview() {
  const inputPort = Number(els.portInput.value || 80);
  const parsedHost = parseHostAndPortFromInput(els.hostInput.value, inputPort);
  const host = parsedHost.host.trim();
  const port = parsedHost.port;
  if (!host) {
    throw new Error("请填写 IP / Host");
  }
  
  try {
    // 获取RTSP URI
    const rtsp = await fetchJson("/api/onvif/stream-uri", {
      host,
      port,
      username: els.userInput.value,
      password: els.passInput.value
    });
    
    const rtspUriToUse = rtsp.rtspUriWithAuth || rtsp.rtspUri || "";
    if (host && port && rtspUriToUse) {
      const key = `${host}:${port}`;
      
      // 停止之前的流
      if (activeStreamId) await stopStream();
      
      // 开始新的流
      const stream = await fetchJson("/api/stream/start", {
        rtspUri: rtspUriToUse,
        transport: els.previewRtspTransport?.value || "auto"
      });
      
      activeStreamId = String(stream.streamId || "");
      writeLastPreviewSession({ host, port, streamId: activeStreamId });
      
      // 构建播放URL
      const sourceUrl = `/api/stream/${activeStreamId}/index.m3u8`;
      
      // 在预览视频元素中播放
      await playVideoInPreview(sourceUrl);
      
      return;
    }
    
    throw new Error("无法获取有效的RTSP URI");
    
  } catch (error) {
    console.error("连接预览失败:", error);
    throw error;
  }
}

// 在预览视频元素中播放
async function playVideoInPreview(sourceUrl) {
  if (!els.previewVideo) {
    throw new Error("预览视频元素不存在");
  }
  
  if (!sourceUrl) {
    throw new Error("播放地址为空");
  }
  
  if (window.Hls?.isSupported?.()) {
    const hls = new window.Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 30
    });
    
    hls.on(window.Hls.Events.ERROR, (_event, data) => {
      const detail = String(data?.details || data?.type || "unknown error");
      if (data?.fatal) console.error(`HLS 播放错误：${detail}`);
    });
    
    hls.loadSource(sourceUrl);
    hls.attachMedia(els.previewVideo);
    
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        try {
          hls.off(window.Hls.Events.MANIFEST_PARSED, onParsed);
          hls.off(window.Hls.Events.ERROR, onError);
        } catch {}
      };
      
      const onParsed = async () => {
        cleanup();
        try {
          await els.previewVideo.play();
        } catch {}
        resolve();
      };
      
      const onError = (_event, data) => {
        if (!data?.fatal) return;
        cleanup();
        reject(new Error(String(data?.details || data?.type || "HLS fatal error")));
      };
      
      hls.on(window.Hls.Events.MANIFEST_PARSED, onParsed);
      hls.on(window.Hls.Events.ERROR, onError);
    });
    
    return;
  }
  
  if (els.previewVideo.canPlayType("application/vnd.apple.mpegurl")) {
    els.previewVideo.src = sourceUrl;
    try {
      await els.previewVideo.play();
    } catch {}
    return;
  }
  
  throw new Error("当前浏览器不支持 HLS 播放");
}

// 停止预览
function stopPreview() {
  if (activeStreamId) {
    stopStream().catch(() => {});
  }
  
  if (els.previewVideo) {
    els.previewVideo.src = "";
    if (window.Hls) {
      const hls = window.Hls.getInstanceById(els.previewVideo);
      if (hls) {
        hls.destroy();
      }
    }
  }
  
  if (els.previewSnapshotBtn) {
    els.previewSnapshotBtn.disabled = true;
  }
}

// 修改双击事件处理函数，使用预览弹窗
function modifyDeviceDoubleClickHandler() {
  // 找到原来的双击事件处理代码并修改
  // 这里需要修改 renderManagedDeviceList 函数中的双击事件处理
}

// 添加事件监听器
if (els.devicePreviewModalCloseBtn) {
  els.devicePreviewModalCloseBtn.addEventListener("click", () => {
    setDevicePreviewModalOpen(false);
  });
}

if (els.devicePreviewModalStopBtn) {
  els.devicePreviewModalStopBtn.addEventListener("click", () => {
    stopPreview();
  });
}

// 添加弹窗拖动功能
if (els.devicePreviewModal) {
  const modal = els.devicePreviewModal;
  const modalPanel = modal.querySelector('.modalPanel');
  const modalHeader = modal.querySelector('.modalHeader');
  
  if (modalPanel && modalHeader) {
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let modalStartX = 0;
    let modalStartY = 0;
    
    // 设置模态框为绝对定位，以便拖动
    modalPanel.style.position = 'absolute';
    modalPanel.style.top = '50%';
    modalPanel.style.left = '50%';
    modalPanel.style.transform = 'translate(-50%, -50%)';
    modalPanel.style.margin = '0';
    
    // 鼠标按下事件 - 开始拖动
    modalHeader.addEventListener('mousedown', (e) => {
      // 只允许通过标题栏拖动
      if (e.target === modalHeader || e.target.closest('.modalTitle') || e.target === els.devicePreviewModalCloseBtn) {
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        
        // 获取当前模态框位置
        const rect = modalPanel.getBoundingClientRect();
        modalStartX = rect.left;
        modalStartY = rect.top;
        
        // 添加拖动样式
        modalPanel.style.cursor = 'grabbing';
        modalHeader.style.cursor = 'grabbing';
        
        e.preventDefault();
      }
    });
    
    // 鼠标移动事件 - 拖动中
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - dragStartX;
      const deltaY = e.clientY - dragStartY;
      
      // 计算新位置
      const newX = modalStartX + deltaX;
      const newY = modalStartY + deltaY;
      
      // 应用新位置
      modalPanel.style.left = `${newX}px`;
      modalPanel.style.top = `${newY}px`;
      modalPanel.style.transform = 'none';
      
      e.preventDefault();
    });
    
    // 鼠标释放事件 - 结束拖动
    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        modalPanel.style.cursor = '';
        modalHeader.style.cursor = '';
      }
    });
    
    // 添加标题栏悬停效果
    modalHeader.style.cursor = 'grab';
    modalHeader.addEventListener('mouseenter', () => {
      if (!isDragging) {
        modalHeader.style.cursor = 'grab';
      }
    });
    modalHeader.addEventListener('mouseleave', () => {
      if (!isDragging) {
        modalHeader.style.cursor = '';
      }
    });
  }
  
  // 点击模态框外部关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      setDevicePreviewModalOpen(false);
    }
  });
  
  // ESC键关闭
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) {
      setDevicePreviewModalOpen(false);
    }
  });
}

// 截图功能
if (els.previewSnapshotBtn) {
  els.previewSnapshotBtn.addEventListener("click", async () => {
    if (!els.previewVideo || !devicePreviewModalState.currentDevice) return;
    
    try {
      const canvas = document.createElement("canvas");
      canvas.width = els.previewVideo.videoWidth || 640;
      canvas.height = els.previewVideo.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      
      if (ctx) {
        ctx.drawImage(els.previewVideo, 0, 0, canvas.width, canvas.height);
        
        // 创建下载链接
        const url = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = url;
        a.download = `snapshot_${devicePreviewModalState.currentDevice.name || "device"}_${Date.now()}.png`;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        
        // 清理
        setTimeout(() => {
          document.body.removeChild(a);
        }, 100);
        
        setManagedDeviceHint("截图已保存", false);
      }
    } catch (error) {
      console.error("截图失败:", error);
      setManagedDeviceHint("截图失败", true);
    }
  });
}





