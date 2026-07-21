"use strict";

const fs = require("fs");
const sharp = require("sharp");
const { performance } = require("perf_hooks");
const { createTemporaryPath } = require("./cache");

const MAX_INPUT_PIXELS = 3600 * 3600;
const FULL_DISK_GEOMETRY = Object.freeze({
  centerXRatio: 0.5, centerYRatio: 0.5, radiusRatio: 0.42,
  opaqueOffsetRatio: -0.003, transparentOffsetRatio: 0.003
});

function getGeometry(width, height) {
  const size = Math.min(width, height);
  return {
    centerX: width * FULL_DISK_GEOMETRY.centerXRatio,
    centerY: height * FULL_DISK_GEOMETRY.centerYRatio,
    radius: size * FULL_DISK_GEOMETRY.radiusRatio,
    opaqueOffset: size * FULL_DISK_GEOMETRY.opaqueOffsetRatio,
    transparentOffset: size * FULL_DISK_GEOMETRY.transparentOffsetRatio
  };
}

function buildMask(width, height, geometry, sourceAlpha) {
  const mask = Buffer.alloc(width * height);
  const opaqueRadius = geometry.radius + geometry.opaqueOffset;
  const transparentRadius = geometry.radius + geometry.transparentOffset;
  const featherWidth = Math.max(1, transparentRadius - opaqueRadius);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const distance = Math.hypot(x - geometry.centerX, y - geometry.centerY);
      let geometricAlpha;
      if (distance <= opaqueRadius) geometricAlpha = 255;
      else if (distance >= transparentRadius) geometricAlpha = 0;
      else geometricAlpha = Math.round(((transparentRadius - distance) / featherWidth) * 255);
      mask[index] = Math.round((geometricAlpha * sourceAlpha[index]) / 255);
    }
  }
  return mask;
}

async function processImage({ sourceFile, targetFile, tempFile, debug = null, isActive = null }) {
  const started = performance.now();
  const inputBytes = fs.statSync(sourceFile).size;
  const uniqueTempFile = createTemporaryPath(tempFile);

  try {
    const { data, info } = await sharp(sourceFile, { limitInputPixels: MAX_INPUT_PIXELS, sequentialRead: true })
      .ensureAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
    if (info.channels !== 4) throw new Error(`Unexpected source channel count: ${info.channels}.`);
    if (info.width * info.height > MAX_INPUT_PIXELS) throw new Error("Source image exceeds maximum pixel count.");

    const pixelCount = info.width * info.height;
    const sourceAlpha = Buffer.allocUnsafe(pixelCount);
    for (let index = 0; index < pixelCount; index += 1) sourceAlpha[index] = data[index * 4 + 3];

    const geometry = getGeometry(info.width, info.height);
    const alpha = buildMask(info.width, info.height, geometry, sourceAlpha);
    for (let index = 0; index < pixelCount; index += 1) data[index * 4 + 3] = alpha[index];

    await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 }, limitInputPixels: MAX_INPUT_PIXELS })
      .png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(uniqueTempFile);

    const metadata = await sharp(uniqueTempFile, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    if (metadata.channels !== 4 || !metadata.hasAlpha) throw new Error("Generated PNG does not contain an alpha channel.");

    const outputBytes = fs.statSync(uniqueTempFile).size;
    fs.chmodSync(uniqueTempFile, 0o644);
    if (isActive && !isActive()) {
      const error = new Error("Obsolete image processing result discarded.");
      error.name = "AbortError";
      throw error;
    }
    fs.renameSync(uniqueTempFile, targetFile);
    const durationMs = Math.round(performance.now() - started);
    const result = { method: "geometric-alpha-mask", width: info.width, height: info.height, channels: metadata.channels, hasAlpha: metadata.hasAlpha, geometry, inputBytes, outputBytes, durationMs };
    debug?.("Image processing", result);
    return result;
  } finally {
    fs.rmSync(uniqueTempFile, { force: true });
  }
}

module.exports = { processImage, getGeometry, buildMask };
