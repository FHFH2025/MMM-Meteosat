"use strict";

const NodeHelper = require("node_helper");
const fs = require("fs");
const path = require("path");
const { resolveProduct } = require("./src/products");
const {
  getCacheId,
  getCachePaths,
  ensureCache,
  readState,
  writeState
} = require("./src/cache");
const { processImage } = require("./src/imageProcessor");
const { downloadWmsImage } = require("./src/sources/wms");

const DEFAULT_UPDATE_INTERVAL = 10 * 60 * 1000;
const MINIMUM_UPDATE_INTERVAL = 5 * 60 * 1000;
const DEFAULT_WMS_IMAGE_SIZE = 1800;
const USER_AGENT = "MagicMirror-MMM-Meteosat/1.2.1";

module.exports = NodeHelper.create({
  start() {
    this.clients = new Map();
    this.moduleDirectory = __dirname;
    fs.mkdirSync(path.join(__dirname, "cache"), {
      recursive: true,
      mode: 0o755
    });
    this.log("Node helper started.");
  },

  socketNotificationReceived(notification, payload = {}) {
    const instanceId = payload.instanceId || "default";

    if (notification === "METEOSAT_CONFIG") {
      this.configureClient(instanceId, payload);
      return;
    }

    if (notification === "METEOSAT_STATUS_REQUEST") {
      this.sendCachedStatus(instanceId);
    }
  },

  configureClient(instanceId, payload) {
    const previous = this.clients.get(instanceId);
    if (previous?.timer) clearInterval(previous.timer);

    const selection = resolveProduct(payload.product);
    const config = {
      cacheId: getCacheId(instanceId, payload.cacheId),
      updateInterval: this.normaliseUpdateInterval(payload.updateInterval),
      wmsImageSize: this.normaliseImageSize(payload.wmsImageSize),
      selection
    };

    const client = { config, timer: null, updateRunning: false };
    client.timer = setInterval(
      () => this.updateImage(instanceId),
      config.updateInterval
    );
    this.clients.set(instanceId, client);

    this.log(
      `[${instanceId}] Product: ${selection.requested} -> ` +
      `${selection.resolved}; cache: ${config.cacheId}; ` +
      `interval: ${config.updateInterval} ms.`
    );
    this.updateImage(instanceId);
  },

  normaliseUpdateInterval(value) {
    return Number.isFinite(value)
      ? Math.max(MINIMUM_UPDATE_INTERVAL, Math.round(value))
      : DEFAULT_UPDATE_INTERVAL;
  },

  normaliseImageSize(value) {
    if (!Number.isFinite(value)) return DEFAULT_WMS_IMAGE_SIZE;
    return Math.min(3600, Math.max(600, Math.round(value)));
  },

  getClient(instanceId) {
    return this.clients.get(instanceId) || null;
  },

  getPaths(client) {
    return getCachePaths(
      this.moduleDirectory,
      client.config.cacheId,
      client.config.selection.resolved
    );
  },

  async updateImage(instanceId) {
    const client = this.getClient(instanceId);
    if (!client) return;

    if (client.updateRunning) {
      this.log(`[${instanceId}] Update already running; skipping duplicate request.`);
      return;
    }

    client.updateRunning = true;
    const { config } = client;
    const { selection } = config;
    const paths = this.getPaths(client);
    ensureCache(paths);

    try {
      this.log(`[${instanceId}] Checking ${selection.profile.label}.`);
      const sourceResult = await downloadWmsImage({
        profile: selection.profile,
        targetFile: paths.sourceFile,
        tempFile: paths.tempSourceFile,
        size: config.wmsImageSize,
        userAgent: USER_AGENT
      });
      const previousState = readState(paths);

      if (
        previousState.contentHash === sourceResult.hash &&
        fs.existsSync(paths.imageFile)
      ) {
        this.log(`[${instanceId}] The newest image is already cached.`);
        this.sendStatus("METEOSAT_IMAGE_UNCHANGED", instanceId, previousState);
        return;
      }

      const processing = await processImage({
        sourceFile: paths.sourceFile,
        targetFile: paths.imageFile,
        tempFile: paths.tempImageFile
      });

      const state = writeState(paths, {
        requestedProduct: selection.requested,
        resolvedProduct: selection.resolved,
        productLabel: selection.profile.label,
        layer: selection.profile.layer,
        source: sourceResult.source,
        contentHash: sourceResult.hash,
        imageTime: sourceResult.imageTime,
        displayTime: this.formatDisplayTime(sourceResult.imageTime),
        downloadedAt: sourceResult.downloadedAt,
        imageFile: paths.relativeImageFile,
        sourceFile: paths.relativeSourceFile,
        processing
      });

      this.log(`[${instanceId}] Image updated: ${selection.profile.label}.`);
      this.sendStatus("METEOSAT_IMAGE_UPDATED", instanceId, state);
    } catch (error) {
      this.handleError(instanceId, paths, error.message);
    } finally {
      client.updateRunning = false;
    }
  },

  sendCachedStatus(instanceId) {
    const client = this.getClient(instanceId);
    if (!client) return;

    const paths = this.getPaths(client);
    const state = readState(paths);

    if (fs.existsSync(paths.imageFile)) {
      this.sendStatus("METEOSAT_IMAGE_UNCHANGED", instanceId, state);
    } else {
      this.sendSocketNotification("METEOSAT_NO_IMAGE", { instanceId });
    }
  },

  sendStatus(notification, instanceId, state) {
    this.sendSocketNotification(notification, {
      instanceId,
      imageTime: state.displayTime || null,
      imagePath: state.imageFile || null,
      productLabel: state.productLabel || null,
      imageVersion: Date.now()
    });
  },

  handleError(instanceId, paths, message) {
    this.error(`[${instanceId}] Update failed: ${message}`);

    if (fs.existsSync(paths.imageFile)) {
      this.sendStatus(
        "METEOSAT_IMAGE_UNCHANGED",
        instanceId,
        readState(paths)
      );
      return;
    }

    this.sendSocketNotification("METEOSAT_IMAGE_ERROR", { instanceId });
  },

  formatDisplayTime(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  },

  log(message) {
    console.log(`[MMM-Meteosat] ${message}`);
  },

  error(message) {
    console.error(`[MMM-Meteosat] ${message}`);
  }
});
