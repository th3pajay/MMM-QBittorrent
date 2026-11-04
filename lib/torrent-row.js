(function (root, factory) {
  if (typeof module === "object" && module.exports && typeof window === "undefined") module.exports = factory(require("./torrent-state"))
  else root.MMMQBTorrentRow = factory(root.MMMQBTorrentState)
})(typeof self !== "undefined" ? self : this, function (TorrentState) {
  function present(torrent, prev, config) {
    const d = TorrentState.describe(torrent.state)
    const progress = torrent.progress || 0
    return {
      pct: Math.floor(progress * 100),
      label: d.label,
      group: d.group,
      stopped: d.stopped,
      glyph: d.stopped ? "▶" : "⏸",
      action: d.stopped ? "start" : "pause",
      active: (torrent.dlspeed || 0) > 0,
      barClass: torrent.progress === 1 ? "seeding" : d.barGroup,
      barColor: config.colors.progressBar[d.barGroup] || "",
      badgeColor: config.colors.statusBadge[d.badgeGroup] || "",
      completed: Boolean(prev) && (prev.progress || 0) < 1 && progress >= 1,
      flipped: Boolean(prev) && prev.state !== torrent.state
    }
  }

  return { present }
})
