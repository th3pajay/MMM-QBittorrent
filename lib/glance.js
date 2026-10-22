(function (root, factory) {
  if (typeof module === "object" && module.exports && typeof window === "undefined") module.exports = factory(require("./config"), require("./torrent-state"), require("./format"))
  else root.MMMQBGlance = factory(root.MMMQBConfig, root.MMMQBTorrentState, root.MMMQBFormat)
})(typeof self !== "undefined" ? self : this, function (Config, TorrentState, Format) {
  const C = Config.CONSTANTS
  const GROUPS = ["downloading", "seeding", "paused", "stalled", "error"]
  const make = html => {
    const d = document.createElement("div")
    d.innerHTML = html.trim()
    return d.firstElementChild
  }
  const part = (el, key) => el.querySelector(`[data-k="${key}"]`)
  const setHtml = (node, html) => {
    if (node._html === html) return
    node._html = html
    node.innerHTML = html
  }
  const speedParts = bytes => (Format.speed(bytes) || "0 KB/s").split(" ")
  const LINE = 1.1
  const mod10 = n => ((n % 10) + 10) % 10

  function createReel(digit) {
    const el = document.createElement("span")
    const strip = document.createElement("span")
    el.className = "qg-reel"
    strip.className = "qg-strip"
    strip.textContent = digit
    el.append(strip)
    let anim = null
    let from = 0
    let to = 0
    let cells = [digit]
    const reel = { el, value: digit, settle, roll }

    function settle(d) {
      if (!anim && reel.value === d) return
      if (anim) anim.cancel()
      anim = null
      reel.value = d
      cells = [d]
      strip.textContent = d
      strip.style.willChange = ""
      el.classList.remove("qg-rolling")
    }

    function roll(target, { dur, delay, spins, dir }) {
      let p = 0
      if (anim) {
        p = from + (to - from) * (anim.effect.getComputedTiming().progress || 0)
        anim.cancel()
      }
      const fl = Math.min(Math.floor(p), cells.length - 1)
      const split = p - fl > 0.001 && fl + 1 < cells.length
      const frac = split ? p - fl : 0
      const win = split ? [cells[fl], cells[fl + 1]] : [cells[Math.min(Math.round(p), cells.length - 1)]]
      let next
      if (dir > 0) {
        const anchor = win[win.length - 1]
        next = win.slice()
        for (let k = 1, m = mod10(target - anchor) + 10 * spins; k <= m; k++) next.push(mod10(anchor + k))
        from = frac
        to = next.length - 1
      } else {
        const anchor = win[0]
        const n = mod10(anchor - target) + 10 * spins
        next = []
        for (let k = n; k >= 1; k--) next.push(mod10(anchor - k))
        next.push(...win)
        from = n + frac
        to = 0
      }
      reel.value = target
      if (from === to) return settle(target)
      cells = next
      strip.textContent = next.join("\n")
      strip.style.willChange = "transform"
      el.classList.add("qg-rolling")
      const current = strip.animate(
        [{ transform: `translateY(${-from * LINE}em)` }, { transform: `translateY(${-to * LINE}em)` }],
        { duration: dur, delay, easing: "cubic-bezier(0.22, 0.9, 0.28, 1)", fill: "both" }
      )
      anim = current
      current.onfinish = () => {
        if (anim === current) settle(target)
      }
    }

    return reel
  }

  function createRoller(host, unitEl) {
    let items = []
    let shown = ""
    let shownUnit = ""
    let bytes = 0

    function set(value, instant) {
      const [numStr, unit] = speedParts(value)
      if (numStr === shown && unit === shownUnit) {
        bytes = value
        return
      }
      const still = instant || shown === ""
      const norm = Math.min(1, Math.log1p(Math.abs(value - bytes) / Math.max(bytes, 1024)) / Math.log1p(C.ROLL_RATIO_MAX))
      const opts = {
        dur: C.ROLL_SLOW_MS + (C.ROLL_FAST_MS - C.ROLL_SLOW_MS) * norm,
        spins: Math.round(norm * C.ROLL_MAX_SPINS),
        dir: value >= bytes ? 1 : -1
      }
      const offset = Math.random() * C.ROLL_STAGGER_MS
      const chars = [...numStr]
      const next = []
      for (let i = 0; i < Math.max(items.length, chars.length); i++) {
        const old = items[items.length - 1 - i]
        const c = chars[chars.length - 1 - i]
        if (c === undefined) {
          old.el.remove()
          continue
        }
        const digit = c !== "."
        let item = old && Boolean(old.reel) === digit ? old : null
        if (old && !item) old.el.remove()
        if (!item) {
          if (digit) {
            const reel = createReel(still ? +c : 0)
            item = { el: reel.el, reel }
          } else {
            const dot = document.createElement("span")
            dot.className = "qg-dot"
            dot.textContent = "."
            item = { el: dot }
          }
        }
        if (digit) {
          if (still) item.reel.settle(+c)
          else if (item.reel.value !== +c) {
            const jitter = 1 + (Math.random() * 2 - 1) * C.ROLL_JITTER
            item.reel.roll(+c, { ...opts, dur: opts.dur * jitter * (1 + 0.05 * i), delay: offset + Math.random() * 100 + i * 20 })
          }
        }
        next.unshift(item)
      }
      next.forEach((item, idx) => {
        if (host.childNodes[idx] !== item.el) host.insertBefore(item.el, host.childNodes[idx] || null)
      })
      items = next
      if (unit !== shownUnit) {
        unitEl.textContent = unit
        if (!still) unitEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 350, easing: "ease-out" })
      }
      shown = numStr
      shownUnit = unit
      bytes = value
    }

    return { set, reset() { shown = "" } }
  }

  const ROW = actions => `<div class="qg-row"><div class="qg-main">
    <div class="qg-line"><span class="qg-name" data-k="name"></span><span class="qg-pct" data-k="pct"></span></div>
    <div class="qg-bar"><i></i></div>
    <div class="qg-sub"><span class="qg-lbl" data-k="label"></span><span data-k="speed"></span><span data-k="eta"></span><span data-k="extra"></span></div>
    </div>${actions ? '<button class="qg-btn qb-action" data-k="btn"></button>' : ""}</div>`

  const SHELL = `<div class="qb-g">
    <div class="qg-hero">
      <div class="qg-top"><span class="qg-title">QBittorrent</span><span class="qg-ssl" data-k="ssl"></span><span class="qg-conn" data-k="conn"><i></i><span data-k="connText"></span></span></div>
      <div class="qg-dl"><b class="qg-arrow">↓</b><span class="qg-num" data-k="dl"></span><small data-k="dlu"></small></div>
      <div class="qg-ul"><b class="qg-arrow">↑</b><span class="qg-num" data-k="ul"></span><small data-k="ulu"></small></div>
      <div class="qg-counts"></div>
    </div>
    <div class="qg-msg"><span></span><small></small></div>
    <div class="qg-rows"></div><div class="qg-rest"></div><div class="qg-details"><div class="qg-spot"><span class="qg-spk" data-k="spk"></span><span class="qg-spv" data-k="spv"></span></div><div class="qg-dots"></div></div></div>`

  function create({ config, motion, view, locale }) {
    const el = make(SHELL)
    const rows = el.querySelector(".qg-rows")
    const msg = el.querySelector(".qg-msg")
    const rest = el.querySelector(".qg-rest")
    const details = el.querySelector(".qg-details")
    const spot = el.querySelector(".qg-spot")
    const dots = el.querySelector(".qg-dots")
    const counts = el.querySelector(".qg-counts")
    const actions = config.columns.includes("actions")
    const template = ROW(actions)
    const byHash = new Map()
    const cols = new Set(config.columns)
    const EXTRAS = {
      size: t => Format.size(t.size),
      seeds: t => `${t.num_seeds || 0} seeds`,
      peers: t => `${t.num_leechs || 0} peers`,
      ratio: t => `ratio ${(t.ratio || 0).toFixed(2)}`,
      added_on: t => Format.date(t.added_on, locale)
    }
    const extras = config.columns.filter(c => EXTRAS[c]).map(c => EXTRAS[c])
    el.classList.toggle("qg-compact", config.compact)
    el.classList.toggle("qg-tint", config.colors.rowTint)
    el.classList.toggle("qg-nobar", !config.showProgressBar)
    for (const c of ["name", "progress", "status", "eta"]) el.classList.toggle(`qg-no-${c}`, !cols.has(c))
    for (const [group, color] of Object.entries(config.colors.statusBadge)) if (color) el.style.setProperty(`--qg-${group}`, color)
    let mounted = false
    let stats = []
    let index = 0
    let timer = null
    const dlRoll = createRoller(part(el, "dl"), part(el, "dlu"))
    const ulRoll = createRoller(part(el, "ul"), part(el, "ulu"))

    const text = (scope, key, value, flashKey) => {
      const node = part(scope, key)
      if (node.textContent === value) return
      const had = node.textContent !== ""
      node.textContent = value
      if (flashKey && had) motion.flashTick(node, flashKey)
    }

    function patch(row, t) {
      const d = TorrentState.describe(t.state)
      const prev = row._prev || {}
      const progress = t.progress || 0
      row.dataset.group = d.group
      row.style.setProperty("--cb", config.colors.progressBar[d.barGroup] || "")
      row.classList.toggle("qg-active", t.dlspeed > 0)
      row.querySelector(".qg-bar > i").style.width = `${progress * 100}%`
      text(row, "name", t.name)
      text(row, "pct", `${Math.floor(progress * 100)}%`)
      text(row, "speed", t.dlspeed > 0 && cols.has("dlspeed") ? `↓ ${Format.speed(t.dlspeed)}` : t.upspeed > 0 && cols.has("upspeed") ? `↑ ${Format.speed(t.upspeed)}` : "", `${t.hash}:speed`)
      text(row, "eta", t.dlspeed > 0 ? `${Format.eta(t.eta)} left` : "")
      text(row, "extra", extras.map(f => f(t)).join(" · "))
      const label = part(row, "label")
      if (label.textContent !== d.label) {
        label.textContent = d.label
        if (prev.state && prev.state !== t.state) motion.flashTick(label, `${t.hash}:flip`, "qg-flip", C.ENTER_ANIM_MS)
      }
      const btn = part(row, "btn")
      if (btn) {
        const glyph = d.stopped ? "▶" : "⏸"
        if (btn.textContent !== glyph && prev.state) motion.flashTick(btn, `${t.hash}:glyph`, "qg-glyph", C.ENTER_ANIM_MS)
        btn.textContent = glyph
        btn.dataset.hash = t.hash
        btn.dataset.action = d.stopped ? "start" : "pause"
      }
      if (prev.progress < 1 && progress >= 1) motion.triggerComplete(row.querySelector(".qg-bar"), part(row, "pct"), t.hash)
      row._prev = { state: t.state, progress }
    }

    function leave(row, delay) {
      setTimeout(() => {
        row.classList.add("qg-leave")
        setTimeout(() => row.remove(), C.LEAVE_ANIM_MS)
      }, delay)
    }

    function sync(items) {
      const keep = new Set(items.map(t => t.hash))
      for (const [hash, row] of byHash) {
        if (keep.has(hash)) continue
        byHash.delete(hash)
        const t = view.get(hash)
        const done = Boolean(t) && t.progress >= 1 && row._prev.progress < 1
        if (done) patch(row, t)
        leave(row, done && !motion.reduced() ? C.COMPLETE_ANIM_MS : 0)
      }
      items.forEach((t, i) => {
        let row = byHash.get(t.hash)
        if (!row) {
          row = make(template)
          byHash.set(t.hash, row)
          if (mounted) motion.flashTick(row, `${t.hash}:enter`, "qg-enter", C.ENTER_ANIM_MS)
        }
        patch(row, t)
        const live = [...rows.children].filter(c => !c.classList.contains("qg-leave"))
        if (live[i] !== row) rows.insertBefore(row, live[i] || null)
      })
      mounted = true
    }

    function showStat(animate) {
      const stat = stats[index]
      part(el, "spk").textContent = stat.label
      part(el, "spv").textContent = stat.value
      ;[...dots.children].forEach((dot, i) => dot.classList.toggle("on", i === index))
      if (animate) motion.flashTick(spot, "spot", "qg-swap", C.TICK_ANIM_MS)
    }

    function syncStats(next) {
      if (next.length !== stats.length) {
        setHtml(dots, next.map(() => "<i></i>").join(""))
        index = 0
      }
      stats = next
      details.hidden = !next.length
      if (next.length) showStat(false)
      if (next.length > 1 && !timer) {
        timer = setInterval(() => {
          index = (index + 1) % stats.length
          showStat(true)
        }, C.DETAILS_ROTATE_MS)
      } else if (next.length < 2 && timer) {
        clearInterval(timer)
        timer = null
      }
    }

    function show(title, detail, error) {
      msg.hidden = false
      msg.classList.toggle("qg-err", Boolean(error))
      msg.firstChild.textContent = title
      msg.lastChild.textContent = detail || ""
    }

    return {
      el,
      update(status) {
        const ok = status.state === "ok"
        el.classList.toggle("qg-off", !ok)
        text(el, "ssl", status.ssl ? "⚠ SSL off" : "")
        msg.hidden = true
        rows.hidden = rest.hidden = details.hidden = !ok
        const conn = part(el, "conn")
        conn.hidden = status.state === "connecting"
        if (!ok) {
          dlRoll.reset()
          ulRoll.reset()
          conn.dataset.state = "disconnected"
          text(el, "connText", "Offline")
          return show(status.message, status.details, status.state === "error")
        }

        const g = view.glance(config)
        const still = motion.reduced() || document.hidden
        dlRoll.set(g.dl, still)
        ulRoll.set(g.ul, still)
        const link = g.connection || "connected"
        conn.dataset.state = link
        text(el, "connText", link[0].toUpperCase() + link.slice(1))
        setHtml(counts, GROUPS.filter(n => g.counts[n]).map(n => `<span data-group="${n}"><b>${g.counts[n]}</b> ${n}</span>`).join(""))

        if (!g.rows.length && !g.seeding && !g.more) show("No torrents")
        sync(g.rows)
        rest.hidden = !g.seeding && !g.more
        setHtml(rest, (g.seeding ? `<span><b>${g.seeding}</b> seeding</span>` : "") + (g.more ? `<span>+ ${g.more} more</span>` : ""))
        syncStats(config.headerDetails.show ? view.headerStats(config.headerDetails.components) : [])
      },
      stop() {
        clearInterval(timer)
        timer = null
      }
    }
  }

  return { create }
})
