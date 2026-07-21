"use strict";

const crypto = require("crypto");
const fs = require("fs");
const sharp = require("sharp");

const ENDPOINT = "https://view.eumetsat.int/geoserver/wms";
const REQUEST_TIMEOUT = 90_000;
const MINIMUM_IMAGE_SIZE = 10_000;

function buildUrl(profile, size) {
  const query = new URLSearchParams({
    service: "WMS",
    version: "1.3.0",
    request: "GetMap",
    layers: profile.layer,
    styles: "",
    format: "image/png",
    transparent: "true",
    bgcolor: "0x000000",
    bbox: "-6500000,-6500000,6500000,6500000",
    width: String(size),
    height: String(size),
    srs: "AUTO:97004,9001,0,0"
  });

  return `${ENDPOINT}?${query}`;
}

async function downloadWmsImage({ profile, targetFile, tempFile, size, userAgent }) {
  const response = await fetch(buildUrl(profile, size), {
    headers: {
      Accept: "image/png,image/*;q=0.9",
      "User-Agent": userAgent
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`EUMETView WMS request failed: HTTP ${response.status}${body ? ` - ${body.slice(0, 300)}` : ""}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < MINIMUM_IMAGE_SIZE) {
    throw new Error(`EUMETView returned an unusually small image: ${buffer.length} bytes.`);
  }

  const metadata = await sharp(buffer).metadata();
  if (metadata.format !== "png" && metadata.format !== "jpeg") {
    throw new Error(`Unexpected WMS image format: ${metadata.format || "unknown"}.`);
  }

  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  fs.writeFileSync(tempFile, buffer, { mode: 0o644 });
  fs.renameSync(tempFile, targetFile);

  return {
    hash,
    imageTime: response.headers.get("last-modified") || response.headers.get("date") || new Date().toISOString(),
    downloadedAt: new Date().toISOString(),
    source: "EUMETSAT EUMETView WMS",
    layer: profile.layer
  };
}

module.exports = { downloadWmsImage };
