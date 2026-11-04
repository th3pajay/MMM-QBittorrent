const MMMQB_PHASES = {
  connecting: { step: 1, message: "Connecting to qBittorrent..." },
  "signing-in": { step: 2, message: "Signing in..." },
  syncing: { step: 3, message: "Syncing torrents..." }
};

Module.register("MMM-QBittorrent", {
  defaults: {},

  start() {
    const missing = ["Config", "TorrentState", "Format", "TorrentRow", "TorrentView", "Motion", "Columns", "Glance", "Table"].filter(n => !window[`MMMQB${n}`]);
    if (missing.length > 0) {
      this.startError = `Failed to load: ${missing.join(", ")}`;
      console.error("[MMM-QBittorrent]", this.startError);
      return;
    }

    this.view = MMMQBTorrentView.create();
    this.loaded = false;
    this.initializing = true;
    this.errorMessage = null;
    this.errorDetails = null;
    this.phase = "connecting";
    this.retries = 0;
    this.stale = false;

    this.authTimestamp = null;

    this.moduleId = this.identifier;
    const normalized = MMMQBConfig.normalize(this.config);
    normalized.warnings.forEach(w => console.warn("[MMM-QBittorrent]", w));
    this.normalizedConfig = normalized.display;
    this.motion = MMMQBMotion.create();
    const layout = this.normalizedConfig.layout === "glance" ? MMMQBGlance : MMMQBTable;
    this.layout = layout.create({
      config: this.normalizedConfig,
      motion: this.motion,
      view: this.view,
      locale: this.config.language || navigator.language,
      position: this.data?.position || ""
    });
    this.sslWarning = null;

    this.boundClickHandler = (e) => {
      if (e.type === 'touchend') e.preventDefault();
      const btn = e.target.closest('.qb-action');
      if (!btn) return;
      const wrapper = btn.closest('[data-module-id]');
      if (!wrapper || wrapper.dataset.moduleId !== this.moduleId) return;
      const hash = btn.dataset.hash;
      const action = btn.dataset.action;
      this.sendSocketNotification("QB_ACTION", { hash, action });
      if (this.view.expect(hash, action)) this.render();
    };

    this.isListenerAttached = true;
    document.addEventListener('click', this.boundClickHandler);
    document.addEventListener('touchend', this.boundClickHandler);

    this.sendSocketNotification("QB_INIT", this.config);
  },

  getScripts() {
    return ["config", "torrent-state", "format", "torrent-row", "torrent-view", "motion", "columns", "glance", "table"].map(name => this.file(`lib/${name}.js`));
  },

  getStyles() {
    return ["styles.css"];
  },

  stop() {
    if (this.boundClickHandler) {
      document.removeEventListener('click', this.boundClickHandler);
      document.removeEventListener('touchend', this.boundClickHandler);
      this.boundClickHandler = null;
    }
    if (this.motion) this.motion.dispose();
    if (this.layout) this.layout.stop();
  },

  suspend() {
    if (this.boundClickHandler && this.isListenerAttached) {
      document.removeEventListener('click', this.boundClickHandler);
      document.removeEventListener('touchend', this.boundClickHandler);
      this.isListenerAttached = false;
    }
    this.sendSocketNotification("QB_SUSPEND", {});
  },

  resume() {
    if (this.boundClickHandler && !this.isListenerAttached) {
      document.addEventListener('click', this.boundClickHandler);
      document.addEventListener('touchend', this.boundClickHandler);
      this.isListenerAttached = true;
    }
    this.sendSocketNotification("QB_RESUME", {});
  },

  /** @param {string} notification @param {any} payload */
  socketNotificationReceived(notification, payload) {
    if (notification === "QB_UPDATE") {
      const { torrents: torrentList, transferInfo } = payload;
      this.initializing = false;
      this.stale = false;
      this.retries = 0;
      this.authTimestamp = Date.now();

      this.view.ingest(torrentList, transferInfo);
      this.motion.prune(h => this.view.has(h));
      this.loaded = true;
      this.render();
    }
    else if (notification === "QB_ACTION_FAILED") {
      if (this.view.cancel(payload.hashes)) this.render();
    }
    else if (notification === "QB_WARN") {
      this.sslWarning = payload.message;
      this.render();
    }
    else if (notification === "QB_PHASE") {
      if (this.loaded || !MMMQB_PHASES[payload.phase]) return;
      this.phase = payload.phase;
      this.render();
    }
    else if (notification === "QB_ERROR") {
      if (payload.willRetry) {
        this.stale = this.loaded;
        this.retries = payload.failures;
      } else {
        this.initializing = false;
        this.loaded = false;
        this.stale = false;
        this.errorMessage = payload.message || "Connection failed";
        this.errorDetails = payload.failures ? `(${payload.failures} consecutive failures)` : "";
      }
      this.render();
    }
  },

  status() {
    const ssl = Boolean(this.sslWarning);
    if (this.initializing) {
      const { step, message } = MMMQB_PHASES[this.phase];
      const details = `Step ${step} of 3`;
      return { state: "connecting", message, details: this.retries ? `Retry ${this.retries} · ${details}` : details, ssl };
    }
    if (!this.loaded) return { state: "error", message: this.errorMessage || "qBittorrent offline", details: this.errorDetails, ssl };
    if (this.stale) return { state: "ok", stale: true, message: "Reconnecting...", ssl };
    return { state: "ok", ssl };
  },

  render() {
    if (!this.layout) return;
    try {
      this.layout.update(this.status());
    } catch (error) {
      console.error("[MMM-QBittorrent] Error rendering layout:", error);
      this.layout.update({ state: "error", message: `Module Error: ${error.message}`, details: "Check browser console for details", ssl: false });
    }
  },

  /** @returns {HTMLElement} */
  getDom() {
    const wrapper = document.createElement("div");

    if (this.startError || !this.layout) {
      wrapper.className = "mmm-qb";
      const msg = document.createElement("div");
      msg.className = "dimmed small qb-status-message";
      msg.style.color = "#ff6b6b";
      msg.textContent = `MMM-QBittorrent did not start: ${this.startError || "start() did not complete (see browser console)"}`;
      wrapper.appendChild(msg);
      return wrapper;
    }

    wrapper.dataset.moduleId = this.moduleId;
    wrapper.style.transform = `scale(${this.normalizedConfig.scale})`;
    wrapper.style.transformOrigin = (this.data?.position || "").includes("bottom") ? "bottom left" : "top left";
    wrapper.appendChild(this.layout.el);
    this.render();
    return wrapper;
  }
});
