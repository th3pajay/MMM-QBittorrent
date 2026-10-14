(function (root, factory) {
  if (typeof module === "object" && module.exports && typeof window === "undefined") module.exports = factory()
  else root.MMMQBConfig = factory()
})(typeof self !== "undefined" ? self : this, function () {
  const CONSTANTS = {
    COMPLETE_ANIM_MS: 1400,
    TICK_ANIM_MS: 500,
    ENTER_ANIM_MS: 260,
    LEAVE_ANIM_MS: 200,
    DEFAULT_UPDATE_INTERVAL_MS: 5000,
    MAX_BACKOFF_MS: 40000,
    MIN_ETA_FOR_HOURS: 3600,
    MIN_SPEED_FOR_MB: 1048576,
    INFINITE_ETA: 8640000,
    AUTH_RETRY_DELAY_MS: 100,
    ACTION_BATCH_DELAY_MS: 100,
    IDLE_POLL_MULTIPLIER: 4,
    DETAILS_ROTATE_MS: 4000,
    API_AUTH_LOGIN: "/api/v2/auth/login",
    API_APP_VERSION: "/api/v2/app/version",
    API_TORRENTS_INFO: "/api/v2/torrents/info",
    API_TORRENTS_RESUME: "/api/v2/torrents/resume",
    API_TORRENTS_PAUSE: "/api/v2/torrents/pause",
    API_TORRENTS_START: "/api/v2/torrents/start",
    API_TORRENTS_STOP: "/api/v2/torrents/stop",
    API_TRANSFER_INFO: "/api/v2/transfer/info"
  }

  const COLUMN_NAMES = [
    "name", "size", "progress", "status", "seeds", "peers",
    "dlspeed", "upspeed", "eta", "ratio", "added_on", "actions"
  ]
  const DEFAULT_COLUMNS = ["name", "progress", "status", "dlspeed", "eta", "ratio", "actions"]
  const FALLBACK_COLUMNS = ["name", "progress", "status", "actions"]
  const DEFAULT_HEADER_COMPONENTS = [
    "downloadedSession", "uploadedSession",
    "downloadLimit", "uploadLimit",
    "totalShareRatio", "completionRatio",
    "connectedSeeds", "connectedLeechers", "totalPeers"
  ]
  const DEFAULT_SCALE = 0.6

  function pick(...values) {
    for (const v of values) if (v !== undefined && v !== null) return v
    return undefined
  }

  function normalize(raw = {}) {
    const c = raw.connection || {}
    const tls = c.tls || {}
    const p = raw.polling || {}
    const d = raw.display || {}
    const rawColors = d.colors || {}
    const bar = rawColors.progressBar || {}
    const badge = rawColors.statusBadge || {}
    const hd = d.headerDetails || {}

    const layout = pick(d.layout, raw.layout, "glance") === "table" ? "table" : "glance"
    const table = layout === "table"

    const display = {
      layout,
      compact: pick(d.compact, raw.compact, false),
      scale: pick(d.scale, raw.scale, table ? DEFAULT_SCALE : 1),
      maxItems: pick(d.maxItems, raw.maxItems, table ? 5 : 4),
      viewFilter: pick(d.viewFilter, raw.viewFilter, "all"),
      columns: pick(d.columns, raw.columns, DEFAULT_COLUMNS),
      sortBy: pick(d.sortBy, raw.sortBy, "added_on"),
      sortOrder: pick(d.sortOrder, raw.sortOrder, "desc"),
      showProgressBar: pick(d.showProgressBar, raw.showProgressBar, true),
      headerAlign: pick(d.headerAlign, raw.headerAlign, null),
      headerDetails: {
        show: pick(hd.show, false),
        components: pick(hd.components, DEFAULT_HEADER_COMPONENTS)
      },
      colors: {
        rowTint: rawColors.rowTint === true,
        progressBar: {
          downloading: pick(bar.downloading, null),
          seeding: pick(bar.seeding, null),
          stalled: pick(bar.stalled, null),
          error: pick(bar.error, null)
        },
        statusBadge: {
          downloading: pick(badge.downloading, null),
          seeding: pick(badge.seeding, null),
          paused: pick(badge.paused, null),
          error: pick(badge.error, null),
          stalled: pick(badge.stalled, null)
        }
      }
    }

    const warnings = []

    if (typeof display.scale !== "number" || display.scale <= 0 || display.scale > 10) {
      warnings.push(`Invalid scale value: ${display.scale} - using default`)
      display.scale = table ? DEFAULT_SCALE : 1
    }
    if (display.maxItems > 50) {
      warnings.push("maxItems capped at 50 for performance")
      display.maxItems = 50
    }
    display.columns = display.columns.filter(col => COLUMN_NAMES.includes(col))
    if (display.columns.length === 0) display.columns = FALLBACK_COLUMNS.slice()
    if (display.sortBy === "actions" || !COLUMN_NAMES.includes(display.sortBy)) display.sortBy = "added_on"
    if (display.sortOrder !== "asc" && display.sortOrder !== "desc") display.sortOrder = "desc"

    return {
      connection: {
        host: pick(c.host, raw.host, ""),
        username: pick(c.username, raw.username, ""),
        password: pick(c.password, raw.password, ""),
        tls: {
          rejectUnauthorized: pick(tls.rejectUnauthorized, raw.rejectUnauthorized, true),
          ca: pick(tls.ca, null),
          cert: pick(tls.cert, null),
          key: pick(tls.key, null),
          passphrase: pick(tls.passphrase, null),
          minVersion: pick(tls.minVersion, "TLSv1.2"),
          maxVersion: pick(tls.maxVersion, null)
        }
      },
      polling: {
        updateInterval: pick(p.updateInterval, raw.updateInterval, CONSTANTS.DEFAULT_UPDATE_INTERVAL_MS),
        pollTimeout: pick(p.pollTimeout, raw.pollTimeout, 2000),
        maxConsecutiveFailures: pick(p.maxConsecutiveFailures, raw.maxConsecutiveFailures, 3),
        pauseOnRepeatedFailures: pick(p.pauseOnRepeatedFailures, raw.pauseOnRepeatedFailures, false)
      },
      display,
      warnings
    }
  }

  function validate(config) {
    const errors = []
    const { host, tls } = config.connection

    if (!host) errors.push("Host is required")
    else if (!/^https?:\/\//.test(host)) errors.push("Host must start with http:// or https://")

    if (config.polling.updateInterval < 1000) errors.push("Update interval must be at least 1000ms")
    if (config.polling.pollTimeout < 500) errors.push("Poll timeout must be at least 500ms")

    if (tls.cert && !tls.key) errors.push("Client certificate requires a private key (tls.key)")
    if (tls.key && !tls.cert) errors.push("Private key requires a client certificate (tls.cert)")

    return errors
  }

  return { CONSTANTS, COLUMN_NAMES, normalize, validate }
})
