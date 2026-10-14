const { CONSTANTS } = require("./config")
const TorrentState = require("./torrent-state")

function createScheduler({ session, settings, onUpdate, onError, log = () => {}, timers = globalThis, random = Math.random }) {
  let timer = null
  let currentInterval = null
  let failures = 0
  let polling = false
  let paused = false
  let stopped = false
  let rerun = false

  const baseInterval = () => settings.updateInterval || CONSTANTS.DEFAULT_UPDATE_INTERVAL_MS

  function clearTimer() {
    if (timer !== null) {
      timers.clearInterval(timer)
      timer = null
    }
  }

  function setInterval(ms) {
    clearTimer()
    currentInterval = ms
    timer = timers.setInterval(() => {
      if (!paused && !stopped) poll()
    }, ms)
  }

  function backoffInterval() {
    const raw = baseInterval() * Math.pow(2, failures - 1)
    return Math.min(Math.round(raw * (0.75 + random() * 0.5)), CONSTANTS.MAX_BACKOFF_MS)
  }

  function handleFailure(result) {
    failures++
    log(`Poll failed (${result.reason}: ${result.message}). Consecutive failures: ${failures}`)

    if (failures >= 2) {
      log("Clearing session after repeated failures to force re-authentication")
      session.invalidate()
    }

    const next = backoffInterval()
    if (next !== currentInterval) {
      setInterval(next)
    }

    const max = settings.maxConsecutiveFailures || 3
    if (failures >= max && settings.pauseOnRepeatedFailures) {
      paused = true
      log("Pausing polling due to repeated failures")
    }

    onError({ message: "Failed to connect to qBittorrent", reason: result.reason, failures, willRetry: failures < max })
  }

  function handleSuccess(result) {
    const base = baseInterval()
    if (failures > 0) {
      if (currentInterval !== base) setInterval(base)
    }
    failures = 0
    paused = false

    onUpdate({ torrents: result.torrents, transferInfo: result.transferInfo })

    const active = result.torrents.some(t => TorrentState.describe(t.state).active)
    const target = active ? base : base * CONSTANTS.IDLE_POLL_MULTIPLIER
    if (target !== currentInterval) {
      setInterval(target)
    }
  }

  async function poll() {
    if (polling || stopped) return
    polling = true
    try {
      const result = await session.snapshot({ timeout: settings.pollTimeout })
      if (stopped) {
        log("Poll finished after stop, discarding results")
        return
      }
      if (result.ok) handleSuccess(result)
      else handleFailure(result)
    } finally {
      polling = false
      if (rerun) {
        rerun = false
        poll()
      }
    }
  }

  return {
    start() {
      stopped = false
      paused = false
      failures = 0
      setInterval(baseInterval())
      poll()
    },

    stop() {
      stopped = true
      clearTimer()
    },

    suspend() {
      paused = true
    },

    resume() {
      paused = false
      return poll()
    },

    refresh() {
      if (stopped) return Promise.resolve()
      if (currentInterval !== baseInterval()) setInterval(baseInterval())
      CONSTANTS.ACTION_FOLLOW_UP_MS.forEach(ms => timers.setTimeout(poll, ms))
      if (polling) {
        rerun = true
        return Promise.resolve()
      }
      return poll()
    },

    get state() {
      return { failures, paused, stopped, polling, interval: currentInterval }
    }
  }
}

module.exports = { createScheduler }
