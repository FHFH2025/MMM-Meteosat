/* global Module */

const STATUS_REQUEST_DELAY = 3000;

const DEFAULT_MESSAGES = Object.freeze({
  loading: "Loading Meteosat image …",
  noImage: "No Meteosat image is available yet.",
  error: "Meteosat image could not be loaded."
});

Module.register("MMM-Meteosat", {
  defaults: {
    product: "auto",
    cacheId: "",
    imageSize: 550,
    wmsImageSize: 1800,
    updateInterval: 10 * 60 * 1000,
    showTimestamp: true,
    showSource: true,
    showProduct: true,
    showStatus: true,
    messages: DEFAULT_MESSAGES
  },

  start() {
    this.messages = {
      ...DEFAULT_MESSAGES,
      ...(this.config.messages || {})
    };

    this.imageAvailable = false;
    this.imageVersion = Date.now();
    this.imagePath = null;
    this.lastImageTime = null;
    this.productLabel = null;
    this.statusText = this.messages.loading;

    this.sendSocketNotification("METEOSAT_CONFIG", {
      instanceId: this.identifier,
      product: this.config.product,
      cacheId: this.config.cacheId,
      updateInterval: this.config.updateInterval,
      wmsImageSize: this.config.wmsImageSize
    });

    setTimeout(() => {
      this.sendSocketNotification("METEOSAT_STATUS_REQUEST", {
        instanceId: this.identifier
      });
    }, STATUS_REQUEST_DELAY);
  },

  getStyles() {
    return ["MMM-Meteosat.css"];
  },

  socketNotificationReceived(notification, payload = {}) {
    if (payload.instanceId && payload.instanceId !== this.identifier) return;

    if (notification === "METEOSAT_IMAGE_UPDATED" || notification === "METEOSAT_IMAGE_UNCHANGED") {
      this.imageAvailable = true;
      this.imageVersion = payload.imageVersion || this.imageVersion;
      this.imagePath = payload.imagePath || this.imagePath;
      this.lastImageTime = payload.imageTime || this.lastImageTime;
      this.productLabel = payload.productLabel || this.productLabel;
      this.statusText = "";
      this.updateDom(notification === "METEOSAT_IMAGE_UPDATED" ? 500 : 250);
      return;
    }

    if (notification === "METEOSAT_NO_IMAGE") {
      this.showStatusMessage(this.messages.noImage);
      return;
    }

    if (notification === "METEOSAT_IMAGE_ERROR") {
      this.showStatusMessage(this.messages.error);
    }
  },

  showStatusMessage(message) {
    this.imageAvailable = false;
    this.statusText = message;
    this.updateDom(250);
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "mmm-meteosat";

    if (this.imageAvailable && this.imagePath) {
      wrapper.appendChild(this.createImage());
      if (this.config.showTimestamp || this.config.showSource || this.config.showProduct) {
        wrapper.appendChild(this.createCaption());
      }
      return wrapper;
    }

    if (this.config.showStatus) wrapper.appendChild(this.createStatus());
    return wrapper;
  },

  createImage() {
    const image = document.createElement("img");
    image.className = "mmm-meteosat-image";
    image.src = `/modules/MMM-Meteosat/${this.imagePath}?v=${encodeURIComponent(this.imageVersion)}`;
    image.style.width = `${this.config.imageSize}px`;
    image.alt = this.productLabel ? `Current Meteosat ${this.productLabel} image` : "Current Meteosat image";
    image.onerror = () => this.showStatusMessage(this.messages.error);
    return image;
  },

  createCaption() {
    const caption = document.createElement("div");
    caption.className = "mmm-meteosat-timestamp";
    const parts = [];

    if (this.config.showSource) parts.push("EUMETSAT");
    if (this.config.showProduct && this.productLabel) parts.push(this.productLabel);
    if (this.config.showTimestamp && this.lastImageTime) parts.push(this.lastImageTime);

    caption.textContent = parts.join(" · ");
    return caption;
  },

  createStatus() {
    const status = document.createElement("div");
    status.className = "mmm-meteosat-status";
    status.textContent = this.statusText;
    return status;
  }
});
