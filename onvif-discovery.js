import { spawn } from "node:child_process";
import crypto from "node:crypto";
import os from "node:os";

import onvif from "onvif";

const { Discovery } = onvif;

function listPrivateIPv4() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const [name, items] of Object.entries(ifaces)) {
    for (const i of items || []) {
      if (!i || i.family !== "IPv4" || i.internal) continue;
      const address = String(i.address || "");
      if (!address) continue;
      out.push({ name, address });
    }
  }
  return out;
}

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

function dedupeDevices(devices) {
  const seen = new Set();
  const out = [];
  for (const d of devices || []) {
    const urn = String(d?.urn || "");
    const name = String(d?.name || "");
    const xaddrs = Array.isArray(d?.xaddrs) ? d.xaddrs.filter(Boolean) : [];
    const key = xaddrs[0] ? String(xaddrs[0]) : `${urn}|${name}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ urn, name, xaddrs });
  }
  return out;
}

export async function onvifDiscoveryProbe({ timeoutMs = 4000 } = {}) {
  const discovered = await new Promise((resolve) => {
    const results = [];
    const done = () => resolve(results);
    try {
      const discovery = new Discovery();
      discovery.on("device", (device) => {
        if (!device?.xaddrs?.length) return;
        results.push({
          urn: String(device.urn || ""),
          name: String(device.name || ""),
          xaddrs: device.xaddrs
        });
      });
      discovery.probe();
    } catch {
      resolve(results);
      return;
    }
    setTimeout(done, timeoutMs);
  });
  return dedupeDevices(discovered);
}

export async function nodeOnvifProbe() {
  try {
    const nodeOnvif = (await import("node-onvif")).default;
    const list = await nodeOnvif.startProbe();
    const mapped = Array.isArray(list)
      ? list.map((d) => ({
          urn: String(d?.urn || ""),
          name: String(d?.name || ""),
          xaddrs: Array.isArray(d?.xaddrs) ? d.xaddrs : []
        }))
      : [];
    return dedupeDevices(mapped);
  } catch {
    return [];
  }
}

export async function wsDiscoveryMulticast({
  bindAddress = "",
  timeoutMs = 3000,
  ttl = 2,
  repeat = 3,
  allIfaces = false,
  fallbackPorts = [80, 8000, 8080, 8899, 85, 82, 10080, 2000, 8081, 7080, 9090, 9080, 81, 8999]
} = {}) {
  const dgram = await import("node:dgram");
  const results = [];
  const seen = new Set();
  const seenEpr = new Set();
  const pendingResolve = new Set();
  const pendingChecks = [];
  const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
  const maddr = "239.255.255.250";
  const bcast = "255.255.255.255";
  const port = 3702;
  let timer;

  const addXaddr = (x, name = "") => {
    if (!x || seen.has(x)) return;
    seen.add(x);
    results.push({ urn: "", name, xaddrs: [x] });
  };

  try {
    await new Promise((resolve, reject) => {
      socket.once("error", reject);
      socket.bind(0, bindAddress || "0.0.0.0", () => resolve());
    });
    const ifaceList = listPrivateIPv4();
    if (allIfaces && !bindAddress) {
      for (const i of ifaceList) {
        try {
          socket.addMembership(maddr, i.address);
        } catch {}
      }
    } else {
      try {
        socket.addMembership(maddr, bindAddress || undefined);
      } catch {}
    }
    try {
      socket.setMulticastTTL(ttl);
      if (bindAddress) {
        socket.setMulticastInterface(bindAddress);
      }
      socket.setMulticastLoopback(false);
    } catch {}

    socket.on("message", (msg, rinfo) => {
      const xml = msg.toString("utf8");
      const parsed = parseWsDiscoveryResponse(xml);
      const arr = (parsed.xaddrs || []).filter((u) => /\/onvif\//i.test(u));
      for (const x of arr) addXaddr(x);
      if ((!parsed.xaddrs || parsed.xaddrs.length === 0) && parsed.epr && !seenEpr.has(parsed.epr)) {
        seenEpr.add(parsed.epr);
        pendingResolve.add(parsed.epr);
      }
      if ((!parsed.xaddrs || parsed.xaddrs.length === 0) && rinfo?.address) {
        const ip = rinfo.address;
        const task = (async () => {
          for (const p of fallbackPorts) {
            const paths = ["/onvif/device_service", "/onvif/devices", "/onvif/device_service?wsdl"];
            for (const pth of paths) {
              const url = `http://${ip}:${p}${pth}`;
              const ac = new AbortController();
              const t = setTimeout(() => ac.abort(), Math.max(400, Math.floor(timeoutMs / 3)));
              try {
                const res = await fetch(url, { method: "GET", signal: ac.signal });
                if (res.ok || res.status === 401 || res.status === 405 || res.status === 500 || res.status === 404) {
                  addXaddr(url, ip);
                  clearTimeout(t);
                  return;
                }
              } catch {}
              clearTimeout(t);
            }
          }
        })();
        pendingChecks.push(task);
      }
    });

    const typesVariants = [["dn:NetworkVideoTransmitter"], ["tds:Device"], ["dn:Device"], [""]];
    const scopesVariants = [[""], ["onvif://www.onvif.org"], ["onvif://www.onvif.org/type/NetworkVideoTransmitter"]];
    const addressingVariants = ["2004", "2005"];

    const sendOnce = async (address) => {
      for (const av of addressingVariants) {
        for (const tv of typesVariants) {
          for (const sv of scopesVariants) {
            const probe = buildProbe({ types: tv, addressingNs: av, scopes: sv });
            const buf = Buffer.from(probe, "utf8");
            await new Promise((resolve) => socket.send(buf, 0, buf.length, port, address, () => resolve()));
          }
        }
      }
    };

    const rCount = Math.max(1, Math.min(4, Number(repeat) || 3));
    for (let r = 0; r < rCount; r += 1) {
      if (allIfaces && !bindAddress && ifaceList.length) {
        for (const i of ifaceList) {
          try {
            socket.setMulticastInterface(i.address);
          } catch {}
          await sendOnce(maddr);
        }
      } else {
        await sendOnce(maddr);
      }
      try {
        await sendOnce(bcast);
      } catch {}
    }

    await new Promise((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    });
    clearTimeout(timer);

    if (pendingResolve.size > 0) {
      for (const epr of pendingResolve) {
        for (const av of addressingVariants) {
          const id = crypto.randomUUID();
          const wNs =
            av === "2004"
              ? ' xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"'
              : ' xmlns:w="http://www.w3.org/2005/08/addressing"';
          const body = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<e:Envelope',
            ' xmlns:e="http://www.w3.org/2003/05/soap-envelope"',
            wNs,
            ' xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery">',
            "<e:Header>",
            `<w:MessageID>urn:uuid:${id}</w:MessageID>`,
            "<w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>",
            "<w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Resolve</w:Action>",
            "</e:Header>",
            "<e:Body>",
            "<d:Resolve>",
            "<w:EndpointReference>",
            `<w:Address>${epr}</w:Address>`,
            "</w:EndpointReference>",
            "</d:Resolve>",
            "</e:Body>",
            "</e:Envelope>"
          ].join("");
          const buf = Buffer.from(body, "utf8");
          await new Promise((resolve) => socket.send(buf, 0, buf.length, port, maddr, () => resolve()));
        }
      }
      await new Promise((resolve) => {
        timer = setTimeout(resolve, Math.max(1200, Math.floor(timeoutMs / 2)));
      });
    }
    clearTimeout(timer);

    if (pendingChecks.length) {
      await Promise.allSettled(pendingChecks);
    }

    socket.close();
    return dedupeDevices(results);
  } catch (e) {
    clearTimeout(timer);
    try {
      socket.close();
    } catch {}
    throw e;
  }
}

function parseArpTable(text) {
  const out = new Set();
  const s = String(text || "");
  const re = /(\d{1,3}(?:\.\d{1,3}){3})/g;
  let m;
  while ((m = re.exec(s))) {
    const ip = m[1];
    if (ip && !ip.startsWith("0.") && !ip.startsWith("127.")) out.add(ip);
  }
  return Array.from(out);
}

export async function getArpIps() {
  return new Promise((resolve) => {
    const ps = spawn(process.platform === "win32" ? "arp" : "arp", ["-a"]);
    let out = "";
    ps.stdout.on("data", (buf) => (out += buf.toString("utf8")));
    ps.on("close", () => resolve(parseArpTable(out)));
    ps.on("error", () => resolve([]));
  });
}

export async function wsDiscoveryUnicast({ ips, bindAddress = "", timeoutMs = 2000 } = {}) {
  const dgram = await import("node:dgram");
  const targets = Array.isArray(ips) && ips.length ? ips : await getArpIps();
  const results = [];
  const seen = new Set();
  await Promise.all(
    targets.map(async (ip) => {
      const sock = dgram.createSocket({ type: "udp4" });
      await new Promise((resolve) => sock.bind(0, bindAddress || "0.0.0.0", () => resolve()));
      const onMsg = (msg) => {
        const xml = msg.toString("utf8");
        const parsed = parseWsDiscoveryResponse(xml);
        const arr = (parsed.xaddrs || []).filter((u) => /\/onvif\//i.test(u));
        for (const x of arr) {
          if (seen.has(x)) continue;
          seen.add(x);
          results.push({ urn: "", name: "", xaddrs: [x] });
        }
      };
      sock.on("message", onMsg);
      try {
        const probe = buildProbe({ types: ["dn:NetworkVideoTransmitter"] });
        const buf = Buffer.from(probe, "utf8");
        await new Promise((resolve) => sock.send(buf, 0, buf.length, 3702, ip, () => resolve()));
        await new Promise((resolve) => setTimeout(resolve, timeoutMs));
      } catch {}
      sock.off("message", onMsg);
      try {
        sock.close();
      } catch {}
    })
  );
  return dedupeDevices(results);
}

export async function discoverOnvifDevices(options = {}) {
  const tried = [];
  try {
    const d = await wsDiscoveryMulticast(options);
    tried.push(d);
    if (d.length) return d;
  } catch {}
  try {
    const d = await onvifDiscoveryProbe({ timeoutMs: options.timeoutMs || 4000 });
    tried.push(d);
    if (d.length) return d;
  } catch {}
  try {
    const d = await nodeOnvifProbe();
    tried.push(d);
    if (d.length) return d;
  } catch {}
  return dedupeDevices(tried.flat());
}

export { listPrivateIPv4 };

