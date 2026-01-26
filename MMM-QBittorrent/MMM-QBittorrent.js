/**
 * @typedef {{hash: string, name: string, progress: number, state: string, size: number, dlspeed: number, upspeed: number, eta: number, ratio: number, num_seeds: number, num_leechs: number, added_on: number, completed?: number}} TorrentData
 * @typedef {{compact: boolean, scale: number, maxItems: number, viewFilter: string, columns: string[], sortBy: string, sortOrder: string, showProgressBar: boolean, headerAlign: string|null}} NormalizedConfig
 */

Module.register("MMM-QBittorrent", {
  CONSTANTS: {
    PULSE_DURATION_MS: 1000,
    DEFAULT_POLL_TIMEOUT_MS: 2000,
    DEFAULT_UPDATE_INTERVAL_MS: 5000,
    MIN_ETA_FOR_HOURS: 3600,
    MIN_SPEED_FOR_MB: 1048576,
    INFINITE_ETA: 8640000,
    AUTH_RETRY_DELAY_MS: 100,
  },

  COLUMN_DEFINITIONS: {
    name: {
      label: 'Name',
      field: 'name',
      align: 'left',
      sortable: true,
      sortFn: (a, b) => (a.name || '').localeCompare(b.name || ''),
      formatter: function(value) { return value || 'Unknown'; },
      bold: true
    },

    size: {
      label: 'Size',
      field: 'size',
      align: 'right',
      sortable: true,
      sortFn: (a, b) => (a.size || 0) - (b.size || 0),
      formatter: function(value) { return this.formatSize(value); }
    },

    progress: {
      label: 'Progress',
      field: 'progress',
      align: 'center',
      sortable: true,
      sortFn: (a, b) => (a.progress || 0) - (b.progress || 0),
      formatter: function(value) { return { percent: `${Math.round((value || 0) * 100)}%` }; },
      bold: true
    },

    status: {
      label: 'Status',
      field: 'state',
      align: 'center',
      sortable: true,
      sortFn: (a, b) => {
        const priority = {
          downloading: 5, forcedDL: 5, metaDL: 5,
          uploading: 4, forcedUP: 4, stalledUP: 4,
          error: 3, missingFiles: 3,
          pausedDL: 2, pausedUP: 2,
          stalledDL: 1, queuedDL: 1, queuedUP: 1, checkingDL: 1, checkingUP: 1, allocating: 1
        };
        return (priority[b.state] || 0) - (priority[a.state] || 0);
      },
      formatter: function(value) {
        return { state: value, displayText: this.formatStateName(value) };
      },
      bold: true
    },

    seeds: {
      label: 'Seeds',
      field: 'num_seeds',
      align: 'center',
      sortable: true,
      sortFn: (a, b) => (a.num_seeds || 0) - (b.num_seeds || 0),
      formatter: function(value) { return value || 0; }
    },

    peers: {
      label: 'Peers',
      field: 'num_leechs',
      align: 'center',
      sortable: true,
      sortFn: (a, b) => (a.num_leechs || 0) - (b.num_leechs || 0),
      formatter: function(value) { return value || 0; }
    },

    dlspeed: {
      label: 'Down Speed',
      field: 'dlspeed',
      align: 'right',
      sortable: true,
      sortFn: (a, b) => (a.dlspeed || 0) - (b.dlspeed || 0),
      formatter: function(value) { return this.formatSpeed(value); }
    },

    upspeed: {
      label: 'Up Speed',
      field: 'upspeed',
      align: 'right',
      sortable: true,
      sortFn: (a, b) => (a.upspeed || 0) - (b.upspeed || 0),
      formatter: function(value) { return this.formatSpeed(value); }
    },

    eta: {
      label: 'ETA',
      field: 'eta',
      align: 'center',
      sortable: true,
      sortFn: (a, b) => {
        const etaA = a.eta === this.CONSTANTS.INFINITE_ETA ? Infinity : (a.eta || 0);
        const etaB = b.eta === this.CONSTANTS.INFINITE_ETA ? Infinity : (b.eta || 0);
        return etaA - etaB;
      },
      formatter: function(value) { return this.formatETA(value); }
    },

    ratio: {
      label: 'Ratio',
      field: 'ratio',
      align: 'center',
      sortable: true,
      sortFn: (a, b) => (a.ratio || 0) - (b.ratio || 0),
      formatter: function(value) { return (value || 0).toFixed(2); }
    },

    added_on: {
      label: 'Added',
      field: 'added_on',
      align: 'center',
      sortable: true,
      sortFn: (a, b) => (a.added_on || 0) - (b.added_on || 0),
      formatter: function(value) { return this.formatDate(value); }
    },

    actions: {
      label: 'Actions',
      field: null,
      align: 'center',
      sortable: false,
      formatter: function(value, torrent) { return torrent.hash; }
    }
  },

  defaults: {
    host: "",
    username: "",
    password: "",
    updateInterval: 5000,
    maxItems: 5,
    viewFilter: "all",
    compact: false,
    scale: 0.6,
    display: {
      columns: ['name', 'progress', 'status', 'dlspeed', 'eta', 'actions'],
      sortBy: 'added_on',
      sortOrder: 'desc',
      showProgressBar: true,
      headerAlign: null  // auto-detect from position
    }
  },

  start() {
    console.log("[MMM-QBittorrent] Starting module...");

    this.torrents = new Map();
    this.completed = new Set();
    this.loaded = false;
    this.initializing = true;
    this.errorMessage = null;
    this.errorDetails = null;

    this.authTimestamp = null;

    this.moduleId = this.identifier;
    this.cachedDisplayTorrents = null;
    this.cachedConfigHash = null;
    this.normalizedConfig = this.normalizeConfig();

    this.boundClickHandler = (e) => {
      const btn = e.target.closest('.qb-action');
      if (!btn) return;
      const wrapper = btn.closest('.mmm-qb');
      if (!wrapper || wrapper.dataset.moduleId !== this.moduleId) return;
      const hash = btn.dataset.hash;
      const action = btn.dataset.action;
      this.sendSocketNotification("QB_ACTION", { hash, action });
    };

    document.addEventListener('click', this.boundClickHandler);

    console.log("[MMM-QBittorrent] Sending QB_INIT to node_helper with config:", {
      host: this.config.host,
      updateInterval: this.config.updateInterval
    });
    this.sendSocketNotification("QB_INIT", this.config);
  },

  getStyles() {
    return ["styles.css"];
  },

  stop() {
    console.log("[MMM-QBittorrent] Stopping module...");
    if (this.boundClickHandler) {
      document.removeEventListener('click', this.boundClickHandler);
      this.boundClickHandler = null;
    }
  },

  suspend() {
    console.log("[MMM-QBittorrent] Suspending polling");
    if (this.boundClickHandler) {
      document.removeEventListener('click', this.boundClickHandler);
    }
    this.sendSocketNotification("QB_SUSPEND", {});
  },

  resume() {
    console.log("[MMM-QBittorrent] Resuming polling");
    if (this.boundClickHandler) {
      document.addEventListener('click', this.boundClickHandler);
    }
    this.sendSocketNotification("QB_RESUME", {});
  },

  /** @param {TorrentData|null} oldTorrent @param {TorrentData} newTorrent @returns {boolean} */
  hasRelevantChanges(oldTorrent, newTorrent) {
    if (!oldTorrent) return true;
    if (oldTorrent === newTorrent) return false;

    const criticalFields = ['progress', 'state', 'dlspeed', 'upspeed', 'eta'];
    for (const field of criticalFields) {
      if (oldTorrent[field] !== newTorrent[field]) return true;
    }

    const secondaryFields = ['num_seeds', 'num_leechs', 'ratio', 'size', 'completed'];
    for (const field of secondaryFields) {
      if (oldTorrent[field] !== newTorrent[field]) return true;
    }

    return false;
  },

  /** @param {string} notification @param {any} payload */
  socketNotificationReceived(notification, payload) {
    if (notification === "QB_UPDATE") {
      console.log(`[MMM-QBittorrent] Received QB_UPDATE with ${payload?.length || 0} torrents`);
      this.initializing = false;
      this.authTimestamp = Date.now();

      let dataChanged = false;
      let structureChanged = false;
      const currentHashes = new Set(payload.map(t => t.hash));

      for (const hash of this.torrents.keys()) {
        if (!currentHashes.has(hash)) {
          this.torrents.delete(hash);
          this.completed.delete(hash);
          dataChanged = true;
          structureChanged = true;
        }
      }

      payload.forEach(t => {
        const existing = this.torrents.get(t.hash);
        if (!existing) {
          structureChanged = true;
        }
        if (this.hasRelevantChanges(existing, t)) {
          this.torrents.set(t.hash, t);
          dataChanged = true;
        }
      });

      this.loaded = true;

      if (dataChanged) {
        this.cachedDisplayTorrents = null;
        console.log("[MMM-QBittorrent] Data changed, updating DOM");
        if (structureChanged) {
          this.updateDom();
        } else {
          this.incrementalUpdate();
        }
      } else {
        console.log("[MMM-QBittorrent] No data changes, skipping DOM update");
      }
    }

    if (notification === "QB_ERROR") {
      console.error("[MMM-QBittorrent] Received QB_ERROR:", payload);
      this.initializing = false;
      this.loaded = false;
      this.errorMessage = payload.message || "Connection failed";
      this.errorDetails = payload.failures ? `(${payload.failures} consecutive failures)` : "";
      this.updateDom();
    }
  },

  /** @returns {HTMLElement} */
  getDom() {
    const wrapper = document.createElement("div");

    try {
      const config = this.normalizedConfig;

      wrapper.className = `mmm-qb${config.compact ? " compact" : ""}`;
      wrapper.dataset.moduleId = this.moduleId;
      wrapper.style.transform = `scale(${config.scale})`;

      const position = this.data?.position || '';
      if (position && position.includes("bottom")) {
        wrapper.style.transformOrigin = "bottom left";
      } else {
        wrapper.style.transformOrigin = "top left";
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
    const configHash = `${config.sortBy}-${config.sortOrder}-${config.maxItems}-${config.viewFilter}`;
    if (this.cachedDisplayTorrents && this.cachedConfigHash === configHash) {
      return this.cachedDisplayTorrents;
    }

    const sortedTorrents = this.sortTorrents(
      [...this.torrents.values()].filter(t => this.applyFilter(t)),
      config.sortBy,
      config.sortOrder
    );

    const displayTorrents = sortedTorrents.slice(0, config.maxItems);
    this.cachedDisplayTorrents = displayTorrents;
    this.cachedConfigHash = configHash;
    return displayTorrents;
  },

  incrementalUpdate() {
    const wrapper = document.querySelector(`.mmm-qb[data-module-id="${this.moduleId}"]`);
    if (!wrapper) {
      this.updateDom();
      return;
    }

    const config = this.normalizedConfig;
    const displayTorrents = this.getDisplayTorrents(config);

    for (const torrent of displayTorrents) {
      const row = wrapper.querySelector(`tr[data-hash="${torrent.hash}"]`);
      if (!row) {
        this.updateDom();
        return;
      }
      this.updateRowContent(row, torrent, config);
    }
  },

  /** @param {HTMLElement} row @param {TorrentData} torrent @param {NormalizedConfig} config */
  updateRowContent(row, torrent, config) {
    row.className = `qb-row state-${torrent.state}`;

    for (const columnName of config.columns) {
      const colDef = this.COLUMN_DEFINITIONS[columnName];
      if (!colDef) continue;

      const td = row.querySelector(`.col-${columnName}`);
      if (!td) continue;

      switch (columnName) {
        case 'progress':
          const progressBar = td.querySelector('.qb-progress-bar');
          const progressText = td.querySelector('.qb-progress-text, .qb-progress-text-only');
          const percent = `${Math.round((torrent.progress || 0) * 100)}%`;
          if (progressBar) {
            progressBar.style.width = percent;
            const stateClass = this.getProgressBarStateClass(torrent.state, torrent.progress);
            progressBar.className = `qb-progress-bar ${stateClass}`;
          }
          if (progressText) progressText.textContent = percent;
          break;
        case 'status':
          const badge = td.querySelector('.qb-status-badge');
          if (badge) {
            badge.className = `qb-status-badge status-${torrent.state}`;
            badge.textContent = this.formatStateName(torrent.state);
          }
          break;
        case 'actions':
          break;
        default:
          const fieldValue = colDef.field ? torrent[colDef.field] : null;
          const formatted = colDef.formatter.call(this, fieldValue, torrent);
          td.textContent = formatted;
      }
    }
  },

  /** @param {TorrentData} t @returns {boolean} */
  applyFilter(t) {
    const viewFilter = this.config.display?.viewFilter ?? this.config.viewFilter ?? "all";
    switch (viewFilter) {
      case "downloading": return t.state === "downloading";
      case "completed": return t.progress === 1;
      case "paused": return t.state === "paused";
      default: return true;
    }
  },

  /** @returns {NormalizedConfig} */
  normalizeConfig() {
    const config = {
      compact: this.config.display?.compact ?? this.config.compact ?? false,
      scale: this.config.display?.scale ?? this.config.scale ?? 0.6,
      maxItems: this.config.display?.maxItems ?? this.config.maxItems ?? 5,
      viewFilter: this.config.display?.viewFilter ?? this.config.viewFilter ?? "all",
      columns: this.config.display?.columns ?? ['name', 'progress', 'status', 'dlspeed', 'eta', 'actions'],
      sortBy: this.config.display?.sortBy ?? 'added_on',
      sortOrder: this.config.display?.sortOrder ?? 'desc',
      showProgressBar: this.config.display?.showProgressBar ?? true,
      headerAlign: this.config.display?.headerAlign ?? null
    };

    if (typeof config.scale !== 'number' || config.scale <= 0 || config.scale > 10) {
      console.warn("[MMM-QBittorrent] Invalid scale value:", config.scale, "- using default 0.6");
      config.scale = 0.6;
    }

    config.columns = config.columns.filter(col => this.COLUMN_DEFINITIONS[col]);
    if (config.columns.length === 0) {
      config.columns = ['name', 'progress', 'status', 'actions'];
    }

    if (!this.COLUMN_DEFINITIONS[config.sortBy]) {
      config.sortBy = 'added_on';
    }

    if (config.sortOrder !== 'asc' && config.sortOrder !== 'desc') {
      config.sortOrder = 'desc';
    }

    return config;
  },

  /** @param {number} seconds @returns {string} */
  formatETA(seconds) {
    if (seconds <= 0 || seconds === this.CONSTANTS.INFINITE_ETA) return "∞";
    if (seconds < 60) return `${seconds}s`;
    if (seconds < this.CONSTANTS.MIN_ETA_FOR_HOURS) {
      return `${Math.round(seconds / 60)}m`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  },

  /** @param {number} bytesPerSec @returns {string} */
  formatSpeed(bytesPerSec) {
    if (!bytesPerSec) return "";
    if (bytesPerSec < this.CONSTANTS.MIN_SPEED_FOR_MB) {
      return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    }
    return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
  },

  /** @param {string} label @param {string} action @param {string} hash @returns {HTMLElement} */
  actionButton(label, action, hash) {
    const btn = document.createElement("div");
    btn.className = "qb-action";
    btn.textContent = label;
    btn.dataset.hash = hash;
    btn.dataset.action = action;
    return btn;
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

    const headerText = document.createElement("div");
    headerText.className = "qb-module-header";
    headerText.textContent = "QBittorrent";

    const separator = document.createElement("hr");
    separator.className = "qb-header-separator";

    headerContainer.appendChild(headerText);
    headerContainer.appendChild(separator);

    return headerContainer;
  },

  /** @param {TorrentData[]} torrents @param {NormalizedConfig} config @returns {HTMLElement} */
  renderTable(torrents, config) {
    const table = document.createElement("table");
    table.className = "qb-table";

    const thead = this.renderTableHeader(config.columns);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    tbody.className = "qb-tbody";

    torrents.forEach(torrent => {
      const row = this.renderTableRow(torrent, config);
      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    return table;
  },

  /** @param {string[]} columns @returns {HTMLElement} */
  renderTableHeader(columns) {
    const thead = document.createElement("thead");
    thead.className = "qb-thead";

    const headerRow = document.createElement("tr");
    headerRow.className = "qb-header-row";

    columns.forEach(columnName => {
      const colDef = this.COLUMN_DEFINITIONS[columnName];
      if (!colDef) return;

      const th = document.createElement("th");
      th.className = `qb-th ${colDef.className || 'col-' + columnName}`;
      th.textContent = colDef.label;
      th.style.textAlign = colDef.align;

      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    return thead;
  },

  /** @param {TorrentData} torrent @param {NormalizedConfig} config @returns {HTMLElement} */
  renderTableRow(torrent, config) {
    const row = document.createElement("tr");
    row.className = `qb-row state-${torrent.state}`;
    row.dataset.hash = torrent.hash;

    config.columns.forEach(columnName => {
      const colDef = this.COLUMN_DEFINITIONS[columnName];
      if (!colDef) return;

      const td = document.createElement("td");
      td.className = `qb-td ${colDef.className || 'col-' + columnName}`;
      td.style.textAlign = colDef.align;

      if (colDef.bold) {
        td.style.fontWeight = 'bold';
      }

      switch (columnName) {
        case 'progress':
          this.renderProgressCell(td, torrent, config.showProgressBar);
          break;
        case 'status':
          this.renderStatusCell(td, torrent);
          break;
        case 'actions':
          this.renderActionsCell(td, torrent);
          break;
        default:
          const fieldValue = colDef.field ? torrent[colDef.field] : null;
          const formatted = colDef.formatter.call(this, fieldValue, torrent);
          td.textContent = formatted;
      }

      row.appendChild(td);
    });

    return row;
  },

  /** @param {HTMLElement} td @param {TorrentData} torrent @param {boolean} showBar */
  renderProgressCell(td, torrent, showBar) {
    const progressData = this.COLUMN_DEFINITIONS.progress.formatter.call(this, torrent.progress, torrent);

    const container = document.createElement("div");
    container.className = "qb-progress-cell";

    if (showBar) {
      const barContainer = document.createElement("div");
      barContainer.className = "qb-progress-bar-container";

      const bar = document.createElement("div");
      bar.className = "qb-progress-bar";
      bar.style.width = progressData.percent;

      const stateClass = this.getProgressBarStateClass(torrent.state, torrent.progress);
      if (stateClass) {
        bar.classList.add(stateClass);
      }

      if (torrent.progress === 1 && !this.completed.has(torrent.hash)) {
        bar.classList.add("pulse");
        this.completed.add(torrent.hash);
        setTimeout(() => bar.classList.remove("pulse"), this.CONSTANTS.PULSE_DURATION_MS);
      }

      barContainer.appendChild(bar);

      const text = document.createElement("div");
      text.className = "qb-progress-text";
      text.textContent = progressData.percent;

      container.appendChild(barContainer);
      container.appendChild(text);
    } else {
      const text = document.createElement("div");
      text.className = "qb-progress-text-only";
      text.textContent = progressData.percent;
      container.appendChild(text);
    }

    td.appendChild(container);
  },

  /** @param {string} state @param {number} progress @returns {string} */
  getProgressBarStateClass(state, progress) {
    const downloadingStates = ['downloading', 'forcedDL', 'metaDL'];
    const uploadingStates = ['uploading', 'forcedUP', 'stalledUP', 'queuedUP', 'pausedUP'];
    const stalledStates = ['stalledDL', 'queuedDL', 'checkingDL', 'checkingUP', 'allocating'];
    const pausedStates = ['pausedDL'];

    if (downloadingStates.includes(state)) {
      return 'downloading';
    } else if (uploadingStates.includes(state) || progress === 1) {
      return 'seeding';
    } else if (stalledStates.includes(state) || pausedStates.includes(state)) {
      return 'stalled';
    }

    return 'downloading';
  },

  /** @param {HTMLElement} td @param {TorrentData} torrent */
  renderStatusCell(td, torrent) {
    const statusData = this.COLUMN_DEFINITIONS.status.formatter.call(this, torrent.state, torrent);

    const badge = document.createElement("span");
    badge.className = `qb-status-badge status-${statusData.state}`;
    badge.textContent = statusData.displayText;

    td.appendChild(badge);
  },

  /** @param {HTMLElement} td @param {TorrentData} torrent */
  renderActionsCell(td, torrent) {
    const actionsContainer = document.createElement("div");
    actionsContainer.className = "qb-actions-cell";

    actionsContainer.appendChild(this.actionButton("▶", "start", torrent.hash));
    actionsContainer.appendChild(this.actionButton("⏸", "pause", torrent.hash));

    td.appendChild(actionsContainer);
  },

  /** @param {TorrentData[]} torrents @param {string} sortBy @param {string} sortOrder @returns {TorrentData[]} */
  sortTorrents(torrents, sortBy, sortOrder) {
    const colDef = this.COLUMN_DEFINITIONS[sortBy];

    if (!colDef || !colDef.sortable) {
      return torrents.sort((a, b) => (b.added_on || 0) - (a.added_on || 0));
    }

    const sorted = torrents.sort(colDef.sortFn);

    if (sortOrder === 'desc') {
      return sorted.reverse();
    }

    return sorted;
  },

  /** @param {number} bytes @returns {string} */
  formatSize(bytes) {
    if (!bytes || bytes === 0) return "0 B";

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const unitIndex = Math.min(i, units.length - 1);
    const value = bytes / Math.pow(k, unitIndex);
    const decimals = value < 10 ? 1 : 0;

    return `${value.toFixed(decimals)} ${units[unitIndex]}`;
  },

  /** @param {number} timestamp @returns {string} */
  formatDate(timestamp) {
    if (!timestamp) return "Unknown";

    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    else if (diffDays === 1) return "Yesterday";
    else if (diffDays < 7) return `${diffDays}d ago`;
    else if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;

    const options = { month: 'short', day: 'numeric', year: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  },

  /** @param {string} state @returns {string} */
  formatStateName(state) {
    const stateNames = {
      downloading: "Downloading",
      uploading: "Seeding",
      pausedDL: "Paused",
      pausedUP: "Paused",
      stalledDL: "Stalled",
      stalledUP: "Seeding",
      queuedDL: "Queued",
      queuedUP: "Queued",
      checkingDL: "Checking",
      checkingUP: "Checking",
      forcedDL: "Downloading",
      forcedUP: "Seeding",
      metaDL: "Metadata",
      allocating: "Allocating",
      error: "Error",
      missingFiles: "Missing Files"
    };

    return stateNames[state] || state;
  }
});