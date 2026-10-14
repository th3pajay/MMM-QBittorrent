Module.register("MMM-QBittorrent", {
  defaults: {},

  start() {
    const missing = ["Config", "TorrentState", "Format", "TorrentView", "Motion", "Columns", "Glance"].filter(n => !window[`MMMQB${n}`]);
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

    this.authTimestamp = null;

    this.moduleId = this.identifier;
    const normalized = MMMQBConfig.normalize(this.config);
    normalized.warnings.forEach(w => console.warn("[MMM-QBittorrent]", w));
    this.normalizedConfig = normalized.display;
    this.motion = MMMQBMotion.create();
    this.glance = this.normalizedConfig.layout === "glance"
      ? MMMQBGlance.create({ config: this.normalizedConfig, motion: this.motion, view: this.view, locale: this.config.language || navigator.language })
      : null;
    this.prevHashes = null;
    this.prevAggregateSpeed = null;
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
    };

    this.isListenerAttached = true;
    document.addEventListener('click', this.boundClickHandler);
    document.addEventListener('touchend', this.boundClickHandler);

    this.sendSocketNotification("QB_INIT", this.config);
  },

  getScripts() {
    return ["config", "torrent-state", "format", "torrent-view", "motion", "columns", "glance"].map(name => this.file(`lib/${name}.js`));
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
    if (this.glance) this.glance.stop();
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
      this.authTimestamp = Date.now();

      const { dataChanged, structureChanged, hashes } = this.view.ingest(torrentList, transferInfo);
      this.motion.prune(h => this.view.has(h));
      this.loaded = true;

      if (this.glance) {
        this.glance.update(this.glanceStatus());
      } else if (dataChanged) {
        if (structureChanged) {
          this.animateStructureChange(hashes);
        } else {
          this.incrementalUpdate();
        }
      }
    }
    else if (notification === "QB_WARN") {
      this.sslWarning = payload.message;
      this.refresh();
    }
    else if (notification === "QB_ERROR") {
      this.initializing = false;
      this.loaded = false;
      this.errorMessage = payload.message || "Connection failed";
      this.errorDetails = payload.failures ? `(${payload.failures} consecutive failures)` : "";
      this.refresh();
    }
  },

  refresh() {
    if (this.glance) this.glance.update(this.glanceStatus());
    else this.updateDom();
  },

  glanceStatus() {
    const ssl = Boolean(this.sslWarning);
    if (this.initializing) return { state: "connecting", message: "Connecting to qBittorrent...", ssl };
    if (!this.loaded) return { state: "error", message: this.errorMessage || "qBittorrent offline", details: this.errorDetails, ssl };
    return { state: "ok", ssl };
  },

  /** @returns {HTMLElement} */
  getDom() {
    const wrapper = document.createElement("div");

    if (this.startError || !this.normalizedConfig) {
      wrapper.className = "mmm-qb";
      const msg = document.createElement("div");
      msg.className = "dimmed small qb-status-message";
      msg.style.color = "#ff6b6b";
      msg.textContent = `MMM-QBittorrent did not start: ${this.startError || "start() did not complete (see browser console)"}`;
      wrapper.appendChild(msg);
      return wrapper;
    }

    try {
      const config = this.normalizedConfig;

      wrapper.className = `mmm-qb${config.compact ? " compact" : ""}${config.colors.rowTint ? " qb-tint" : ""}`;
      wrapper.dataset.moduleId = this.moduleId;
      wrapper.style.transform = `scale(${config.scale})`;

      const position = this.data?.position || '';
      if (position && position.includes("bottom")) {
        wrapper.style.transformOrigin = "bottom left";
      } else {
        wrapper.style.transformOrigin = "top left";
      }

      if (this.glance) {
        wrapper.className = "qb-gw";
        this.glance.el.dataset.align = config.headerAlign || (position.includes("right") ? "right" : position.includes("center") ? "center" : "left");
        wrapper.appendChild(this.glance.el);
        this.glance.update(this.glanceStatus());
        return wrapper;
      }

      const header = this.renderModuleHeader(config);
      wrapper.appendChild(header);

      if (this.initializing) {
        const msg = document.createElement("div");
        msg.className = "dimmed small qb-status-message";
        msg.textContent = "Connecting to qBittorrent...";
        wrapper.appendChild(msg);
        return wrapper;
      }

      if (!this.loaded) {
        const msg = document.createElement("div");
        msg.className = "dimmed small qb-status-message";
        msg.textContent = this.errorMessage || "qBittorrent offline";
        wrapper.appendChild(msg);

        if (this.errorDetails) {
          const details = document.createElement("div");
          details.className = "dimmed xsmall qb-status-details";
          details.textContent = this.errorDetails;
          wrapper.appendChild(details);
        }
        return wrapper;
      }

      const displayTorrents = this.getDisplayTorrents(config);

      if (displayTorrents.length > 0) {
        const table = this.renderTable(displayTorrents, config);
        wrapper.appendChild(table);
      } else {
        const msg = document.createElement("div");
        msg.className = "dimmed small qb-status-message";
        msg.textContent = "No torrents to display";
        wrapper.appendChild(msg);
      }

      this.prevHashes = new Set(displayTorrents.map(t => t.hash));

    } catch (error) {
      console.error("[MMM-QBittorrent] Error in getDom():", error);
      wrapper.className = "mmm-qb";

      const errorHeader = document.createElement("div");
      errorHeader.className = "qb-module-header";
      errorHeader.textContent = "QBittorrent";
      wrapper.appendChild(errorHeader);

      const separator = document.createElement("hr");
      separator.className = "qb-header-separator";
      wrapper.appendChild(separator);

      const errorMsg = document.createElement("div");
      errorMsg.className = "dimmed small qb-status-message";
      errorMsg.style.color = "#ff6b6b";
      errorMsg.textContent = `Module Error: ${error.message}`;
      wrapper.appendChild(errorMsg);

      const errorDetails = document.createElement("div");
      errorDetails.className = "dimmed xsmall qb-status-details";
      errorDetails.textContent = "Check browser console for details";
      wrapper.appendChild(errorDetails);
    }

    return wrapper;
  },

  /** @param {NormalizedConfig} config @returns {TorrentData[]} */
  getDisplayTorrents(config) {
    return this.view.select(config);
  },

  incrementalUpdate() {
    const wrapper = document.querySelector(`.mmm-qb[data-module-id="${this.moduleId}"]`);
    if (!wrapper) {
      this.updateDom();
      return;
    }

    const speedSpan = wrapper.querySelector('.qb-header-speed');
    if (speedSpan) {
      const aggregate = this.view.aggregateSpeed();
      if (this.prevAggregateSpeed !== null && aggregate !== this.prevAggregateSpeed && aggregate) {
        this.motion.flashTick(speedSpan, `${this.moduleId}:header`);
      }
      this.prevAggregateSpeed = aggregate;
      speedSpan.textContent = aggregate;
    }

    const config = this.normalizedConfig;
    if (config.headerDetails.show) {
      const stats = this.view.headerStats(config.headerDetails.components);
      for (const { key, value } of stats) {
        const el = wrapper.querySelector(`.qb-stat-value[data-stat="${key}"]`);
        if (el) el.textContent = value;
      }
    }

    const displayTorrents = this.getDisplayTorrents(config);

    for (const torrent of displayTorrents) {
      const row = wrapper.querySelector(`tr[data-hash="${CSS.escape(torrent.hash)}"]`);
      if (!row) {
        this.updateDom();
        return;
      }
      MMMQBColumns.patchRow(row, torrent, this.cellContext(config));
    }
  },

  /** @param {NormalizedConfig} config */
  cellContext(config) {
    return { config, motion: this.motion, locale: this.config.language || navigator.language };
  },

  /** @param {Set<string>} currentHashes */
  animateStructureChange(currentHashes) {
    const wrapper = document.querySelector(`.mmm-qb[data-module-id="${this.moduleId}"]`);
    if (!wrapper || this.motion.reduced()) {
      this.updateDom();
      return;
    }
    const leaving = [...wrapper.querySelectorAll('tr[data-hash]')]
      .filter(r => !currentHashes.has(r.dataset.hash));
    if (leaving.length === 0) {
      this.updateDom();
      return;
    }
    leaving.forEach(r => r.classList.add('qb-row-leave'));
    setTimeout(() => this.updateDom(), MMMQBConfig.CONSTANTS.LEAVE_ANIM_MS);
  },

  /** @param {NormalizedConfig} config @returns {HTMLElement} */
  renderModuleHeader(config) {
    const headerContainer = document.createElement("div");
    headerContainer.className = "qb-header-container";

    let align = config.headerAlign;
    if (!align) {
      const position = this.data?.position || '';
      if (position.includes('left')) align = 'left';
      else if (position.includes('center')) align = 'center';
      else if (position.includes('right')) align = 'right';
      else align = 'left';
    }

    headerContainer.style.textAlign = align;

    const titleRow = document.createElement("div");
    titleRow.className = "qb-header-title-row";

    const headerText = document.createElement("div");
    headerText.className = "qb-module-header";
    headerText.textContent = "QBittorrent";

    const speedSpan = document.createElement("span");
    speedSpan.className = "qb-header-speed";
    speedSpan.textContent = this.view.aggregateSpeed();

    titleRow.appendChild(headerText);
    titleRow.appendChild(speedSpan);
    headerContainer.appendChild(titleRow);

    const separator = document.createElement("hr");
    separator.className = "qb-header-separator";

    if (this.sslWarning) {
      const warning = document.createElement("span");
      warning.className = "qb-ssl-warning";
      warning.textContent = "⚠ SSL off";
      warning.title = this.sslWarning;
      headerContainer.appendChild(warning);
    }

    headerContainer.appendChild(separator);

    if (config.headerDetails.show) {
      const details = this.renderHeaderDetails(config);
      if (details) headerContainer.appendChild(details);
    }

    return headerContainer;
  },

  /** @param {NormalizedConfig} config @returns {HTMLElement|null} */
  renderHeaderDetails(config) {
    const stats = this.view.headerStats(config.headerDetails.components);
    if (stats.length === 0) return null;

    const grid = document.createElement("div");
    grid.className = "qb-header-details";

    for (const { key, label, value } of stats) {
      const cell = document.createElement("div");
      cell.className = "qb-header-stat";
      cell.dataset.stat = key;

      const lbl = document.createElement("span");
      lbl.className = "qb-stat-label";
      lbl.textContent = label;

      const val = document.createElement("span");
      val.className = "qb-stat-value";
      val.dataset.stat = key;
      val.textContent = value;

      cell.appendChild(lbl);
      cell.appendChild(val);
      grid.appendChild(cell);
    }

    return grid;
  },

  /** @param {TorrentData[]} torrents @param {NormalizedConfig} config @returns {HTMLElement} */
  renderTable(torrents, config) {
    const table = document.createElement("table");
    table.className = "qb-table";

    const thead = document.createElement("thead");
    thead.className = "qb-thead";
    thead.appendChild(MMMQBColumns.createHeaderRow(config.columns));
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    tbody.className = "qb-tbody";

    const ctx = this.cellContext(config);
    torrents.forEach(torrent => {
      const enter = Boolean(this.prevHashes) && !this.prevHashes.has(torrent.hash);
      tbody.appendChild(MMMQBColumns.createRow(torrent, ctx, { enter }));
    });

    table.appendChild(tbody);
    return table;
  }
});
