"use strict";

const NodeHelper = require("node_helper");
const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");
const { resolveProduct } = require("./src/products");
const { getCacheId, getCachePaths, ensureCache, readState, writeState } = require("./src/cache");
const { processImage } = require("./src/imageProcessor");
const { downloadWmsImage, fetchLatestImageTime } = require("./src/sources/wms");
const { MeteosatLogger, LEVELS: LOG_LEVELS } = require("./src/logger");

const DEFAULT_UPDATE_INTERVAL = 60 * 1000;
const MINIMUM_UPDATE_INTERVAL = 60 * 1000;
const DEFAULT_WMS_IMAGE_SIZE = 1800;
const DEFAULT_STALE_AFTER = 90 * 60 * 1000;
const DEFAULT_RETRY_DELAYS = [15 * 1000, 45 * 1000];
const USER_AGENT = "MagicMirror-MMM-Meteosat/1.2.5";

function sleep(delay) { return new Promise((resolve) => setTimeout(resolve, delay)); }
function exists(file) { return fs.existsSync(file); }
function statSize(file) { try { return fs.statSync(file).size; } catch { return null; } }

module.exports = NodeHelper.create({
  start() {
    this.clients = new Map();
    this.moduleDirectory = __dirname;
    fs.mkdirSync(path.join(__dirname, "cache"), { recursive: true, mode: 0o755 });
    console.log("[MMM-Meteosat] Node helper started.");
  },

  socketNotificationReceived(notification, payload = {}) {
    const instanceId = payload.instanceId || "default";
    if (notification === "METEOSAT_CONFIG") return this.configureClient(instanceId, payload);
    if (notification === "METEOSAT_STATUS_REQUEST") this.sendCachedStatus(instanceId);
  },

  configureClient(instanceId, payload) {
    const previous = this.clients.get(instanceId);
    if (previous?.timer) {
      previous.logger?.debug("Existing update timer cleared.");
      clearInterval(previous.timer);
    }

    const selection = resolveProduct(payload.product);
    const config = {
      cacheId: getCacheId(instanceId, payload.cacheId),
      updateInterval: this.normaliseUpdateInterval(payload.updateInterval),
      wmsImageSize: this.normaliseImageSize(payload.wmsImageSize),
      imageSize: Number.isFinite(payload.imageSize) ? Math.round(payload.imageSize) : null,
      logLevel: this.normaliseLogLevel(payload.logLevel),
      staleAfter: this.normaliseStaleAfter(payload.staleAfter),
      retryDelays: this.normaliseRetryDelays(payload.retryDelays),
      showTimestamp: payload.showTimestamp !== false,
      timestampType: String(payload.timestampType || "acquisition").toLowerCase(),
      timestampLocale: payload.timestampLocale || null,
      showSource: payload.showSource !== false,
      showProduct: payload.showProduct !== false,
      showStatus: payload.showStatus !== false,
      selection
    };

    const logger = new MeteosatLogger(instanceId, config.logLevel);
    const client = { config, logger, timer: null, updateRunning: false, updateStartedAt: null };
    this.clients.set(instanceId, client);
    const paths = this.getPaths(client);
    ensureCache(paths);
    const state = readState(paths);

    logger.info(`Product: ${selection.requested} -> ${selection.resolved}; cache: ${config.cacheId}; interval: ${config.updateInterval} ms.`);
    logger.block("DEBUG", "Effective configuration", {
      version: "1.2.5", instance: instanceId, requestedProduct: selection.requested,
      resolvedProduct: selection.resolved, productLabel: selection.profile.label,
      layer: selection.profile.layer, cacheId: config.cacheId,
      updateIntervalMs: config.updateInterval, minimumUpdateIntervalMs: MINIMUM_UPDATE_INTERVAL,
      wmsImageSize: config.wmsImageSize, displayImageSize: config.imageSize,
      staleAfterMs: config.staleAfter, retryDelaysMs: config.retryDelays,
      timestampType: config.timestampType, showTimestamp: config.showTimestamp,
      timestampLocale: config.timestampLocale, showSource: config.showSource,
      showProduct: config.showProduct, showStatus: config.showStatus,
      logLevel: config.logLevel, userAgent: USER_AGENT
    });
    logger.block("DEBUG", "Cache paths and initial state", {
      cacheDirectory: paths.cacheDirectory || path.dirname(paths.imageFile),
      sourceFile: paths.sourceFile, imageFile: paths.imageFile,
      stateFile: paths.stateFile, sourceExists: exists(paths.sourceFile),
      imageExists: exists(paths.imageFile), stateExists: exists(paths.stateFile),
      sourceBytes: statSize(paths.sourceFile), imageBytes: statSize(paths.imageFile),
      acquisition: state.imageTime || null, downloadedAt: state.downloadedAt || null,
      contentHash: state.contentHash || null
    });

    client.timer = setInterval(() => this.updateImage(instanceId, "timer"), config.updateInterval);
    logger.debug(`New update timer created. Next update in ${config.updateInterval} ms.`);
    this.sendCachedStatus(instanceId);
    this.updateImage(instanceId, "startup");
  },

  normaliseUpdateInterval(value) { return Number.isFinite(value) ? Math.max(MINIMUM_UPDATE_INTERVAL, Math.round(value)) : DEFAULT_UPDATE_INTERVAL; },
  normaliseImageSize(value) { return Number.isFinite(value) ? Math.min(3600, Math.max(600, Math.round(value))) : DEFAULT_WMS_IMAGE_SIZE; },
  normaliseLogLevel(value) { const level = String(value || "INFO").toUpperCase(); return Object.hasOwn(LOG_LEVELS, level) ? level : "INFO"; },
  normaliseStaleAfter(value) { if (value === 0) return 0; return Number.isFinite(value) && value > 0 ? Math.round(value) : DEFAULT_STALE_AFTER; },
  normaliseRetryDelays(value) { return Array.isArray(value) ? value.filter((v) => Number.isFinite(v) && v >= 0).map(Math.round).slice(0, 5) : [...DEFAULT_RETRY_DELAYS]; },
  getClient(instanceId) { return this.clients.get(instanceId) || null; },
  getPaths(client) { return getCachePaths(this.moduleDirectory, client.config.cacheId, client.config.selection.resolved); },

  async updateImage(instanceId, trigger = "manual") {
    const client = this.getClient(instanceId);
    if (!client) return;
    const logger = client.logger;
    if (client.updateRunning) {
      const runningFor = client.updateStartedAt ? Date.now() - client.updateStartedAt : null;
      logger.debug(`Update already running${runningFor !== null ? ` for ${runningFor} ms` : ""}; duplicate ${trigger} trigger skipped.`);
      return;
    }

    client.updateRunning = true;
    client.updateStartedAt = Date.now();
    const cycleStarted = performance.now();
    const summary = { trigger, result: "failed", capabilitiesSource: null, remoteTime: null,
      cachedTime: null, downloaded: false, processed: false, downloadBytes: null };
    const { config } = client;
    const { selection } = config;
    const paths = this.getPaths(client);
    ensureCache(paths);
    logger.block("DEBUG", "Update cycle started", { trigger, startedAt: new Date(client.updateStartedAt).toISOString(), product: selection.profile.label });

    const debug = (title, entries) => {
      if (entries && typeof entries === "object") logger.block("DEBUG", title, entries);
      else logger.debug(`${title}${entries ? `: ${entries}` : ""}`);
    };

    try {
      const previousState = readState(paths);
      summary.cachedTime = previousState.imageTime || null;
      const capabilities = await this.runWithRetries(instanceId, "GetCapabilities", () => fetchLatestImageTime(selection.profile, USER_AGENT, debug));
      const latestImageTime = capabilities.imageTime;
      summary.capabilitiesSource = capabilities.source;
      summary.remoteTime = latestImageTime || null;

      const latestTimestamp = Date.parse(latestImageTime);
      const previousTimestamp = Date.parse(previousState.imageTime);
      const sourceExists = exists(paths.sourceFile);
      const imageExists = exists(paths.imageFile);
      const stateExists = exists(paths.stateFile);
      const cacheComplete = sourceExists && imageExists;
      let decision = "download";
      let reason = "newer acquisition available";
      if (!cacheComplete) reason = "cache incomplete";
      else if (!Number.isFinite(latestTimestamp)) reason = "remote acquisition timestamp invalid";
      else if (!Number.isFinite(previousTimestamp)) reason = "cached acquisition timestamp invalid";
      else if (latestTimestamp <= previousTimestamp) { decision = "skip"; reason = "remote acquisition is not newer"; }

      logger.block("DEBUG", "Update decision", {
        remoteAcquisition: latestImageTime || null, cachedAcquisition: previousState.imageTime || null,
        remoteTimestampMs: Number.isFinite(latestTimestamp) ? latestTimestamp : "invalid",
        cachedTimestampMs: Number.isFinite(previousTimestamp) ? previousTimestamp : "invalid",
        sourceExists, imageExists, stateExists, cacheComplete, decision, reason
      });

      if (decision === "skip") {
        summary.result = "unchanged";
        this.warnIfStale(instanceId, previousState.imageTime, config.staleAfter);
        this.sendStatus("METEOSAT_IMAGE_UNCHANGED", instanceId, previousState);
        return;
      }

      const sourceResult = await this.runWithRetries(instanceId, "GetMap", () => downloadWmsImage({
        profile: selection.profile, targetFile: paths.sourceFile, tempFile: paths.tempSourceFile,
        size: config.wmsImageSize, userAgent: USER_AGENT, imageTime: latestImageTime, debug
      }));
      summary.downloaded = true;
      summary.downloadBytes = sourceResult.bytes;

      logger.block("DEBUG", "Hash comparison", {
        downloadedSha256: sourceResult.hash,
        cachedSha256: previousState.contentHash || null,
        changed: previousState.contentHash !== sourceResult.hash
      });

      if (previousState.contentHash === sourceResult.hash && exists(paths.imageFile)) {
        const unchangedState = { ...previousState,
          imageTime: sourceResult.imageTime || previousState.imageTime || null,
          responseTime: sourceResult.responseTime || previousState.responseTime || null,
          downloadedAt: sourceResult.downloadedAt || previousState.downloadedAt || null };
        writeState(paths, unchangedState);
        logger.debug("Downloaded image content matches the cached image; status metadata updated.");
        summary.result = "same-content";
        this.warnIfStale(instanceId, unchangedState.imageTime, config.staleAfter);
        this.sendStatus("METEOSAT_IMAGE_UNCHANGED", instanceId, unchangedState);
        return;
      }

      const processing = await processImage({ sourceFile: paths.sourceFile, targetFile: paths.imageFile, tempFile: paths.tempImageFile, debug });
      summary.processed = true;
      const state = writeState(paths, {
        requestedProduct: selection.requested, resolvedProduct: selection.resolved,
        productLabel: selection.profile.label, layer: selection.profile.layer,
        source: sourceResult.source, contentHash: sourceResult.hash,
        imageTime: sourceResult.imageTime, responseTime: sourceResult.responseTime,
        downloadedAt: sourceResult.downloadedAt, imageFile: paths.relativeImageFile,
        sourceFile: paths.relativeSourceFile, processing
      });
      logger.block("DEBUG", "State written", {
        imageTime: state.imageTime, downloadedAt: state.downloadedAt,
        contentHash: state.contentHash, imageFile: state.imageFile,
        sourceFile: state.sourceFile, stateFile: paths.stateFile
      });
      summary.result = "updated";
      this.warnIfStale(instanceId, state.imageTime, config.staleAfter);
      logger.info(`Image updated: ${selection.profile.label}.`);
      this.sendStatus("METEOSAT_IMAGE_UPDATED", instanceId, state);
    } catch (error) {
      this.handleError(instanceId, paths, error);
    } finally {
      summary.durationMs = Math.round(performance.now() - cycleStarted);
      logger.block("DEBUG", "Update summary", summary);
      logger.debug(`Next scheduled check in ${config.updateInterval} ms.`);
      client.updateRunning = false;
      client.updateStartedAt = null;
    }
  },

  async runWithRetries(instanceId, operationName, operation) {
    const client = this.getClient(instanceId);
    const logger = client?.logger;
    const retryDelays = client?.config.retryDelays || [];
    const totalAttempts = retryDelays.length + 1;
    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
      const started = performance.now();
      logger?.debug(`${operationName}: attempt ${attempt}/${totalAttempts} started.`);
      try {
        const result = await operation();
        logger?.debug(`${operationName}: attempt ${attempt}/${totalAttempts} succeeded after ${Math.round(performance.now() - started)} ms.`);
        return result;
      } catch (error) {
        const durationMs = Math.round(performance.now() - started);
        logger?.block("DEBUG", `${operationName} attempt failed`, {
          attempt: `${attempt}/${totalAttempts}`, durationMs, message: error.message,
          status: error.status, retryable: error.retryable === true,
          details: error.details || null
        });
        if (error?.retryable !== true || attempt >= totalAttempts) throw error;
        const delay = retryDelays[attempt - 1];
        logger?.warn(`${operationName} attempt ${attempt}/${totalAttempts} failed after ${durationMs} ms: ${error.message} Retrying in ${Math.round(delay / 1000)} seconds.`);
        await sleep(delay);
      }
    }
  },

  sendCachedStatus(instanceId) {
    const client = this.getClient(instanceId);
    if (!client) return;
    const paths = this.getPaths(client);
    const state = readState(paths);
    client.logger.block("DEBUG", "Cached status", {
      imageExists: exists(paths.imageFile), imageBytes: statSize(paths.imageFile),
      acquisition: state.imageTime || null, downloadedAt: state.downloadedAt || null
    });
    if (exists(paths.imageFile)) {
      this.warnIfStale(instanceId, state.imageTime, client.config.staleAfter);
      this.sendStatus("METEOSAT_IMAGE_UNCHANGED", instanceId, state);
    } else this.sendSocketNotification("METEOSAT_NO_IMAGE", { instanceId });
  },

  sendStatus(notification, instanceId, state) {
    this.sendSocketNotification(notification, {
      instanceId, acquisitionTime: state.imageTime || null,
      downloadedAt: state.downloadedAt || null, imagePath: state.imageFile || null,
      productLabel: state.productLabel || null, imageVersion: Date.now()
    });
  },

  warnIfStale(instanceId, imageTime, staleAfter) {
    const client = this.getClient(instanceId);
    if (!staleAfter || !imageTime) {
      client?.logger.debug(`Stale check skipped: ${!staleAfter ? "disabled" : "no image timestamp"}.`);
      return;
    }
    const timestamp = Date.parse(imageTime);
    if (!Number.isFinite(timestamp)) {
      client?.logger.debug(`Stale check skipped: invalid image timestamp ${imageTime}.`);
      return;
    }
    const now = Date.now();
    const age = now - timestamp;
    const stale = age > staleAfter;
    client?.logger.block("DEBUG", "Stale check", {
      referenceTime: imageTime, currentTime: new Date(now).toISOString(),
      ageMs: age, ageMinutes: Math.round(age / 60_000), thresholdMs: staleAfter,
      thresholdMinutes: Math.round(staleAfter / 60_000), stale
    });
    if (stale) client?.logger.warn(`The latest satellite image is ${Math.round(age / 60_000)} minutes old (warning threshold: ${Math.round(staleAfter / 60_000)} minutes).`);
  },

  handleError(instanceId, paths, error) {
    const client = this.getClient(instanceId);
    client?.logger.block("ERROR", "Update failed", {
      name: error.name, message: error.message, status: error.status,
      retryable: error.retryable === true, details: error.details || null,
      stack: client?.config.logLevel === "DEBUG" ? error.stack : null
    });
    if (exists(paths.imageFile)) {
      this.sendStatus("METEOSAT_IMAGE_UNCHANGED", instanceId, readState(paths));
      return;
    }
    this.sendSocketNotification("METEOSAT_IMAGE_ERROR", { instanceId });
  },

  logAt(instanceId, level, message) {
    const client = this.getClient(instanceId);
    if (client?.logger) client.logger.write(level, message);
  }
});
