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
    eventDateIso: Number.isFinite(eventDate?.getTime()) ? eventDate.toISOString() : "",
    jpegBase64: jpegBuffer ? jpegBuffer.toString("base64") : "",
    sourceEventKey,
    isRetransmission: toBooleanLoose(isRetransmissionText),
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
