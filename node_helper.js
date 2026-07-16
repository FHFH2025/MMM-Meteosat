const NodeHelper = require("node_helper");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const API_BASE = "https://api.eumetsat.int";
const COLLECTION_ID = "EO:EUM:DAT:0662";
const QUICKLOOK_PATTERN = "QCK-IMAGE-RGB1";
const SOURCE_LABEL = "EUMETSAT";
const DEFAULT_SEARCH_HOURS = 3;
const DEFAULT_UPDATE_INTERVAL = 10 * 60 * 1000;
const MINIMUM_UPDATE_INTERVAL = 5 * 60 * 1000;
const TOKEN_TIMEOUT = 30_000;
const API_TIMEOUT = 60_000;
const MINIMUM_IMAGE_SIZE = 10_000;
const USER_AGENT = "MagicMirror-MMM-Meteosat/1.0";

module.exports = NodeHelper.create({
  start() {
    this.config = {};
    this.timer = null;
    this.updateRunning = false;

    this.cacheDirectory = path.join(__dirname, "cache");
    this.sourceFile = path.join(this.cacheDirectory, "latest-source.jpg");
    this.imageFile = path.join(this.cacheDirectory, "latest.png");
    this.tempSourceFile = path.join(this.cacheDirectory, "latest-source.jpg.tmp");
    this.tempImageFile = path.join(this.cacheDirectory, "latest.png.tmp");
    this.stateFile = path.join(this.cacheDirectory, "status.json");
    this.tempStateFile = path.join(this.cacheDirectory, "status.json.tmp");

    fs.mkdirSync(this.cacheDirectory, {
      recursive: true,
      mode: 0o755
    });

    this.log("Node helper started.");
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "METEOSAT_CONFIG") {
      this.config = this.normaliseConfig(payload || {});
      this.startTimer();
      this.updateImage();
      return;
    }

    if (notification === "METEOSAT_UPDATE") {
      this.updateImage();
      return;
    }

    if (notification === "METEOSAT_STATUS_REQUEST") {
      this.sendCachedStatus();
    }
  },

  normaliseConfig(payload) {
    return {
      consumerKey: payload.consumerKey || "",
      consumerSecret: payload.consumerSecret || "",
      updateInterval: this.normaliseUpdateInterval(payload.updateInterval),
      backgroundThreshold: this.normaliseNumber(
        payload.backgroundThreshold,
        195,
        100,
        254
      ),
      backgroundTolerance: this.normaliseNumber(
        payload.backgroundTolerance,
        45,
        0,
        150
      ),
      edgeRemovalPixels: this.normaliseNumber(
        payload.edgeRemovalPixels,
        3,
        0,
        20
      ),
      edgeFeatherPixels: this.normaliseNumber(
        payload.edgeFeatherPixels,
        2,
        0,
        20
      )
    };
  },

  normaliseUpdateInterval(value) {
    if (!Number.isFinite(value)) {
      return DEFAULT_UPDATE_INTERVAL;
    }

    return Math.max(MINIMUM_UPDATE_INTERVAL, Math.round(value));
  },

  normaliseNumber(value, fallback, minimum, maximum) {
    if (!Number.isFinite(value)) {
      return fallback;
    }

    return Math.min(maximum, Math.max(minimum, Math.round(value)));
  },

  startTimer() {
    if (this.timer) {
      clearInterval(this.timer);
    }

    this.timer = setInterval(() => {
      this.updateImage();
    }, this.config.updateInterval);

    this.log(`Update interval: ${this.config.updateInterval} ms.`);
  },

  async updateImage() {
    if (this.updateRunning) {
      this.log("Update already running; skipping duplicate request.");
      return;
    }

    if (!this.config.consumerKey || !this.config.consumerSecret) {
      this.handleError(
        "consumerKey or consumerSecret is missing from config.js."
      );
      return;
    }

    this.updateRunning = true;

    try {
      this.log("Checking EUMETSAT for a new image.");

      const accessToken = await this.requestAccessToken();
      const product = await this.findNewestProduct(accessToken);
      const previousState = this.readState();

      if (
        previousState.productId === product.id &&
        fs.existsSync(this.imageFile)
      ) {
        this.log("The newest image is already cached.");
        this.sendStatus("METEOSAT_IMAGE_UNCHANGED", previousState);
        return;
      }

      const productDetails = await this.getProductDetails(
        accessToken,
        product.id
      );

      const entryName = this.findRgbQuicklook(productDetails);

      await this.downloadEntry(
        accessToken,
        product.id,
        entryName
      );

      await this.createTransparentImage();

      const state = this.writeState({
        product,
        entryName
      });

      this.log(`Image updated: ${product.id}`);
      this.sendStatus("METEOSAT_IMAGE_UPDATED", state);
    } catch (error) {
      this.handleError(error.message);
    } finally {
      this.updateRunning = false;
    }
  },

  async requestAccessToken() {
    const credentials = Buffer.from(
      `${this.config.consumerKey}:${this.config.consumerSecret}`,
      "utf8"
    ).toString("base64");

    const response = await fetch(`${API_BASE}/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": USER_AGENT
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        validity_period: "3600"
      }),
      signal: AbortSignal.timeout(TOKEN_TIMEOUT)
    });

    if (!response.ok) {
      const body = await response.text();

      throw new Error(
        `Access-token request failed: HTTP ${response.status}` +
        (body ? ` - ${body.slice(0, 300)}` : "")
      );
    }

    const tokenData = await response.json();

    if (!tokenData.access_token) {
      throw new Error(
        "The EUMETSAT response did not contain an access_token."
      );
    }

    return tokenData.access_token;
  },

  async findNewestProduct(accessToken) {
    const endDate = new Date(Date.now());
    const startDate = new Date(
      endDate.getTime() -
      DEFAULT_SEARCH_HOURS * 60 * 60 * 1000
    );

    const query = new URLSearchParams({
      format: "json",
      pi: COLLECTION_ID,
      si: "0",
      c: "10",
      dtstart: startDate.toISOString(),
      dtend: endDate.toISOString()
    });

    const response = await this.authorizedFetch(
      `${API_BASE}/data/search-products/1.0.0/os?${query}`,
      accessToken
    );

    const data = await response.json();

    if (!Array.isArray(data.features) || data.features.length === 0) {
      throw new Error(
        `No MTG FCI products were found during the last ` +
        `${DEFAULT_SEARCH_HOURS} hours.`
      );
    }

    const products = data.features
      .map((feature) => {
        const properties = feature.properties || {};

        return {
          id: feature.id,
          sensingStart: this.extractSensingDate(properties.date, 0),
          sensingEnd: this.extractSensingDate(properties.date, 1),
          publicationTime: properties.updated || null
        };
      })
      .filter((product) => product.id);

    products.sort((left, right) => {
      const leftTime = Date.parse(
        left.sensingStart || left.publicationTime || 0
      );

      const rightTime = Date.parse(
        right.sensingStart || right.publicationTime || 0
      );

      return rightTime - leftTime;
    });

    if (!products[0]) {
      throw new Error("The EUMETSAT search returned no usable product.");
    }

    return products[0];
  },

  extractSensingDate(value, index) {
    if (!value || typeof value !== "string") {
      return null;
    }

    const matches = value.match(
      /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g
    );

    if (!matches || !matches[index]) {
      return null;
    }

    const dateText = matches[index];
    return dateText.endsWith("Z") ? dateText : `${dateText}Z`;
  },

  async getProductDetails(accessToken, productId) {
    const url =
      `${API_BASE}/data/browse/1.0.0/collections/` +
      `${encodeURIComponent(COLLECTION_ID)}/products/` +
      `${encodeURIComponent(productId)}?format=json`;

    const response = await this.authorizedFetch(url, accessToken);
    return response.json();
  },

  findRgbQuicklook(productDetails) {
    const links = productDetails
      ?.properties
      ?.links
      ?.["sip-entries"];

    if (!Array.isArray(links)) {
      throw new Error(
        "The product does not contain a list of downloadable entries."
      );
    }

    const entries = links
      .map((link) => link.title)
      .filter((entry) => typeof entry === "string");

    const extensions = [".jpg", ".jpeg", ".png"];

    for (const extension of extensions) {
      const entry = entries.find(
        (candidate) =>
          candidate.toUpperCase().includes(QUICKLOOK_PATTERN) &&
          candidate.toLowerCase().endsWith(extension)
      );

      if (entry) {
        return entry;
      }
    }

    throw new Error(
      "No RGB1 quicklook was found in the newest product."
    );
  },

  async downloadEntry(accessToken, productId, entryName) {
    const query = new URLSearchParams({
      name: entryName
    });

    const url =
      `${API_BASE}/data/download/1.0.0/collections/` +
      `${encodeURIComponent(COLLECTION_ID)}/products/` +
      `${encodeURIComponent(productId)}/entry?${query}`;

    const response = await this.authorizedFetch(
      url,
      accessToken,
      {
        headers: {
          Accept: "image/jpeg,image/png,image/*;q=0.9"
        }
      }
    );

    const imageBuffer = Buffer.from(await response.arrayBuffer());

    if (imageBuffer.length < MINIMUM_IMAGE_SIZE) {
      throw new Error(
        `The downloaded quicklook is unusually small: ` +
        `${imageBuffer.length} bytes.`
      );
    }

    const metadata = await sharp(imageBuffer).metadata();

    if (metadata.format !== "jpeg" && metadata.format !== "png") {
      throw new Error(
        `Unexpected image format: ${metadata.format || "unknown"}.`
      );
    }

    fs.writeFileSync(this.tempSourceFile, imageBuffer, {
      mode: 0o644
    });

    fs.renameSync(this.tempSourceFile, this.sourceFile);
  },

  isBackgroundCandidate(red, green, blue) {
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);

    return (
      minimum >= this.config.backgroundThreshold &&
      maximum - minimum <= this.config.backgroundTolerance
    );
  },

  buildConnectedBackgroundMask(data, width, height, channels) {
    const pixelCount = width * height;
    const backgroundMask = new Uint8Array(pixelCount);
    const queue = new Int32Array(pixelCount);

    let queueStart = 0;
    let queueEnd = 0;

    const addPixel = (pixelIndex) => {
      if (
        pixelIndex < 0 ||
        pixelIndex >= pixelCount ||
        backgroundMask[pixelIndex]
      ) {
        return;
      }

      const dataOffset = pixelIndex * channels;
      const red = data[dataOffset];
      const green = data[dataOffset + 1];
      const blue = data[dataOffset + 2];

      if (!this.isBackgroundCandidate(red, green, blue)) {
        return;
      }

      backgroundMask[pixelIndex] = 1;
      queue[queueEnd] = pixelIndex;
      queueEnd += 1;
    };

    for (let x = 0; x < width; x += 1) {
      addPixel(x);
      addPixel((height - 1) * width + x);
    }

    for (let y = 1; y < height - 1; y += 1) {
      addPixel(y * width);
      addPixel(y * width + width - 1);
    }

    while (queueStart < queueEnd) {
      const pixelIndex = queue[queueStart];
      queueStart += 1;

      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);

      if (x > 0) {
        addPixel(pixelIndex - 1);
      }

      if (x + 1 < width) {
        addPixel(pixelIndex + 1);
      }

      if (y > 0) {
        addPixel(pixelIndex - width);
      }

      if (y + 1 < height) {
        addPixel(pixelIndex + width);
      }
    }

    return backgroundMask;
  },

  buildEdgeDistanceMap(backgroundMask, width, height) {
    const pixelCount = width * height;
    const maximumDistance =
      this.config.edgeRemovalPixels +
      this.config.edgeFeatherPixels;

    const distanceMap = new Int16Array(pixelCount);
    distanceMap.fill(-1);

    const queue = new Int32Array(pixelCount);
    let queueStart = 0;
    let queueEnd = 0;

    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
      if (backgroundMask[pixelIndex]) {
        distanceMap[pixelIndex] = 0;
        queue[queueEnd] = pixelIndex;
        queueEnd += 1;
      }
    }

    const tryAdd = (neighbourIndex, distance) => {
      if (
        neighbourIndex < 0 ||
        neighbourIndex >= pixelCount ||
        distanceMap[neighbourIndex] !== -1
      ) {
        return;
      }

      distanceMap[neighbourIndex] = distance;
      queue[queueEnd] = neighbourIndex;
      queueEnd += 1;
    };

    while (queueStart < queueEnd) {
      const pixelIndex = queue[queueStart];
      queueStart += 1;

      const currentDistance = distanceMap[pixelIndex];

      if (currentDistance >= maximumDistance) {
        continue;
      }

      const nextDistance = currentDistance + 1;
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);

      if (x > 0) {
        tryAdd(pixelIndex - 1, nextDistance);
      }

      if (x + 1 < width) {
        tryAdd(pixelIndex + 1, nextDistance);
      }

      if (y > 0) {
        tryAdd(pixelIndex - width, nextDistance);
      }

      if (y + 1 < height) {
        tryAdd(pixelIndex + width, nextDistance);
      }

      if (x > 0 && y > 0) {
        tryAdd(pixelIndex - width - 1, nextDistance);
      }

      if (x + 1 < width && y > 0) {
        tryAdd(pixelIndex - width + 1, nextDistance);
      }

      if (x > 0 && y + 1 < height) {
        tryAdd(pixelIndex + width - 1, nextDistance);
      }

      if (x + 1 < width && y + 1 < height) {
        tryAdd(pixelIndex + width + 1, nextDistance);
      }
    }

    return distanceMap;
  },

  applyTransparency(data, width, height, channels) {
    const backgroundMask = this.buildConnectedBackgroundMask(
      data,
      width,
      height,
      channels
    );

    const distanceMap = this.buildEdgeDistanceMap(
      backgroundMask,
      width,
      height
    );

    const removalPixels = this.config.edgeRemovalPixels;
    const featherPixels = this.config.edgeFeatherPixels;
    const pixelCount = width * height;

    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
      const dataOffset = pixelIndex * channels;
      const distance = distanceMap[pixelIndex];

      if (distance < 0) {
        data[dataOffset + 3] = 255;
        continue;
      }

      if (distance <= removalPixels) {
        data[dataOffset + 3] = 0;
        continue;
      }

      if (
        featherPixels > 0 &&
        distance <= removalPixels + featherPixels
      ) {
        const featherPosition = distance - removalPixels;
        const alpha = Math.round(
          255 * featherPosition / (featherPixels + 1)
        );

        data[dataOffset + 3] = Math.max(0, Math.min(255, alpha));
        continue;
      }

      data[dataOffset + 3] = 255;
    }
  },

  async createTransparentImage() {
    const { data, info } = await sharp(this.sourceFile)
      .ensureAlpha()
      .raw()
      .toBuffer({
        resolveWithObject: true
      });

    if (info.channels !== 4) {
      throw new Error(`Unexpected channel count: ${info.channels}.`);
    }

    this.applyTransparency(
      data,
      info.width,
      info.height,
      info.channels
    );

    await sharp(
      data,
      {
        raw: {
          width: info.width,
          height: info.height,
          channels: info.channels
        }
      }
    )
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true
      })
      .toFile(this.tempImageFile);

    fs.chmodSync(this.tempImageFile, 0o644);
    fs.renameSync(this.tempImageFile, this.imageFile);
  },

  async authorizedFetch(url, accessToken, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...(options.headers || {})
      },
      signal: options.signal || AbortSignal.timeout(API_TIMEOUT)
    });

    if (!response.ok) {
      const body = await response.text();

      throw new Error(
        `EUMETSAT request failed: HTTP ${response.status}` +
        (body ? ` - ${body.slice(0, 300)}` : "")
      );
    }

    return response;
  },

  readState() {
    if (!fs.existsSync(this.stateFile)) {
      return {};
    }

    try {
      return JSON.parse(
        fs.readFileSync(this.stateFile, "utf8")
      );
    } catch (error) {
      this.error(`Could not read the status file: ${error.message}`);
      return {};
    }
  },

  writeState({ product, entryName }) {
    const state = {
      productId: product.id,
      entry: entryName,
      sensingStart: product.sensingStart || null,
      sensingEnd: product.sensingEnd || null,
      displayTime: this.formatDisplayTime(
        product.sensingEnd || product.sensingStart
      ),
      downloadedAt: new Date(Date.now()).toISOString(),
      source: SOURCE_LABEL,
      imageFile: "cache/latest.png",
      sourceFile: "cache/latest-source.jpg",
      processing: {
        backgroundThreshold: this.config.backgroundThreshold,
        backgroundTolerance: this.config.backgroundTolerance,
        edgeRemovalPixels: this.config.edgeRemovalPixels,
        edgeFeatherPixels: this.config.edgeFeatherPixels
      }
    };

    fs.writeFileSync(
      this.tempStateFile,
      `${JSON.stringify(state, null, 2)}\n`,
      {
        mode: 0o644
      }
    );

    fs.renameSync(this.tempStateFile, this.stateFile);
    return state;
  },

  formatDisplayTime(value) {
    if (!value) {
      return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  },

  sendCachedStatus() {
    const state = this.readState();

    if (fs.existsSync(this.imageFile)) {
      this.sendStatus("METEOSAT_IMAGE_UNCHANGED", state);
      return;
    }

    this.sendSocketNotification(
      "METEOSAT_IMAGE_ERROR",
      {
        message: "No Meteosat image is available yet."
      }
    );
  },

  sendStatus(notification, state) {
    this.sendSocketNotification(
      notification,
      {
        imageTime: state.displayTime || null,
        productId: state.productId || null,
        downloadedAt: state.downloadedAt || null,
        source: SOURCE_LABEL,
        imageVersion: Date.now()
      }
    );
  },

  handleError(message) {
    this.error(`Update failed: ${message}`);

    if (fs.existsSync(this.imageFile)) {
      const state = this.readState();

      this.sendSocketNotification(
        "METEOSAT_IMAGE_UNCHANGED",
        {
          imageTime: state.displayTime || null,
          productId: state.productId || null,
          downloadedAt: state.downloadedAt || null,
          source: SOURCE_LABEL,
          cached: true,
          error: message,
          imageVersion: Date.now()
        }
      );

      return;
    }

    this.sendSocketNotification(
      "METEOSAT_IMAGE_ERROR",
      {
        message
      }
    );
  },

  log(message) {
    console.log(message);
  },

  error(message) {
    console.error(message);
  }
});
