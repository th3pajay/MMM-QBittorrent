const { CONSTANTS } = require("./config")
const { createSession } = require("./qb-session")
const { createScheduler } = require("./poll-scheduler")

function createPipeline({ connection, polling, adapter, onUpdate, onError, onActionFailed, onPhase, log = () => {}, timers = globalThis, random }) {
  const session = createSession({ connection, adapter, log, onPhase })
  let lastSent = null
  let stopped = false
  let queue = []
  let flushTimer = null

  const scheduler = createScheduler({
    session,
    settings: polling,
    log,
    timers,
    random,
    onUpdate: data => {
      const text = JSON.stringify(data)
      if (text === lastSent) return
      lastSent = text
      onUpdate(data)
    },
    onError: error => {
      lastSent = null
      onError(error)
    }
  })

  function schedule() {
    flushTimer = timers.setTimeout(flush, CONSTANTS.ACTION_BATCH_DELAY_MS)
  }

  async function flush() {
    flushTimer = null
    const batch = queue
    queue = []
    if (stopped || batch.length === 0) return

    const result = await session.applyActions(batch)
    if (stopped) return
    if (!result.ok) onActionFailed(batch.map(a => a.hash))
    if (result.reason === "auth") log("Re-auth failed, dropped action queue")
    else await scheduler.refresh()

    if (queue.length > 0 && !flushTimer && !stopped) schedule()
  }

  return {
    start() {
      scheduler.start()
    },

    stop() {
      stopped = true
      scheduler.stop()
      timers.clearTimeout(flushTimer)
      flushTimer = null
      queue = []
    },

    act(action) {
      if (stopped) return
      queue.push(action)
      if (!flushTimer) schedule()
    },

    suspend: () => scheduler.suspend(),
    resume: () => scheduler.resume()
  }
}

module.exports = { createPipeline }
