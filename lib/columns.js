(function (root, factory) {
  if (typeof module === "object" && module.exports && typeof window === "undefined") {
    module.exports = factory(require("./torrent-state"), require("./format"))
  } else {
    root.MMMQBColumns = factory(root.MMMQBTorrentState, root.MMMQBFormat)
  }
})(typeof self !== "undefined" ? self : this, function (TorrentState, Format) {
  const percentOf = t => `${Math.round((t.progress || 0) * 100)}%`
  const isStopped = t => TorrentState.describe(t.state).stopped

  const text = (read, { flash = false } = {}) => ({
    build(td, t, ctx) {
      const value = read(t, ctx)
      td.dataset.prev = value
      td.textContent = value
    },
    patch(td, t, ctx) {
      const next = read(t, ctx)
      if (flash && td.dataset.prev !== undefined && td.dataset.prev !== next && next) {
        ctx.motion.flashTick(td, `${t.hash}:${ctx.column}`)
      }
      td.dataset.prev = next
      td.textContent = next
    }
  })

  const progress = {
    build(td, t, ctx) {
      const { showProgressBar, colors } = ctx.config
      const container = document.createElement("div")
      container.className = "qb-progress-cell"
      const percent = percentOf(t)

      if (!showProgressBar) {
        const label = document.createElement("div")
        label.className = "qb-progress-text-only"
        label.textContent = percent
        container.appendChild(label)
        td.appendChild(container)
        return
      }

      const barContainer = document.createElement("div")
      barContainer.className = "qb-progress-bar-container"
      const bar = document.createElement("div")
      bar.className = "qb-progress-bar"
      bar.style.width = percent
      bar.classList.add(TorrentState.progressBarClass(t.state, t.progress))
      if ((t.dlspeed || 0) > 0) bar.classList.add("is-active")
      const custom = colors.progressBar[TorrentState.describe(t.state).barGroup]
      if (custom) bar.style.background = custom
      barContainer.appendChild(bar)

      const label = document.createElement("div")
      label.className = "qb-progress-text"
      label.textContent = percent
      if ((t.progress || 0) >= 1) ctx.motion.triggerComplete(bar, label, t.hash)

      container.appendChild(barContainer)
      container.appendChild(label)
      td.appendChild(container)
    },
    patch(td, t, ctx) {
      const bar = td.querySelector(".qb-progress-bar")
      const label = td.querySelector(".qb-progress-text, .qb-progress-text-only")
      const percent = percentOf(t)
      if (bar) {
        bar.style.width = percent
        bar.className = `qb-progress-bar ${TorrentState.progressBarClass(t.state, t.progress)}`
        bar.classList.toggle("is-active", (t.dlspeed || 0) > 0)
        bar.style.background = ctx.config.colors.progressBar[TorrentState.describe(t.state).barGroup] || ""
        if ((t.progress || 0) >= 1) ctx.motion.triggerComplete(bar, label, t.hash)
      }
      if (label) label.textContent = percent
    }
  }

  const status = {
    build(td, t, ctx) {
      const badge = document.createElement("span")
      badge.className = `qb-status-badge status-${t.state}`
      badge.textContent = TorrentState.describe(t.state).label
      const custom = ctx.config.colors.statusBadge[TorrentState.describe(t.state).badgeGroup]
      if (custom) badge.style.backgroundColor = custom
      td.appendChild(badge)
    },
    patch(td, t, ctx) {
      const badge = td.querySelector(".qb-status-badge")
      if (!badge) return
      const d = TorrentState.describe(t.state)
      badge.className = `qb-status-badge status-${t.state}`
      badge.textContent = d.label
      badge.style.backgroundColor = ctx.config.colors.statusBadge[d.badgeGroup] || ""
      if (ctx.stateChanged) ctx.motion.flashTick(badge, `${t.hash}:badge`, "qb-badge-flip", 260)
    }
  }

  const actions = {
    glyph: t => (isStopped(t) ? "▶" : "⏸"),
    build(td, t) {
      const stopped = isStopped(t)
      const btn = document.createElement("div")
      btn.className = `qb-action ${stopped ? "action-play" : "action-pause"}`
      btn.textContent = this.glyph(t)
      btn.dataset.hash = t.hash
      btn.dataset.action = stopped ? "start" : "pause"
      td.appendChild(btn)
    },
    patch(td, t, ctx) {
      const btn = td.querySelector(".qb-action")
      if (!btn) return
      const stopped = isStopped(t)
      const glyph = this.glyph(t)
      if (btn.textContent !== glyph) ctx.motion.flashTick(btn, `${t.hash}:glyph`, "qb-glyph-fade", 260)
      btn.textContent = glyph
      btn.dataset.action = stopped ? "start" : "pause"
      btn.className = `qb-action ${stopped ? "action-play" : "action-pause"}`
    }
  }

  const DEFINITIONS = {
    name:     { label: "Name",       align: "left",   bold: true, cell: text(t => t.name || "Unknown") },
    size:     { label: "Size",       align: "right",  cell: text(t => Format.size(t.size)) },
    progress: { label: "Progress",   align: "center", bold: true, cell: progress },
    status:   { label: "Status",     align: "center", bold: true, cell: status },
    seeds:    { label: "Seeds",      align: "center", cell: text(t => String(t.num_seeds || 0)) },
    peers:    { label: "Peers",      align: "center", cell: text(t => String(t.num_leechs || 0)) },
    dlspeed:  { label: "Down Speed", align: "right",  cell: text(t => Format.speed(t.dlspeed), { flash: true }) },
    upspeed:  { label: "Up Speed",   align: "right",  cell: text(t => Format.speed(t.upspeed), { flash: true }) },
    eta:      { label: "ETA",        align: "center", cell: text(t => Format.eta(t.eta)) },
    ratio:    { label: "Ratio",      align: "center", cell: text(t => (t.ratio || 0).toFixed(2)) },
    added_on: { label: "Added",      align: "center", cell: text((t, ctx) => Format.date(t.added_on, ctx.locale)) },
    actions:  { label: "Actions",    align: "center", cell: actions }
  }

  function createHeaderRow(columns) {
    const tr = document.createElement("tr")
    tr.className = "qb-header-row"
    for (const name of columns) {
      const def = DEFINITIONS[name]
      if (!def) continue
      const th = document.createElement("th")
      th.className = `qb-th col-${name}`
      th.textContent = def.label
      th.style.textAlign = def.align
      tr.appendChild(th)
    }
    return tr
  }

  function createRow(torrent, ctx, { enter = false } = {}) {
    const row = document.createElement("tr")
    row.className = `qb-row state-${torrent.state}`
    row.dataset.hash = torrent.hash
    row.dataset.prevState = torrent.state
    if (enter && !ctx.motion.reduced()) row.classList.add("qb-row-enter")

    for (const name of ctx.config.columns) {
      const def = DEFINITIONS[name]
      if (!def) continue
      const td = document.createElement("td")
      td.className = `qb-td col-${name}`
      td.style.textAlign = def.align
      if (def.bold) td.style.fontWeight = "bold"
      def.cell.build(td, torrent, { ...ctx, column: name })
      row.appendChild(td)
    }
    return row
  }

  function patchRow(row, torrent, ctx) {
    const prevState = row.dataset.prevState
    row.className = `qb-row state-${torrent.state}`
    row.dataset.prevState = torrent.state
    const patchCtx = { ...ctx, stateChanged: prevState !== undefined && prevState !== torrent.state }

    for (const name of ctx.config.columns) {
      const def = DEFINITIONS[name]
      const td = def && row.querySelector(`.col-${name}`)
      if (td) def.cell.patch(td, torrent, { ...patchCtx, column: name })
    }
  }

  return { DEFINITIONS, createHeaderRow, createRow, patchRow }
})
