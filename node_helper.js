const NodeHelper = require("node_helper")
const fs = require("fs")
const path = require("path")

const Config = require("./lib/config")
const { createHttpAdapter } = require("./lib/http-adapter")
const { createSession } = require("./lib/qb-session")
const { createScheduler } = require("./lib/poll-scheduler")

module.exports = NodeHelper.create({
  start() {
    this.config = null
    this.session = null
    this.scheduler = null
    this.cachedTlsOptions = null
    this.actionQueue = []
    this.actionTimer = null
  },

  stop() {
    this.stopPipeline()
    if (this.actionTimer) clearTimeout(this.actionTimer)
    this.actionTimer = null
  },

  log(msg) {
    console.log(`[MMM-QBittorrent] [QB] ${msg}`)
  },

  validateConfig(config) {
    const errors = Config.validate(config)
    const tls = config.connection.tls

    if (tls.rejectUnauthorized === false) {
      this.log("WARNING: SSL certificate validation is disabled. Use only for development.")
    }

    try {
      if (tls.ca) {
        const paths = Array.isArray(tls.ca) ? tls.ca : [tls.ca]
        paths.forEach(p => {
          const resolved = this.resolveCertPath(p)
          if (!fs.existsSync(resolved)) errors.push(`CA certificate not found: ${resolved}`)
        })
      }

      if (tls.cert) {
        const resolved = this.resolveCertPath(tls.cert)
        if (!fs.existsSync(resolved)) errors.push(`Client certificate not found: ${resolved}`)
      }

      if (tls.key) {
        const resolved = this.resolveCertPath(tls.key)
        if (!fs.existsSync(resolved)) {
          errors.push(`Private key not found: ${resolved}`)
        } else {
          try {
            const mode = fs.statSync(resolved).mode & 0o777
            if (mode !== 0o600 && mode !== 0o400) {
              this.log(`WARNING: Private key file ${resolved} has overly permissive permissions (${mode.toString(8)}). Consider: chmod 600 ${resolved}`)
            }
          } catch (e) {
            this.log(`Key permissions check failed: ${e.message}`)
          }
        }
      }
    } catch (e) {
      errors.push(`Certificate validation error: ${e.message}`)
    }

    if (errors.length > 0) {
      this.log("Config validation errors: " + errors.join(", "))
      return false
    }
    return true
  },

  resolveCertPath(filePath) {
    return path.isAbsolute(filePath) ? filePath : path.resolve(__dirname, filePath)
  },

  loadTlsOptions() {
    if (this.cachedTlsOptions) return this.cachedTlsOptions

    const tls = this.config.connection.tls
    const options = {}

    if (tls.rejectUnauthorized === false) options.rejectUnauthorized = false

    if (tls.ca) {
      const paths = Array.isArray(tls.ca) ? tls.ca : [tls.ca]
      options.ca = paths.map(p => fs.readFileSync(this.resolveCertPath(p)))
    }

    if (tls.cert && tls.key) {
      options.cert = fs.readFileSync(this.resolveCertPath(tls.cert))
      options.key = fs.readFileSync(this.resolveCertPath(tls.key))
      if (tls.passphrase) options.passphrase = tls.passphrase
    }

    if (tls.minVersion) options.minVersion = tls.minVersion
    if (tls.maxVersion) options.maxVersion = tls.maxVersion

    this.cachedTlsOptions = options
    return options
  },

  startPipeline() {
    this.stopPipeline()

    const log = msg => this.log(msg)
    const session = createSession({
      connection: this.config.connection,
      adapter: createHttpAdapter({ tlsOptions: () => this.loadTlsOptions() }),
      log
    })
    const scheduler = createScheduler({
      session,
      settings: this.config.polling,
      log,
      onUpdate: data => {
        const text = JSON.stringify(data)
        if (text === this.lastSent) return
        this.lastSent = text
        this.sendSocketNotification("QB_UPDATE", data)
      },
      onError: error => {
        this.lastSent = null
        this.sendSocketNotification("QB_ERROR", error)
      }
    })
    this.lastSent = null

    this.session = session
    this.scheduler = scheduler
    scheduler.start()
  },

  stopPipeline() {
    if (this.scheduler) this.scheduler.stop()
    this.scheduler = null
    this.session = null
  },

  handleAction(payload) {
    this.actionQueue.push(payload)
    if (!this.actionTimer) {
      this.actionTimer = setTimeout(() => this.flushActions(), Config.CONSTANTS.ACTION_BATCH_DELAY_MS)
    }
  },

  async flushActions() {
    this.actionTimer = null
    const queue = this.actionQueue
    this.actionQueue = []
    if (queue.length === 0) return

    const { session, scheduler } = this
    if (!session) {
      this.log("Action received before initialization, dropping")
      return
    }

    const result = await session.applyActions(queue)
    if (!result.ok) this.sendSocketNotification("QB_ACTION_FAILED", { hashes: queue.map(a => a.hash) })
    if (result.reason === "auth") {
      this.log("Re-auth failed, dropped action queue")
    } else if (scheduler === this.scheduler) {
      await scheduler.refresh()
    }

    if (this.actionQueue.length > 0 && !this.actionTimer) {
      this.actionTimer = setTimeout(() => this.flushActions(), Config.CONSTANTS.ACTION_BATCH_DELAY_MS)
    }
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "QB_INIT") {
      this.stopPipeline()
      this.config = Config.normalize(payload)
      this.cachedTlsOptions = null

      if (!this.validateConfig(this.config)) {
        this.sendSocketNotification("QB_ERROR", { message: "Invalid configuration", failures: 0 })
        return
      }

      this.startPipeline()

      if (this.config.connection.tls.rejectUnauthorized === false) {
        this.sendSocketNotification("QB_WARN", { message: "SSL certificate validation disabled" })
      }
    }
    else if (notification === "QB_ACTION") {
      this.handleAction(payload)
    }
    else if (notification === "QB_SUSPEND") {
      if (this.scheduler) this.scheduler.suspend()
    }
    else if (notification === "QB_RESUME") {
      if (this.scheduler) this.scheduler.resume()
    }
  }
})
