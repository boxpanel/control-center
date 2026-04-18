import crypto from "node:crypto";
import { parentPort, workerData } from "node:worker_threads";

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
    eventDateIso: Number.isFinite(eventDate?.getTime()) ? eventDate.toISOString() : "",
    laneNo: String(laneNo || "").trim(),
    plateColor: String(plateColor || "").trim(),
    vehicleColor: String(vehicleColor || "").trim(),
    vehicleType: String(vehicleType || "").trim(),
    confidence: Number(confidenceText || 0) || 0,
    imageBase64: imageBuffer ? imageBuffer.toString("base64") : "",
    imageExt,
    imageMime,
    sourceEventKey,
    isRetransmission: toBooleanLoose(isRetransmissionText),
    isPlateEvent: looksLikePlateEvent(eventType, eventCode, xmlText, jsonText),
    hasMultipart: parts.length > 0,
    xmlText
  };
}

async function main() {
  const rawBody = Buffer.isBuffer(workerData?.rawBody) ? workerData.rawBody : Buffer.from(workerData?.rawBody || "");
  const contentType = String(workerData?.contentType || "");
  const payload = parseHikvisionIsapiEvent(rawBody, contentType);
  parentPort?.postMessage({ ok: true, payload });
}

main().catch((err) => {
  parentPort?.postMessage({ ok: false, error: err?.message || String(err) });
  process.exitCode = 1;
});
