const { CONSTANTS } = require("./config")

const ACTION_ENDPOINTS = {
  resume: CONSTANTS.API_TORRENTS_RESUME,
  pause: CONSTANTS.API_TORRENTS_PAUSE,
  start: CONSTANTS.API_TORRENTS_START,
  stop: CONSTANTS.API_TORRENTS_STOP
}

const isAuthStatus = status => status === 401 || status === 403
const FORM = { "Content-Type": "application/x-www-form-urlencoded" }

function createSession({ connection, adapter, log = () => {} }) {
  const { host, username, password } = connection
  let cookie = null
  let majorVersion = 4
  let loginInFlight = null

  const failure = (reason, message, status) => ({ ok: false, reason, message, ...(status !== undefined && { status }) })

  function classify(err) {
    if (err && err.code === "TIMEOUT") return failure("timeout", "Request timeout")
    return failure("network", err ? err.message : "Network error")
  }

  async function detectVersion() {
    try {
      const res = await adapter.request({
        url: `${host}${CONSTANTS.API_APP_VERSION}`,
        headers: { Cookie: cookie },
        timeout: 3000
      })
      if (res.status >= 200 && res.status < 300) {
        const major = parseInt(res.body.replace(/^v/i, "").split(".")[0], 10)
        if (!isNaN(major)) {
          majorVersion = major
        }
      }
    } catch (e) {
      log(`Version detection failed, defaulting to v${majorVersion} API: ${e.message}`)
    }
  }

  async function login() {
    let res
    try {
      res = await adapter.request({
        url: `${host}${CONSTANTS.API_AUTH_LOGIN}`,
        method: "POST",
        headers: FORM,
        body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
        timeout: 5000
      })
    } catch (e) {
      log(`Auth error: ${e.message}`)
      return classify(e)
    }

    if (res.status < 200 || res.status >= 300) {
      log(`Auth failed with HTTP status ${res.status}`)
      return failure("auth", `Login failed with HTTP ${res.status}`, res.status)
    }
    if (res.body !== "Ok.") {
      log(`Auth failed: qBittorrent returned "${res.body}". Verify username and password.`)
      return failure("auth", "Login rejected: check username and password")
    }

    const cookies = [].concat(res.headers["set-cookie"] || []).join("; ")
    if (!cookies) {
      log("Auth failed: No session cookie received")
      return failure("auth", "Login returned no session cookie")
    }
    const sid = cookies.match(/\bSID=[^;]+/)
    cookie = sid ? sid[0].trim() : cookies.split(";")[0].trim()
    await detectVersion()
    return { ok: true }
  }

  async function ensureLogin() {
    if (cookie) return { ok: true }
    if (!loginInFlight) loginInFlight = login().finally(() => { loginInFlight = null })
    return loginInFlight
  }

  function noteStatus(status) {
    if (isAuthStatus(status)) {
      log("Auth may have expired, clearing cookie")
      cookie = null
    }
  }

  const authedGet = (path, timeout) => adapter.request({ url: `${host}${path}`, headers: { Cookie: cookie }, timeout })

  function verbFor(action) {
    return majorVersion >= 5
      ? (action === "pause" ? "stop" : "start")
      : (action === "start" ? "resume" : "pause")
  }

  return {
    async snapshot({ timeout = 2000 } = {}) {
      const loggedIn = await ensureLogin()
      if (!loggedIn.ok) return loggedIn

      let torrentsRes, transferRes
      try {
        ;[torrentsRes, transferRes] = await Promise.all([
          authedGet(CONSTANTS.API_TORRENTS_INFO, timeout),
          authedGet(CONSTANTS.API_TRANSFER_INFO, timeout).catch(e => { log(`Transfer info fetch error: ${e.message}`); return null })
        ])
      } catch (e) {
        log(`Fetch error: ${e.message}`)
        return classify(e)
      }

      if (torrentsRes.status < 200 || torrentsRes.status >= 300) {
        log(`Fetch failed with status ${torrentsRes.status}`)
        noteStatus(torrentsRes.status)
        return failure(isAuthStatus(torrentsRes.status) ? "auth" : "http", `HTTP ${torrentsRes.status}`, torrentsRes.status)
      }

      let torrents
      try {
        torrents = JSON.parse(torrentsRes.body)
      } catch (e) {
        return failure("parse", `Invalid torrent list: ${e.message}`)
      }
      if (!Array.isArray(torrents)) {
        log(`Unexpected API response type: ${typeof torrents}`)
        return failure("parse", "Unexpected torrent list format")
      }

      let transferInfo = null
      if (transferRes && transferRes.status >= 200 && transferRes.status < 300) {
        try {
          transferInfo = JSON.parse(transferRes.body)
        } catch (e) {
          log(`Transfer info parse error: ${e.message}`)
        }
      }
      return { ok: true, torrents, transferInfo }
    },

    async applyActions(batch) {
      const loggedIn = await ensureLogin()
      if (!loggedIn.ok) return { ok: false, reason: loggedIn.reason, sent: 0 }

      const grouped = new Map()
      for (const { hash, action } of batch) {
        if (!hash || hash === "undefined") {
          log(`Skipping action "${action}": hash is missing`)
          continue
        }
        const verb = verbFor(action)
        if (!grouped.has(verb)) grouped.set(verb, new Set())
        grouped.get(verb).add(hash)
      }

      let ok = true
      let sent = 0
      for (const [verb, hashes] of grouped) {
        try {
          const res = await adapter.request({
            url: `${host}${ACTION_ENDPOINTS[verb]}`,
            method: "POST",
            headers: { Cookie: cookie, ...FORM, Origin: host, Referer: `${host}/`, "X-Requested-With": "XMLHttpRequest" },
            body: `hashes=${[...hashes].join("|")}`,
            timeout: 5000
          })
          if (res.status >= 200 && res.status < 300) {
            sent += hashes.size
          } else {
            ok = false
            log(`Batch ${verb} failed with status ${res.status}: ${res.body}`)
            noteStatus(res.status)
          }
        } catch (e) {
          ok = false
          log(`Batch ${verb} error: ${e.message}`)
        }
      }
      return { ok, sent }
    },

    invalidate() {
      cookie = null
    },

    get majorVersion() { return majorVersion },
    get authenticated() { return cookie !== null }
  }
}

module.exports = { createSession }
