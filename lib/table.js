(function (root, factory) {
  if (typeof module === "object" && module.exports && typeof window === "undefined") module.exports = factory(require("./config"), require("./columns"))
  else root.MMMQBTable = factory(root.MMMQBConfig, root.MMMQBColumns)
})(typeof self !== "undefined" ? self : this, function (Config, Columns) {
  const div = (className, text) => {
    const node = document.createElement("div")
    node.className = className
    if (text !== undefined) node.textContent = text
    return node
  }

  function create({ config, motion, view, locale, position = "" }) {
    const el = div(`mmm-qb${config.compact ? " compact" : ""}${config.colors.rowTint ? " qb-tint" : ""}`)
    const align = config.headerAlign || (position.includes("center") ? "center" : position.includes("right") ? "right" : "left")
    const ctx = { config, motion, locale }
    let lastKey = null
    let shown = null
    let speedEl = null
    let prevSpeed = null
    let leaveTimer = null

    function header(ssl) {
      const container = div("qb-header-container")
      container.style.textAlign = align

      const titleRow = div("qb-header-title-row")
      speedEl = document.createElement("span")
      speedEl.className = "qb-header-speed"
      prevSpeed = view.aggregateSpeed()
      speedEl.textContent = prevSpeed
      titleRow.append(div("qb-module-header", "QBittorrent"), speedEl)
      container.appendChild(titleRow)

      if (ssl) {
        const warning = document.createElement("span")
        warning.className = "qb-ssl-warning"
        warning.textContent = "⚠ SSL off"
        warning.title = "SSL certificate validation disabled"
        container.appendChild(warning)
      }

      const separator = document.createElement("hr")
      separator.className = "qb-header-separator"
      container.appendChild(separator)

      if (config.headerDetails.show) {
        const stats = view.headerStats(config.headerDetails.components)
        if (stats.length > 0) {
          const grid = div("qb-header-details")
          for (const { key, label, value } of stats) {
            const cell = div("qb-header-stat")
            cell.dataset.stat = key
            const lbl = document.createElement("span")
            lbl.className = "qb-stat-label"
            lbl.textContent = label
            const val = document.createElement("span")
            val.className = "qb-stat-value"
            val.dataset.stat = key
            val.textContent = value
            cell.append(lbl, val)
            grid.appendChild(cell)
          }
          container.appendChild(grid)
        }
      }
      return container
    }

    function updateHeader() {
      const aggregate = view.aggregateSpeed()
      if (speedEl) {
        if (prevSpeed !== null && aggregate !== prevSpeed && aggregate) motion.flashTick(speedEl, "header")
        speedEl.textContent = aggregate
      }
      prevSpeed = aggregate
      if (!config.headerDetails.show) return
      for (const { key, value } of view.headerStats(config.headerDetails.components)) {
        const node = el.querySelector(`.qb-stat-value[data-stat="${key}"]`)
        if (node) node.textContent = value
      }
    }

    function message(text, className = "dimmed small qb-status-message") {
      return div(className, text)
    }

    function table(list) {
      const tbl = document.createElement("table")
      tbl.className = "qb-table"
      const thead = document.createElement("thead")
      thead.className = "qb-thead"
      thead.appendChild(Columns.createHeaderRow(config.columns))
      const tbody = document.createElement("tbody")
      tbody.className = "qb-tbody"
      for (const torrent of list) {
        const prev = shown && shown.get(torrent.hash)
        tbody.appendChild(Columns.createRow(torrent, { ...ctx, prev }, { enter: Boolean(shown) && !prev }))
      }
      tbl.append(thead, tbody)
      return tbl
    }

    function render(status) {
      el.classList.toggle("qb-stale", Boolean(status.stale))
      el.replaceChildren(header(status.ssl))
      if (status.stale) el.appendChild(message(status.message, "dimmed xsmall qb-status-details"))
      if (status.state === "connecting") return el.appendChild(message(status.message))
      if (status.state !== "ok") {
        el.appendChild(message(status.message))
        if (status.details) el.appendChild(message(status.details, "dimmed xsmall qb-status-details"))
        return
      }
      const list = view.select(config)
      el.appendChild(list.length > 0 ? table(list) : message("No torrents to display"))
      shown = new Map(list.map(t => [t.hash, t]))
    }

    function refresh(status) {
      const list = view.select(config)
      updateHeader()
      const structural = !shown || list.length !== shown.size || list.some(t => !shown.has(t.hash))
      if (structural) {
        const keep = new Set(list.map(t => t.hash))
        const leaving = [...el.querySelectorAll("tr[data-hash]")].filter(r => !keep.has(r.dataset.hash))
        if (leaving.length === 0 || motion.reduced()) return render(status)
        leaving.forEach(r => r.classList.add("qb-row-leave"))
        leaveTimer = setTimeout(() => {
          leaveTimer = null
          render(status)
        }, Config.CONSTANTS.LEAVE_ANIM_MS)
        return
      }
      for (const torrent of list) {
        if (shown.get(torrent.hash) === torrent) continue
        const row = el.querySelector(`tr[data-hash="${CSS.escape(torrent.hash)}"]`)
        if (!row) return render(status)
        Columns.patchRow(row, torrent, { ...ctx, prev: shown.get(torrent.hash) })
        shown.set(torrent.hash, torrent)
      }
    }

    return {
      el,
      update(status) {
        if (leaveTimer) {
          if (status.state === "ok") return
          clearTimeout(leaveTimer)
          leaveTimer = null
        }
        const key = `${status.state}|${status.ssl}|${status.stale}|${status.message}|${status.details}`
        if (key !== lastKey) {
          lastKey = key
          return render(status)
        }
        if (status.state === "ok") refresh(status)
      },
      stop() {
        clearTimeout(leaveTimer)
        leaveTimer = null
      }
    }
  }

  return { create }
})
