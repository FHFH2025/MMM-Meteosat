/* global Module */

const STATUS_REQUEST_DELAY = 3000;

Module.register("MMM-Meteosat", {
  defaults: {
    consumerKey: "",
    consumerSecret: "",

    imageSize: 550,
    updateInterval: 10 * 60 * 1000,

    showTimestamp: true,
    showSource: true,
    showStatus: true,

    loadingText: "Loading Meteosat image …",

    backgroundThreshold: 195,
    backgroundTolerance: 45,
    edgeRemovalPixels: 3,
    edgeFeatherPixels: 2
  },

  start() {
    this.imageAvailable = false;
    this.imageVersion = Date.now();
    this.lastImageTime = null;
    this.statusText = this.config.loadingText;

    this.sendSocketNotification("METEOSAT_CONFIG", {
      consumerKey: this.config.consumerKey,
      consumerSecret: this.config.consumerSecret,
      updateInterval: this.config.updateInterval,
      backgroundThreshold: this.config.backgroundThreshold,
      backgroundTolerance: this.config.backgroundTolerance,
      edgeRemovalPixels: this.config.edgeRemovalPixels,
      edgeFeatherPixels: this.config.edgeFeatherPixels
    });

    setTimeout(() => {
      this.sendSocketNotification("METEOSAT_STATUS_REQUEST");
    }, STATUS_REQUEST_DELAY);
  },

  getStyles() {
    return ["MMM-Meteosat.css"];
  },

  socketNotificationReceived(notification, payload = {}) {
    if (notification === "METEOSAT_IMAGE_UPDATED") {
      this.imageAvailable = true;
      this.imageVersion = payload.imageVersion || Date.now();
      this.lastImageTime = payload.imageTime || null;
      this.statusText = "";
      this.updateDom(500);
      return;
    }

    if (notification === "METEOSAT_IMAGE_UNCHANGED") {
      this.imageAvailable = true;
      this.imageVersion =
        payload.imageVersion || this.imageVersion;

      if (payload.imageTime) {
        this.lastImageTime = payload.imageTime;
      }

      this.statusText = "";
      this.updateDom(250);
      return;
    }

    if (notification === "METEOSAT_IMAGE_ERROR") {
      this.imageAvailable = false;
      this.statusText =
        payload.message ||
        "Meteosat image could not be loaded.";

      this.updateDom(250);
    }
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "mmm-meteosat";

    if (this.imageAvailable) {
      wrapper.appendChild(this.createImage());

      if (
        this.config.showTimestamp &&
        this.lastImageTime
      ) {
        wrapper.appendChild(this.createTimestamp());
      }

      return wrapper;
    }

    if (this.config.showStatus) {
      wrapper.appendChild(this.createStatus());
    }

    return wrapper;
  },

  createImage() {
    const image = document.createElement("img");

    image.className = "mmm-meteosat-image";
    image.src =
      "/modules/MMM-Meteosat/cache/latest.png?v=" +
      encodeURIComponent(this.imageVersion);

    image.style.width = `${this.config.imageSize}px`;
    image.alt = "Current Meteosat full-disk image";

    image.onerror = () => {
      this.imageAvailable = false;
      this.statusText =
        "Local Meteosat image could not be displayed.";

      this.updateDom(250);
    };

    return image;
  },

  createTimestamp() {
    const timestamp = document.createElement("div");

    timestamp.className =
      "mmm-meteosat-timestamp";

    timestamp.textContent =
      (this.config.showSource ? "EUMETSAT · " : "") +
      this.lastImageTime;

    return timestamp;
  },

  createStatus() {
    const status = document.createElement("div");

    status.className =
      "mmm-meteosat-status";

    status.textContent = this.statusText;

    return status;
  }
});
