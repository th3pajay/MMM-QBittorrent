const NodeHelper = require("node_helper")
const https = require("https")
const http = require("http")
const url = require("url")
const fs = require("fs")
const path = require("path")

const CONSTANTS = require("./lib/constants")
const { QBConnectionError, QBAuthenticationError, QBTimeoutError } = require("./lib/errors")

/**
 * @typedef {{connection: {host: string, username: string, password: string, tls: TLSConfig}, polling: {updateInterval: number, pollTimeout: number, maxConsecutiveFailures: number, pauseOnRepeatedFailures: boolean}, display: {maxItems: number, viewFilter: string, compact: boolean, scale: number}}} NormalizedHelperConfig
 * @typedef {{rejectUnauthorized?: boolean, ca?: string|string[], cert?: string, key?: string, passphrase?: string, minVersion?: string, maxVersion?: string}} TLSConfig
 * @typedef {{ok: boolean, status: number, headers: {get: Function, raw: Object}, json: Function, text: Function}} HttpResponse
 */

module.exports = NodeHelper.create({
  STATES: {
    IDLE: 'idle',
    AUTHENTICATING: 'authenticating',
    POLLING: 'polling',
    PAUSED: 'paused',
    ERROR: 'error',
    STOPPED: 'stopped'
  },

  start() {
    this.authCookie = null
    this.config = null
    this.pollingTimer = null
    this.consecutiveFailures = 0
    this.state = this.STATES.IDLE
    this.cachedTlsOptions = null
    this.currentPollInterval = null
    this.log("Helper started")
  },

  stop() {
    this.log("Stopping helper...")
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer)
      this.pollingTimer = null
    }
    this.setState(this.STATES.STOPPED)
  },

  /** @param {string} newState @returns {boolean} */
  setState(newState) {
    const validTransitions = {
      [this.STATES.IDLE]: [this.STATES.AUTHENTICATING, this.STATES.POLLING, this.STATES.STOPPED],
      [this.STATES.AUTHENTICATING]: [this.STATES.POLLING, this.STATES.ERROR, this.STATES.STOPPED],
      [this.STATES.POLLING]: [this.STATES.PAUSED, this.STATES.ERROR, this.STATES.STOPPED, this.STATES.AUTHENTICATING],
      [this.STATES.PAUSED]: [this.STATES.POLLING, this.STATES.STOPPED],
      [this.STATES.ERROR]: [this.STATES.AUTHENTICATING, this.STATES.POLLING, this.STATES.STOPPED],
      [this.STATES.STOPPED]: []
    };

    if (!this.state || !validTransitions[this.state] || validTransitions[this.state].includes(newState)) {
      this.state = newState;
      return true;
    }

    this.log(`Invalid state transition: ${this.state} -> ${newState}`);
    return false;
  },

  /** @param {string} msg */
  log(msg) {
    console.log(`[MMM-QBittorrent] [QB] ${msg}`)
  },

  /** @param {Object} config @returns {NormalizedHelperConfig} */
  normalizeConfig(config) {
    return {
      connection: {
        host: config.connection?.host ?? config.host ?? "",
        username: config.connection?.username ?? config.username ?? "",
        password: config.connection?.password ?? config.password ?? "",
        tls: {
          rejectUnauthorized: config.connection?.tls?.rejectUnauthorized ?? true,
          ca: config.connection?.tls?.ca ?? null,
          cert: config.connection?.tls?.cert ?? null,
          key: config.connection?.tls?.key ?? null,
          passphrase: config.connection?.tls?.passphrase ?? null,
          minVersion: config.connection?.tls?.minVersion ?? "TLSv1.2",
          maxVersion: config.connection?.tls?.maxVersion ?? null,
        }
      },
      polling: {
        updateInterval: config.polling?.updateInterval ?? config.updateInterval ?? 5000,
        pollTimeout: config.polling?.pollTimeout ?? 2000,
        maxConsecutiveFailures: config.polling?.maxConsecutiveFailures ?? 3,
        pauseOnRepeatedFailures: config.polling?.pauseOnRepeatedFailures ?? false,
      },
      display: {
        maxItems: config.display?.maxItems ?? config.maxItems ?? 5,
        viewFilter: config.display?.viewFilter ?? config.viewFilter ?? "all",
        compact: config.display?.compact ?? config.compact ?? false,
        scale: config.display?.scale ?? config.scale ?? 0.6,
      }
    };
  },

  /** @param {NormalizedHelperConfig} config @returns {boolean} */
  validateConfig(config) {
    const errors = [];

    if (!config.connection.host) {
      errors.push("Host is required");
    }

    if (config.connection.host && !config.connection.host.match(/^https?:\/\//)) {
      errors.push("Host must start with http:// or https://");
    }

    if (config.polling.updateInterval < 1000) {
      errors.push("Update interval must be at least 1000ms");
    }

    if (config.polling.pollTimeout < 500) {
      errors.push("Poll timeout must be at least 500ms");
    }

    const tls = config.connection.tls;

    if (tls.cert && !tls.key) {
      errors.push("Client certificate requires a private key (tls.key)");
    }

    if (tls.key && !tls.cert) {
      errors.push("Private key requires a client certificate (tls.cert)");
    }

    if (tls.rejectUnauthorized === false) {
      this.log("WARNING: SSL certificate validation is disabled. Use only for development.");
    }

    try {
      if (tls.ca) {
        const paths = Array.isArray(tls.ca) ? tls.ca : [tls.ca];
        paths.forEach(p => {
          const resolved = this.resolveCertPath(p);
          if (!fs.existsSync(resolved)) {
            errors.push(`CA certificate not found: ${resolved}`);
          }
        });
      }

      if (tls.cert) {
        const resolved = this.resolveCertPath(tls.cert);
        if (!fs.existsSync(resolved)) {
          errors.push(`Client certificate not found: ${resolved}`);
        }
      }

      if (tls.key) {
        const resolved = this.resolveCertPath(tls.key);
        if (!fs.existsSync(resolved)) {
          errors.push(`Private key not found: ${resolved}`);
        } else {
          try {
            const stats = fs.statSync(resolved);
            const mode = stats.mode & 0o777;
            if (mode !== 0o600 && mode !== 0o400) {
              this.log(`WARNING: Private key file ${resolved} has overly permissive permissions (${mode.toString(8)}). Consider: chmod 600 ${resolved}`);
            }
          } catch (e) {
          }
        }
      }
    } catch (e) {
      errors.push(`Certificate validation error: ${e.message}`);
    }

    if (errors.length > 0) {
      this.log("Config validation errors: " + errors.join(", "));
      return false;
    }

    return true;
  },

  /** @param {string} filePath @returns {string} */
  resolveCertPath(filePath) {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.resolve(__dirname, filePath);
  },

  /** @returns {Object} */
  loadTlsOptions() {
    if (this.cachedTlsOptions) {
      return this.cachedTlsOptions;
    }

    const tls = this.config.connection.tls;
    const options = {};

    if (tls.rejectUnauthorized === false) {
      options.rejectUnauthorized = false;
    }

    if (tls.ca) {
      const paths = Array.isArray(tls.ca) ? tls.ca : [tls.ca];
      options.ca = paths.map(p => fs.readFileSync(this.resolveCertPath(p)));
    }

    if (tls.cert && tls.key) {
      options.cert = fs.readFileSync(this.resolveCertPath(tls.cert));
      options.key = fs.readFileSync(this.resolveCertPath(tls.key));

      if (tls.passphrase) {
        options.passphrase = tls.passphrase;
      }
    }

    if (tls.minVersion) {
      options.minVersion = tls.minVersion;
    }

    if (tls.maxVersion) {
      options.maxVersion = tls.maxVersion;
    }

    this.cachedTlsOptions = options;
    return options;
  },

  /** @param {{url: string, method?: string, headers?: Object, body?: string|null, timeout?: number}} options @returns {Promise<HttpResponse>} */
  makeHttpRequest({ url: requestUrl, method = "GET", headers = {}, body = null, timeout = 5000 }) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new url.URL(requestUrl);
      const isHttps = parsedUrl.protocol === "https:";
      const httpModule = isHttps ? https : http;

      const requestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: method,
        headers: headers,
      };

      if (isHttps) {
        Object.assign(requestOptions, this.loadTlsOptions());
      }

      const req = httpModule.request(requestOptions, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            headers: {
              get: (name) => {
                const key = name.toLowerCase();
                const value = res.headers[key];
                if (key === 'set-cookie' && Array.isArray(value)) {
                  return value.join('; ');
                }
                return value;
              },
              raw: res.headers
            },
            json: async () => JSON.parse(data),
            text: async () => data
          });
        });
      });

      req.on("error", (error) => {
        reject(error);
      });

      const timeoutId = setTimeout(() => {
        req.destroy();
        reject(new Error("Request timeout"));
      }, timeout);

      req.on("close", () => {
        clearTimeout(timeoutId);
      });

      if (body) {
        req.write(body);
      }

      req.end();
    });
  },

  /** @returns {Promise<boolean>} */
  async authenticate() {
    const host = this.config.connection.host
    const username = this.config.connection.username
    const password = this.config.connection.password
    this.log(`Host URL: ${host}`)
    this.log("Authenticating...")

    try {
        const res = await this.makeHttpRequest({
            url: `${host}/api/v2/auth/login`,
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
            timeout: 5000
        })

        const responseText = await res.text()
        this.log(`Auth response body: ${responseText}`)
        this.log(`Auth response status: ${res.status}`)

        if (!res.ok) {
            this.log(`Auth failed with HTTP status ${res.status}`)
            return false
        }

        if (responseText !== "Ok.") {
            this.log(`Auth failed: qBittorrent returned "${responseText}"`)
            this.log("Verify username and password are correct")
            return false
        }

        const cookies = res.headers.get("set-cookie")

        if (!cookies) {
            this.log("Auth failed: No session cookie received")
            this.log(`All response headers: ${JSON.stringify(res.headers.raw)}`)
            return false
        }

        this.authCookie = cookies
        this.log(`Authenticated successfully. Cookie set: ${cookies}`)
        return true
    } catch (e) {
        this.log(`Auth error: ${e.message}`)
        return false
    }
},

  startPolling() {
    this.log("Starting polling...")

    if (this.pollingTimer) {
      clearInterval(this.pollingTimer)
    }

    this.consecutiveFailures = 0
    this.setState(this.STATES.POLLING)
    this.currentPollInterval = this.config.polling?.updateInterval || 5000

    this.pollTorrents()

    this.pollingTimer = setInterval(() => {
      if (this.state !== this.STATES.PAUSED && this.state !== this.STATES.STOPPED) {
        this.pollTorrents()
      }
    }, this.currentPollInterval)

    this.log(`Polling started with interval: ${this.currentPollInterval}ms`)
  },

  /** @param {number} newInterval */
  restartPollingWithInterval(newInterval) {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer)
    }
    this.currentPollInterval = newInterval
    this.pollingTimer = setInterval(() => {
      if (this.state !== this.STATES.PAUSED && this.state !== this.STATES.STOPPED) {
        this.pollTorrents()
      }
    }, this.currentPollInterval)
  },

  /** @returns {Promise<void>} */
  async pollTorrents() {
    this.log("Polling torrents...")

    const data = await this.fetchTorrentData()
    const baseInterval = this.config.polling?.updateInterval || 5000

    if (data === null) {
      this.consecutiveFailures++
      this.log(`Poll failed. Consecutive failures: ${this.consecutiveFailures}`)

      const maxBackoffInterval = 40000
      const newInterval = Math.min(
        baseInterval * Math.pow(2, this.consecutiveFailures - 1),
        maxBackoffInterval
      )

      if (newInterval !== this.currentPollInterval) {
        this.log(`Applying exponential backoff. Next poll in ${newInterval}ms`)
        this.restartPollingWithInterval(newInterval)
      }

      const maxFailures = this.config.polling?.maxConsecutiveFailures || 3
      if (this.consecutiveFailures >= 1) {
        if (this.consecutiveFailures >= maxFailures && this.config.polling?.pauseOnRepeatedFailures) {
          this.setState(this.STATES.PAUSED)
          this.log("Pausing polling due to repeated failures")
        } else {
          this.setState(this.STATES.ERROR)
        }
        this.sendSocketNotification("QB_ERROR", {
          message: "Failed to connect to qBittorrent",
          failures: this.consecutiveFailures,
          willRetry: this.consecutiveFailures < maxFailures
        })
      }
    } else {
      if (this.consecutiveFailures > 0) {
        this.log("Polling recovered after failures")
        if (this.currentPollInterval !== baseInterval) {
          this.restartPollingWithInterval(baseInterval)
        }
      }
      this.consecutiveFailures = 0
      this.setState(this.STATES.POLLING)

      this.sendSocketNotification("QB_UPDATE", data)
    }
  },

  /** @returns {Promise<Array|null>} */
  async fetchTorrentData() {
    let waitCount = 0
    const maxWaitCount = 50
    while (this.state === this.STATES.AUTHENTICATING && waitCount < maxWaitCount) {
      await new Promise(resolve => setTimeout(resolve, CONSTANTS.AUTH_RETRY_DELAY_MS))
      waitCount++
    }

    if (this.state === this.STATES.AUTHENTICATING) {
      this.log("Authentication timeout while waiting")
      return null
    }

    if (!this.authCookie) {
      this.setState(this.STATES.AUTHENTICATING)
      const ok = await this.authenticate()
      if (ok) {
        this.setState(this.STATES.POLLING)
      } else {
        this.setState(this.STATES.ERROR)
        this.log("Authentication failed")
        return null
      }
    }

    const host = this.config.connection.host
    const endpoint = "/api/v2/torrents/info"
    const timeout = this.config.polling.pollTimeout

    try {
      const res = await this.makeHttpRequest({
        url: `${host}${endpoint}`,
        method: "GET",
        headers: { Cookie: this.authCookie },
        timeout: timeout
      })

      if (!res.ok) {
        this.log(`Fetch failed with status ${res.status}`)

        if (res.status === 403 || res.status === 401) {
          this.log("Auth may have expired, clearing cookie")
          this.authCookie = null
        }

        return null
      }

      const data = await res.json()
      this.log(`Fetched ${data.length} torrents`)
      return data

    } catch (e) {
      if (e.message === 'Request timeout') {
        this.log(`Fetch timed out after ${timeout}ms`)
      } else {
        this.log(`Fetch error: ${e.message}`)
      }
      return null
    }
  },

  /** @param {{hash: string, action: string}} payload @returns {Promise<void>} */
  async handleAction(payload) {
    const { hash, action } = payload
    this.log(`Handling action: ${action} for torrent ${hash}`)

    const host = this.config.connection.host
    let endpoint = ""

    switch (action) {
      case "start":
      case "resume":
        endpoint = "/api/v2/torrents/resume"
        break
      case "pause":
        endpoint = "/api/v2/torrents/pause"
        break
      default:
        this.log(`Unknown action: ${action}`)
        return
    }

    try {
      const res = await this.makeHttpRequest({
        url: `${host}${endpoint}`,
        method: "POST",
        headers: {
          Cookie: this.authCookie,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: `hashes=${hash}`,
        timeout: 5000
      })

      if (res.ok) {
        this.log(`Action ${action} successful`)
        this.pollTorrents()
      } else {
        this.log(`Action ${action} failed with status ${res.status}`)
      }
    } catch (e) {
      this.log(`Action error: ${e.message}`)
    }
  },

  /** @param {string} notification @param {any} payload */
  socketNotificationReceived(notification, payload) {
    if (notification === "QB_INIT") {
      this.log("Received QB_INIT with config")
      this.config = this.normalizeConfig(payload)
      this.cachedTlsOptions = null

      if (!this.validateConfig(this.config)) {
        this.sendSocketNotification("QB_ERROR", {
          message: "Invalid configuration",
          failures: 0
        })
        return
      }

      this.startPolling()
    }
    else if (notification === "QB_ACTION") {
      this.handleAction(payload)
    }
    else if (notification === "QB_SUSPEND") {
      this.log("Suspending polling")
      this.setState(this.STATES.PAUSED)
    }
    else if (notification === "QB_RESUME") {
      this.log("Resuming polling")
      this.setState(this.STATES.POLLING)
      this.pollTorrents()
    }
  }
})
