(function (root, factory) {
  if (typeof module === "object" && module.exports && typeof window === "undefined") {
    module.exports = factory(require("./torrent-row"), require("./format"))
  } else {
    root.MMMQBColumns = factory(root.MMMQBTorrentRow, root.MMMQBFormat)
  }
})(typeof self !== "undefined" ? self : this, function (TorrentRow, Format) {

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
      const container = document.createElement("div")
      container.className = "qb-progress-cell"
      const percent = `${ctx.p.pct}%`

      if (!ctx.config.showProgressBar) {
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
      bar.classList.add(ctx.p.barClass)
      if (ctx.p.active) bar.classList.add("is-active")
      if (ctx.p.barColor) bar.style.background = ctx.p.barColor
      barContainer.appendChild(bar)

      const label = document.createElement("div")
      label.className = "qb-progress-text"
      label.textContent = percent
      if (ctx.p.completed) ctx.motion.triggerComplete(bar, label, t.hash)

      container.appendChild(barContainer)
      container.appendChild(label)
      td.appendChild(container)
    },
    patch(td, t, ctx) {
      const bar = td.querySelector(".qb-progress-bar")
      const label = td.querySelector(".qb-progress-text, .qb-progress-text-only")
      const percent = `${ctx.p.pct}%`
      if (bar) {
        bar.style.width = percent
        bar.className = `qb-progress-bar ${ctx.p.barClass}`
        bar.classList.toggle("is-active", ctx.p.active)
        bar.style.background = ctx.p.barColor
        if (ctx.p.completed) ctx.motion.triggerComplete(bar, label, t.hash)
      }
      if (label) label.textContent = percent
    }
  }

  const status = {
    build(td, t, ctx) {
      const badge = document.createElement("span")
      badge.className = `qb-status-badge status-${t.state}`
      badge.textContent = ctx.p.label
      if (ctx.p.badgeColor) badge.style.backgroundColor = ctx.p.badgeColor
      td.appendChild(badge)
    },
    patch(td, t, ctx) {
      const badge = td.querySelector(".qb-status-badge")
      if (!badge) return
      badge.className = `qb-status-badge status-${t.state}`
      badge.textContent = ctx.p.label
      badge.style.backgroundColor = ctx.p.badgeColor
      if (ctx.p.flipped) ctx.motion.flashTick(badge, `${t.hash}:badge`, "qb-badge-flip", 260)
    }
  }

  const actions = {
    build(td, t, ctx) {
      const btn = document.createElement("div")
      btn.className = `qb-action ${ctx.p.stopped ? "action-play" : "action-pause"}`
      btn.textContent = ctx.p.glyph
      btn.dataset.hash = t.hash
      btn.dataset.action = ctx.p.action
      td.appendChild(btn)
    },
    patch(td, t, ctx) {
      const btn = td.querySelector(".qb-action")
      if (!btn) return
      if (btn.textContent !== ctx.p.glyph) ctx.motion.flashTick(btn, `${t.hash}:glyph`, "qb-glyph-fade", 260)
      btn.textContent = ctx.p.glyph
      btn.dataset.action = ctx.p.action
      btn.className = `qb-action ${ctx.p.stopped ? "action-play" : "action-pause"}`
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
    const p = TorrentRow.present(torrent, ctx.prev, ctx.config)
    const row = document.createElement("tr")
    row.className = `qb-row state-${torrent.state}`
    row.dataset.hash = torrent.hash
    if (enter && !ctx.motion.reduced()) row.classList.add("qb-row-enter")

    for (const name of ctx.config.columns) {
      const def = DEFINITIONS[name]
      if (!def) continue
      const td = document.createElement("td")
      td.className = `qb-td col-${name}`
      td.style.textAlign = def.align
      if (def.bold) td.style.fontWeight = "bold"
      def.cell.build(td, torrent, { ...ctx, column: name, p })
      row.appendChild(td)
    }
    return row
  }

  function patchRow(row, torrent, ctx) {
    const p = TorrentRow.present(torrent, ctx.prev, ctx.config)
    row.className = `qb-row state-${torrent.state}`

    for (const name of ctx.config.columns) {
      const def = DEFINITIONS[name]
      const td = def && row.querySelector(`.col-${name}`)
      if (td) def.cell.patch(td, torrent, { ...ctx, column: name, p })
    }
  }

  return { DEFINITIONS, createHeaderRow, createRow, patchRow }
})
