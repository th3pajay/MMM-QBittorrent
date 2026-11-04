const NodeHelper = require("node_helper")

const Config = require("./lib/config")
const { createHttpAdapter } = require("./lib/http-adapter")
const { createPipeline } = require("./lib/pipeline")
const { createTls } = require("./lib/tls")

module.exports = NodeHelper.create({
  start() {
    this.config = null
    this.pipeline = null
  },

  stop() {
    this.stopPipeline()
  },

  log(msg) {
    console.log(`[MMM-QBittorrent] [QB] ${msg}`)
  },

  validateConfig(config, tls) {
    const checked = tls.check()
    checked.warnings.forEach(w => this.log(`WARNING: ${w}`))

    const errors = Config.validate(config).concat(checked.errors)
    if (errors.length > 0) {
      this.log("Config validation errors: " + errors.join(", "))
      return false
    }
    return true
  },

  startPipeline(tls) {
    this.pipeline = createPipeline({
      connection: this.config.connection,
      polling: this.config.polling,
      adapter: createHttpAdapter({ tlsOptions: tls.options }),
      log: msg => this.log(msg),
      onPhase: phase => this.sendSocketNotification("QB_PHASE", { phase }),
      onUpdate: data => this.sendSocketNotification("QB_UPDATE", data),
      onError: error => this.sendSocketNotification("QB_ERROR", error),
      onActionFailed: hashes => this.sendSocketNotification("QB_ACTION_FAILED", { hashes })
    })
    this.pipeline.start()
  },

  stopPipeline() {
    if (this.pipeline) this.pipeline.stop()
    this.pipeline = null
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "QB_INIT") {
      this.stopPipeline()
      this.config = Config.normalize(payload)
      const tls = createTls({ tls: this.config.connection.tls, baseDir: __dirname })

      if (!this.validateConfig(this.config, tls)) {
        this.sendSocketNotification("QB_ERROR", { message: "Invalid configuration", failures: 0 })
        return
      }

      this.startPipeline(tls)

      if (this.config.connection.tls.rejectUnauthorized === false) {
        this.sendSocketNotification("QB_WARN", { message: "SSL certificate validation disabled" })
      }
    }
    else if (notification === "QB_ACTION") {
      if (this.pipeline) this.pipeline.act(payload)
      else this.log("Action received before initialization, dropping")
    }
    else if (notification === "QB_SUSPEND") {
      if (this.pipeline) this.pipeline.suspend()
    }
    else if (notification === "QB_RESUME") {
      if (this.pipeline) this.pipeline.resume()
    }
  }
})
