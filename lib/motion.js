(function (root, factory) {
  if (typeof module === "object" && module.exports && typeof window === "undefined") module.exports = factory(require("./config"))
  else root.MMMQBMotion = factory(root.MMMQBConfig)
})(typeof self !== "undefined" ? self : this, function (Config) {
  const C = Config.CONSTANTS

  function create({ win = typeof window !== "undefined" ? window : null } = {}) {
    const tickTimers = new Map()
    const pulseTimers = new Map()
    let completed = new Set()

    function reduced() {
      return Boolean(win) && typeof win.matchMedia === "function"
        && win.matchMedia("(prefers-reduced-motion: reduce)").matches
    }

    return {
      reduced,

      flashTick(el, key, cls = "qb-tick", duration = null) {
        if (!el || reduced()) return
        el.classList.remove(cls)
        void el.offsetWidth
        el.classList.add(cls)
        const existing = tickTimers.get(key)
        if (existing) clearTimeout(existing)
        tickTimers.set(key, setTimeout(() => {
          el.classList.remove(cls)
          tickTimers.delete(key)
        }, duration ?? C.TICK_ANIM_MS))
      },

      triggerComplete(bar, text, hash) {
        if (!bar || completed.has(hash)) return
        completed.add(hash)
        if (reduced()) return
        bar.classList.remove("just-completed")
        void bar.offsetWidth
        bar.classList.add("just-completed")
        if (text) text.classList.add("qb-flash-complete")
        if (pulseTimers.has(hash)) clearTimeout(pulseTimers.get(hash))
        pulseTimers.set(hash, setTimeout(() => {
          bar.classList.remove("just-completed")
          if (text) text.classList.remove("qb-flash-complete")
          pulseTimers.delete(hash)
        }, C.COMPLETE_ANIM_MS))
      },

      prune(hasTorrent) {
        completed = new Set([...completed].filter(hasTorrent))
      },

      dispose() {
        for (const id of tickTimers.values()) clearTimeout(id)
        for (const id of pulseTimers.values()) clearTimeout(id)
        tickTimers.clear()
        pulseTimers.clear()
      }
    }
  }

  return { create }
})
