"use strict";

const crypto = require("crypto");
const fs = require("fs");
const sharp = require("sharp");
const { performance } = require("perf_hooks");

const ENDPOINT = "https://view.eumetsat.int/geoserver/wms";
const REQUEST_TIMEOUT = 90_000;
const MINIMUM_IMAGE_SIZE = 10_000;
const CAPABILITIES_CACHE_MAX_AGE = 60_000;
const capabilitiesCache = new Map();

class WmsRequestError extends Error {
  constructor(message, { status = null, retryable = false, details = null } = {}) {
    super(message);
    this.name = "WmsRequestError";
    this.status = status;
    this.retryable = retryable;
    this.details = details;
  }
}

function buildUrl(profile, size, imageTime = null) {
  const query = new URLSearchParams({
    service: "WMS", version: "1.3.0", request: "GetMap",
    layers: profile.layer, styles: "", format: "image/png",
    transparent: "true", bgcolor: "0x000000",
    bbox: "-6500000,-6500000,6500000,6500000",
    width: String(size), height: String(size), srs: "AUTO:97004,9001,0,0"
  });
  if (imageTime) query.set("time", imageTime);
  return `${ENDPOINT}?${query}`;
}

function buildCapabilitiesUrl() {
  const query = new URLSearchParams({
    service: "WMS", version: "1.3.0", request: "GetCapabilities"
  });
  return `${ENDPOINT}?${query}`;
}

function decodeXml(value) {
  return value.replaceAll("&amp;", "&").replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'");
}

function parseTimeDimension(value) {
  const decoded = decodeXml(value).trim();
  const entries = decoded.split(",").map((entry) => entry.trim()).filter(Boolean);
  const candidates = [];
  const parsedEntries = [];

  for (const entry of entries) {
    const parts = entry.split("/");
    const selected = parts.length >= 2 ? parts[1] : parts[0];
    const timestamp = Date.parse(selected);
    parsedEntries.push({ raw: entry, start: parts[0] || null, end: parts[1] || null, period: parts[2] || null, selected });
    if (Number.isFinite(timestamp)) candidates.push(timestamp);
  }

  return {
    raw: decoded,
    entries: parsedEntries,
    latest: candidates.length ? new Date(Math.max(...candidates)).toISOString() : null
  };
}

function extractLatestLayerTime(xml, layerName) {
  const escapedName = layerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const namePattern = new RegExp(`<Name>\\s*${escapedName}\\s*</Name>`, "i");
  const nameMatch = namePattern.exec(xml);
  if (!nameMatch) return { imageTime: null, dimension: null };

  const searchStart = nameMatch.index;
  const layerEnd = xml.indexOf("</Layer>", searchStart);
  const block = xml.slice(searchStart, layerEnd === -1 ? searchStart + 50_000 : layerEnd);
  const timePattern = /<(?:Dimension|Extent)\b[^>]*\bname=["']time["'][^>]*>([\s\S]*?)<\/(?:Dimension|Extent)>/i;
  const timeMatch = timePattern.exec(block);
  if (!timeMatch) return { imageTime: null, dimension: null };
  const dimension = parseTimeDimension(timeMatch[1]);
  return { imageTime: dimension.latest, dimension };
}

async function fetchLatestImageTime(profile, userAgent, debug = null) {
  const cached = capabilitiesCache.get(profile.layer);
  const cacheAge = cached ? Date.now() - cached.checkedAt : null;
  if (cached && cacheAge < CAPABILITIES_CACHE_MAX_AGE) {
    debug?.("Capabilities cache", { result: "HIT", ageMs: cacheAge, maxAgeMs: CAPABILITIES_CACHE_MAX_AGE, imageTime: cached.imageTime });
    return { imageTime: cached.imageTime, source: "cache", durationMs: 0, dimension: cached.dimension || null };
  }

  debug?.("Capabilities cache", { result: cached ? "EXPIRED" : "MISS", ageMs: cacheAge, maxAgeMs: CAPABILITIES_CACHE_MAX_AGE });
  const url = buildCapabilitiesUrl();
  const started = performance.now();
  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/xml,text/xml;q=0.9,*/*;q=0.1", "User-Agent": userAgent },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT)
    });
  } catch (error) {
    throw new WmsRequestError(`EUMETView capabilities request failed: ${error.message}`, {
      retryable: true, details: { request: "GetCapabilities", durationMs: Math.round(performance.now() - started) }
    });
  }

  const durationMs = Math.round(performance.now() - started);
  const contentType = response.headers.get("content-type");
  if (!response.ok) {
    const body = await response.text();
    throw new WmsRequestError(
      `EUMETView capabilities request failed: HTTP ${response.status}${body ? ` - ${body.slice(0, 300)}` : ""}`,
      { status: response.status, retryable: response.status === 429 || response.status >= 500,
        details: { request: "GetCapabilities", durationMs, contentType, bodyPreview: body.slice(0, 300) } }
    );
  }

  const xml = await response.text();
  const parsed = extractLatestLayerTime(xml, profile.layer);
  capabilitiesCache.set(profile.layer, { imageTime: parsed.imageTime, dimension: parsed.dimension, checkedAt: Date.now() });
  debug?.("GetCapabilities response", {
    status: response.status, contentType, bytes: Buffer.byteLength(xml), durationMs,
    layer: profile.layer, rawTimeDimension: parsed.dimension?.raw || null,
    selectedAcquisition: parsed.imageTime
  });
  return { imageTime: parsed.imageTime, source: "network", durationMs, dimension: parsed.dimension };
}

async function downloadWmsImage({ profile, targetFile, tempFile, size, userAgent, imageTime = null, debug = null }) {
  const timeResult = imageTime ? { imageTime } : await fetchLatestImageTime(profile, userAgent, debug);
  const resolvedImageTime = timeResult.imageTime;
  const url = buildUrl(profile, size, resolvedImageTime);
  const started = performance.now();
  debug?.("GetMap request", { layer: profile.layer, time: resolvedImageTime || "latest", width: size, height: size, format: "image/png", url });

  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: "image/png,image/*;q=0.9", "User-Agent": userAgent },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT)
    });
  } catch (error) {
    throw new WmsRequestError(`EUMETView WMS request failed: ${error.message}`, {
      retryable: true, details: { request: "GetMap", durationMs: Math.round(performance.now() - started) }
    });
  }

  const durationMs = Math.round(performance.now() - started);
  const contentType = response.headers.get("content-type");
  if (!response.ok) {
    const body = await response.text();
    throw new WmsRequestError(
      `EUMETView WMS request failed: HTTP ${response.status}${body ? ` - ${body.slice(0, 300)}` : ""}`,
      { status: response.status, retryable: response.status === 429 || response.status >= 500,
        details: { request: "GetMap", durationMs, contentType, bodyPreview: body.slice(0, 300) } }
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < MINIMUM_IMAGE_SIZE) {
    throw new WmsRequestError(`EUMETView returned an unusually small image: ${buffer.length} bytes.`, {
      retryable: true, details: { request: "GetMap", durationMs, bytes: buffer.length, minimumBytes: MINIMUM_IMAGE_SIZE }
    });
  }

  let metadata;
  try { metadata = await sharp(buffer).metadata(); }
  catch (error) {
    throw new WmsRequestError(`EUMETView returned an unreadable image: ${error.message}`, {
      retryable: true, details: { request: "GetMap", durationMs, bytes: buffer.length }
    });
  }

  if (metadata.format !== "png" && metadata.format !== "jpeg") {
    throw new WmsRequestError(`Unexpected WMS image format: ${metadata.format || "unknown"}.`, {
      retryable: true, details: { request: "GetMap", format: metadata.format || null }
    });
  }

  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  fs.writeFileSync(tempFile, buffer, { mode: 0o644 });
  fs.renameSync(tempFile, targetFile);
  debug?.("GetMap response", {
    status: response.status, contentType, bytes: buffer.length, durationMs,
    format: metadata.format, width: metadata.width, height: metadata.height,
    channels: metadata.channels, hasAlpha: metadata.hasAlpha, sha256: hash
  });

  return {
    hash, bytes: buffer.length, imageTime: resolvedImageTime,
    responseTime: response.headers.get("last-modified") || response.headers.get("date") || null,
    downloadedAt: new Date().toISOString(), source: "EUMETSAT EUMETView WMS",
    layer: profile.layer, durationMs, metadata
  };
}

module.exports = { downloadWmsImage, fetchLatestImageTime, WmsRequestError };
