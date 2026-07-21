"use strict";

const fs = require("fs");
const path = require("path");

function sanitiseCacheId(value) {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned || "default";
}

function automaticCacheId(instanceId) {
  const match = String(instanceId || "").match(/^module_(\d+)(?:_|$)/i);
  return match ? `m${match[1]}` : sanitiseCacheId(instanceId);
}

function getCacheId(instanceId, configuredCacheId) {
  return configuredCacheId
    ? sanitiseCacheId(configuredCacheId)
    : automaticCacheId(instanceId);
}

function getCachePaths(baseDirectory, cacheId, productId) {
  const relativeDirectory = path.join("cache", cacheId, productId);
  const directory = path.join(baseDirectory, relativeDirectory);

  return {
    directory,
    sourceFile: path.join(directory, "source.png"),
    tempSourceFile: path.join(directory, "source.png.tmp"),
    imageFile: path.join(directory, "latest.png"),
    tempImageFile: path.join(directory, "latest.png.tmp"),
    stateFile: path.join(directory, "status.json"),
    tempStateFile: path.join(directory, "status.json.tmp"),
    relativeImageFile: path.join(relativeDirectory, "latest.png").replaceAll(path.sep, "/"),
    relativeSourceFile: path.join(relativeDirectory, "source.png").replaceAll(path.sep, "/")
  };
}

function ensureCache(paths) {
  fs.mkdirSync(paths.directory, { recursive: true, mode: 0o755 });
}

function readState(paths) {
  if (!fs.existsSync(paths.stateFile)) return {};

  try {
    return JSON.parse(fs.readFileSync(paths.stateFile, "utf8"));
  } catch {
    return {};
  }
}

function writeState(paths, state) {
  fs.writeFileSync(paths.tempStateFile, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o644
  });
  fs.renameSync(paths.tempStateFile, paths.stateFile);
  return state;
}

module.exports = {
  getCacheId,
  getCachePaths,
  ensureCache,
  readState,
  writeState
};
