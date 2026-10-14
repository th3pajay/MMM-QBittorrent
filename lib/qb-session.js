const { CONSTANTS } = require("./config")

const ACTION_ENDPOINTS = {
  resume: CONSTANTS.API_TORRENTS_RESUME,
  pause: CONSTANTS.API_TORRENTS_PAUSE,
  start: CONSTANTS.API_TORRENTS_START,
  stop: CONSTANTS.API_TORRENTS_STOP
}

const isAuthStatus = status => status === 401 || status === 403
const FIELDS = ["hash", "name", "state", "progress", "size", "dlspeed", "upspeed", "eta", "ratio", "num_seeds", "num_leechs", "added_on", "uploaded", "downloaded", "completed"]

const slim = torrent => {
  const out = {}
  for (const field of FIELDS) if (field in torrent) out[field] = torrent[field]
  return out
}
const FORM = { "Content-Type": "application/x-www-form-urlencoded" }

function createSession({ connection, adapter, log = () => {} }) {
  const { host, username, password } = connection
  let cookie = null
  let majorVersion = 4
  let loginInFlight = null
  let rid = 0
  let serverState = {}
  const store = new Map()

  function resetSync() {
    rid = 0
    serverState = {}
    store.clear()
  }

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
    resetSync()
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

      let res
      try {
        res = await authedGet(`${CONSTANTS.API_SYNC_MAINDATA}?rid=${rid}`, timeout)
      } catch (e) {
        log(`Fetch error: ${e.message}`)
        return classify(e)
      }

      if (res.status < 200 || res.status >= 300) {
        log(`Fetch failed with status ${res.status}`)
        noteStatus(res.status)
        return failure(isAuthStatus(res.status) ? "auth" : "http", `HTTP ${res.status}`, res.status)
      }

      let data
      try {
        data = JSON.parse(res.body)
      } catch (e) {
        resetSync()
        return failure("parse", `Invalid sync response: ${e.message}`)
      }
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        resetSync()
        log(`Unexpected API response type: ${typeof data}`)
        return failure("parse", "Unexpected sync response format")
      }

      if (data.full_update) {
        store.clear()
        serverState = {}
      }
      for (const [hash, fields] of Object.entries(data.torrents || {})) store.set(hash, { ...store.get(hash), ...slim(fields), hash })
      for (const hash of data.torrents_removed || []) store.delete(hash)
      Object.assign(serverState, data.server_state)
      rid = data.rid ?? rid
      return { ok: true, torrents: [...store.values()], transferInfo: Object.keys(serverState).length ? { ...serverState } : null }
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
        const intent = action === "pause" ? "pause" : "start"
        if (!grouped.has(intent)) grouped.set(intent, new Set())
        grouped.get(intent).add(hash)
      }

      let ok = true
      let sent = 0
      for (const [intent, hashes] of grouped) {
        const post = () => adapter.request({
          url: `${host}${ACTION_ENDPOINTS[verbFor(intent)]}`,
          method: "POST",
          headers: { Cookie: cookie, ...FORM, Origin: host, Referer: `${host}/`, "X-Requested-With": "XMLHttpRequest" },
          body: `hashes=${[...hashes].join("|")}`,
          timeout: 5000
        })
        try {
          let res = await post()
          if (res.status === 404) {
            majorVersion = majorVersion >= 5 ? 4 : 5
            log(`Action endpoint not found, switching to the v${majorVersion} endpoints`)
            res = await post()
          }
          if (res.status >= 200 && res.status < 300) {
            sent += hashes.size
          } else {
            ok = false
            log(`Batch ${intent} failed with status ${res.status}: ${res.body}`)
            noteStatus(res.status)
          }
        } catch (e) {
          ok = false
          log(`Batch ${intent} error: ${e.message}`)
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
