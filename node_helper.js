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

const VERSION = "1.2.6";
const DEFAULT_UPDATE_INTERVAL = 10 * 60 * 1000;
const MINIMUM_UPDATE_INTERVAL = 60 * 1000;
const DEFAULT_WMS_IMAGE_SIZE = 1800;
const DEFAULT_STALE_AFTER = 90 * 60 * 1000;
const DEFAULT_RETRY_DELAYS = [15 * 1000, 45 * 1000];
const MAX_RETRY_DELAY = 5 * 60 * 1000;
const MAX_CLIENTS = 10;
const MAX_INSTANCE_ID_LENGTH = 128;
const USER_AGENT = `MagicMirror-MMM-Meteosat/${VERSION}`;

function exists(file) { return fs.existsSync(file); }
function statSize(file) { try { return fs.statSync(file).size; } catch { return null; } }
function abortError() { const error = new Error("Update aborted because the module was reconfigured."); error.name = "AbortError"; return error; }
function sleep(delay, signal) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delay);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(abortError()); }, { once: true });
  });
}

module.exports = NodeHelper.create({
  start() {
    this.clients = new Map();
    this.moduleDirectory = __dirname;
    fs.mkdirSync(path.join(__dirname, "cache"), { recursive: true, mode: 0o755 });
    console.log(`[MMM-Meteosat] Node helper ${VERSION} started.`);
  },

  socketNotificationReceived(notification, payload = {}) {
    const instanceId = this.normaliseInstanceId(payload.instanceId);
    try {
      if (notification === "METEOSAT_CONFIG") {
        this.configureClient(instanceId, payload);
        return;
      }
      if (notification === "METEOSAT_STATUS_REQUEST") this.sendCachedStatus(instanceId);
    } catch (error) {
      console.error(`[MMM-Meteosat][${instanceId}][ERROR] Invalid configuration: ${error.message}`);
      this.sendSocketNotification("METEOSAT_CONFIG_ERROR", { instanceId, message: "Invalid MMM-Meteosat configuration." });
    }
  },

  normaliseInstanceId(value) {
    const instanceId = String(value || "default").trim();
    if (!instanceId || instanceId.length > MAX_INSTANCE_ID_LENGTH || !/^[a-z0-9_.:-]+$/i.test(instanceId)) {
      throw new Error("Invalid module instance identifier.");
    }
    return instanceId;
  },

  buildConfig(instanceId, payload) {
    const selection = resolveProduct(payload.product);
    return {
      cacheId: getCacheId(instanceId, payload.cacheId),
      updateInterval: this.normaliseUpdateInterval(payload.updateInterval),
      wmsImageSize: this.normaliseImageSize(payload.wmsImageSize),
      imageSize: Number.isFinite(payload.imageSize) ? Math.max(1, Math.round(payload.imageSize)) : null,
      logLevel: this.normaliseLogLevel(payload.logLevel),
      staleAfter: this.normaliseStaleAfter(payload.staleAfter),
      retryDelays: this.normaliseRetryDelays(payload.retryDelays),
      showTimestamp: payload.showTimestamp !== false,
      timestampType: ["acquisition", "download"].includes(String(payload.timestampType || "acquisition").toLowerCase())
        ? String(payload.timestampType || "acquisition").toLowerCase() : "acquisition",
      timestampLocale: typeof payload.timestampLocale === "string" && payload.timestampLocale.trim() ? payload.timestampLocale.trim() : null,
      showSource: payload.showSource !== false,
      showProduct: payload.showProduct !== false,
      showStatus: payload.showStatus !== false,
      selection
    };
  },

  configureClient(instanceId, payload) {
    const config = this.buildConfig(instanceId, payload);
    const previous = this.clients.get(instanceId);
    if (!previous && this.clients.size >= MAX_CLIENTS) throw new Error(`Maximum number of clients (${MAX_CLIENTS}) reached.`);

    const generation = (previous?.generation || 0) + 1;
    const logger = new MeteosatLogger(instanceId, config.logLevel);
    const client = {
      config, logger, generation, timer: null,
      updateRunning: false, updateStartedAt: null,
      abortController: new AbortController()
    };
    const paths = this.getPaths(client);
    ensureCache(paths);
    const state = readState(paths, (message) => logger.warn(message));

    if (previous?.timer) clearInterval(previous.timer);
    previous?.abortController?.abort();
    this.clients.set(instanceId, client);

    logger.info(`Product: ${config.selection.requested} -> ${config.selection.resolved}; cache: ${config.cacheId}; interval: ${config.updateInterval} ms.`);
    logger.block("DEBUG", "Effective configuration", {
      version: VERSION, instance: instanceId, generation,
      requestedProduct: config.selection.requested, resolvedProduct: config.selection.resolved,
      productLabel: config.selection.profile.label, layer: config.selection.profile.layer,
      cacheId: config.cacheId, updateIntervalMs: config.updateInterval,
      minimumUpdateIntervalMs: MINIMUM_UPDATE_INTERVAL, wmsImageSize: config.wmsImageSize,
      displayImageSize: config.imageSize, staleAfterMs: config.staleAfter,
      retryDelaysMs: config.retryDelays, timestampType: config.timestampType,
      showTimestamp: config.showTimestamp, timestampLocale: config.timestampLocale,
      showSource: config.showSource, showProduct: config.showProduct,
      showStatus: config.showStatus, logLevel: config.logLevel, userAgent: USER_AGENT
    });
    logger.block("DEBUG", "Cache paths and initial state", {
      cacheDirectory: paths.directory, sourceFile: paths.sourceFile, imageFile: paths.imageFile,
      stateFile: paths.stateFile, sourceExists: exists(paths.sourceFile), imageExists: exists(paths.imageFile),
      stateExists: exists(paths.stateFile), sourceBytes: statSize(paths.sourceFile),
      imageBytes: statSize(paths.imageFile), acquisition: state.imageTime || null,
      downloadedAt: state.downloadedAt || null, contentHash: state.contentHash || null
    });

    client.timer = setInterval(() => this.updateImage(instanceId, "timer"), config.updateInterval);
    this.sendCachedStatus(instanceId);
    void this.updateImage(instanceId, "startup");
  },

  normaliseUpdateInterval(value) { return Number.isFinite(value) ? Math.max(MINIMUM_UPDATE_INTERVAL, Math.round(value)) : DEFAULT_UPDATE_INTERVAL; },
  normaliseImageSize(value) { return Number.isFinite(value) ? Math.min(3600, Math.max(600, Math.round(value))) : DEFAULT_WMS_IMAGE_SIZE; },
  normaliseLogLevel(value) { const level = String(value || "INFO").toUpperCase(); return Object.hasOwn(LOG_LEVELS, level) ? level : "INFO"; },
  normaliseStaleAfter(value) { if (value === 0) return 0; return Number.isFinite(value) && value > 0 ? Math.round(value) : DEFAULT_STALE_AFTER; },
  normaliseRetryDelays(value) {
    return Array.isArray(value)
      ? value.filter((v) => Number.isFinite(v) && v >= 0).map((v) => Math.min(MAX_RETRY_DELAY, Math.round(v))).slice(0, 5)
      : [...DEFAULT_RETRY_DELAYS];
  },
  getClient(instanceId) { return this.clients.get(instanceId) || null; },
  getPaths(client) { return getCachePaths(this.moduleDirectory, client.config.cacheId, client.config.selection.resolved); },
  isCurrent(instanceId, client) { return this.getClient(instanceId) === client && !client.abortController.signal.aborted; },
  assertCurrent(instanceId, client) { if (!this.isCurrent(instanceId, client)) throw abortError(); },

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
    const summary = { trigger, result: "failed", capabilitiesSource: null, remoteTime: null, cachedTime: null, downloaded: false, processed: false, downloadBytes: null };
    const { config } = client;
    const { selection } = config;
    const paths = this.getPaths(client);
    ensureCache(paths);
    const debug = (title, entries) => entries && typeof entries === "object" ? logger.block("DEBUG", title, entries) : logger.debug(`${title}${entries ? `: ${entries}` : ""}`);

    try {
      const previousState = readState(paths, (message) => logger.warn(message));
      summary.cachedTime = previousState.imageTime || null;
      const capabilities = await this.runWithRetries(client, "GetCapabilities", () => fetchLatestImageTime(selection.profile, USER_AGENT, debug, client.abortController.signal));
      this.assertCurrent(instanceId, client);
      const latestImageTime = capabilities.imageTime;
      summary.capabilitiesSource = capabilities.source;
      summary.remoteTime = latestImageTime || null;

      const latestTimestamp = Date.parse(latestImageTime);
      const previousTimestamp = Date.parse(previousState.imageTime);
      const cacheComplete = exists(paths.sourceFile) && exists(paths.imageFile);
      let decision = "download";
      if (cacheComplete && Number.isFinite(latestTimestamp) && Number.isFinite(previousTimestamp) && latestTimestamp <= previousTimestamp) decision = "skip";

      if (decision === "skip") {
        summary.result = "unchanged";
        this.warnIfStale(instanceId, previousState.imageTime, config.staleAfter);
        this.sendStatus("METEOSAT_IMAGE_UNCHANGED", instanceId, previousState, paths);
        return;
      }

      const sourceResult = await this.runWithRetries(client, "GetMap", () => downloadWmsImage({
        profile: selection.profile, targetFile: paths.sourceFile, tempFile: paths.tempSourceFile,
        size: config.wmsImageSize, userAgent: USER_AGENT, imageTime: latestImageTime,
        debug, signal: client.abortController.signal,
        isActive: () => this.isCurrent(instanceId, client)
      }));
      this.assertCurrent(instanceId, client);
      summary.downloaded = true;
      summary.downloadBytes = sourceResult.bytes;

      if (previousState.contentHash === sourceResult.hash && exists(paths.imageFile)) {
        const unchangedState = writeState(paths, {
          ...previousState,
          imageTime: sourceResult.imageTime || previousState.imageTime || null,
          responseTime: sourceResult.responseTime || previousState.responseTime || null,
          downloadedAt: sourceResult.downloadedAt || previousState.downloadedAt || null
        });
        summary.result = "same-content";
        this.warnIfStale(instanceId, unchangedState.imageTime, config.staleAfter);
        this.sendStatus("METEOSAT_IMAGE_UNCHANGED", instanceId, unchangedState, paths);
        return;
      }

      const processing = await processImage({
        sourceFile: paths.sourceFile, targetFile: paths.imageFile, tempFile: paths.tempImageFile, debug,
        isActive: () => this.isCurrent(instanceId, client)
      });
      this.assertCurrent(instanceId, client);
      summary.processed = true;
      const state = writeState(paths, {
        requestedProduct: selection.requested, resolvedProduct: selection.resolved,
        productLabel: selection.profile.label, layer: selection.profile.layer,
        source: sourceResult.source, contentHash: sourceResult.hash,
        imageTime: sourceResult.imageTime, responseTime: sourceResult.responseTime,
        downloadedAt: sourceResult.downloadedAt, processing
      });
      summary.result = "updated";
      this.warnIfStale(instanceId, state.imageTime, config.staleAfter);
      logger.info(`Image updated: ${selection.profile.label}.`);
      this.sendStatus("METEOSAT_IMAGE_UPDATED", instanceId, state, paths);
    } catch (error) {
      if (error.name === "AbortError") {
        summary.result = "aborted";
        logger.debug(error.message);
      } else {
        this.handleError(instanceId, client, paths, error);
      }
    } finally {
      summary.durationMs = Math.round(performance.now() - cycleStarted);
      logger.block("DEBUG", "Update summary", summary);
      client.updateRunning = false;
      client.updateStartedAt = null;
    }
  },

  async runWithRetries(client, operationName, operation) {
    const { logger, config, abortController } = client;
    const retryDelays = config.retryDelays || [];
    const totalAttempts = retryDelays.length + 1;
    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
      if (abortController.signal.aborted) throw abortError();
      try {
        return await operation();
      } catch (error) {
        if (abortController.signal.aborted || error.name === "AbortError") throw abortError();
        logger.block("DEBUG", `${operationName} attempt failed`, { attempt: `${attempt}/${totalAttempts}`, message: error.message, status: error.status, retryable: error.retryable === true, details: error.details || null });
        if (error?.retryable !== true || attempt >= totalAttempts) throw error;
        const delay = retryDelays[attempt - 1];
        logger.warn(`${operationName} attempt ${attempt}/${totalAttempts} failed: ${error.message} Retrying in ${Math.round(delay / 1000)} seconds.`);
        await sleep(delay, abortController.signal);
      }
    }
  },

  sendCachedStatus(instanceId) {
    const client = this.getClient(instanceId);
    if (!client) return;
    const paths = this.getPaths(client);
    const state = readState(paths, (message) => client.logger.warn(message));
    if (exists(paths.imageFile)) {
      this.warnIfStale(instanceId, state.imageTime, client.config.staleAfter);
      this.sendStatus("METEOSAT_IMAGE_UNCHANGED", instanceId, state, paths);
    } else this.sendSocketNotification("METEOSAT_NO_IMAGE", { instanceId });
  },

  sendStatus(notification, instanceId, state, paths) {
    this.sendSocketNotification(notification, {
      instanceId,
      acquisitionTime: state.imageTime || null,
      downloadedAt: state.downloadedAt || null,
      imagePath: paths.relativeImageFile,
      productLabel: state.productLabel || this.getClient(instanceId)?.config.selection.profile.label || null,
      imageVersion: Date.now()
    });
  },

  warnIfStale(instanceId, imageTime, staleAfter) {
    const client = this.getClient(instanceId);
    if (!staleAfter || !imageTime) return;
    const timestamp = Date.parse(imageTime);
    if (!Number.isFinite(timestamp)) return;
    const age = Math.max(0, Date.now() - timestamp);
    if (age > staleAfter) client?.logger.warn(`The latest satellite image is ${Math.round(age / 60_000)} minutes old (warning threshold: ${Math.round(staleAfter / 60_000)} minutes).`);
  },

  handleError(instanceId, client, paths, error) {
    client.logger.block("ERROR", "Update failed", {
      name: error.name, message: error.message, status: error.status,
      retryable: error.retryable === true, details: error.details || null,
      stack: client.config.logLevel === "DEBUG" ? error.stack : null
    });
    if (!this.isCurrent(instanceId, client)) return;
    if (exists(paths.imageFile)) {
      this.sendStatus("METEOSAT_IMAGE_UNCHANGED", instanceId, readState(paths), paths);
      return;
    }
    this.sendSocketNotification("METEOSAT_IMAGE_ERROR", { instanceId });
  }
});
