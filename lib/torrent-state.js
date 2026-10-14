(function (root, factory) {
  if (typeof module === "object" && module.exports && typeof window === "undefined") module.exports = factory()
  else root.MMMQBTorrentState = factory()
})(typeof self !== "undefined" ? self : this, function () {
  const DOWNLOADING = { barGroup: "downloading", badgeGroup: "downloading" }
  const SEEDING = { barGroup: "seeding", badgeGroup: "seeding" }
  const STALLED = { barGroup: "stalled", badgeGroup: "stalled" }
  const ERROR = { barGroup: "error", badgeGroup: "error" }
  const PAUSED_DL = { barGroup: "stalled", badgeGroup: "paused" }

  const STATES = {
    downloading:  { ...DOWNLOADING, label: "Downloading", sortRank: 5, active: true },
    forcedDL:     { ...DOWNLOADING, label: "Downloading", sortRank: 5, active: true },
    metaDL:       { ...DOWNLOADING, label: "Metadata",    sortRank: 5, active: true },
    uploading:    { ...SEEDING, label: "Seeding", sortRank: 4 },
    forcedUP:     { ...SEEDING, label: "Seeding", sortRank: 4 },
    stalledUP:    { ...SEEDING, label: "Seeding", sortRank: 4 },
    queuedUP:     { ...SEEDING, label: "Queued",  sortRank: 1 },
    pausedUP:     { ...SEEDING, label: "Paused",  sortRank: 2, stopped: true, paused: true },
    stoppedUP:    { ...SEEDING, label: "Paused",  sortRank: 2, stopped: true, paused: true },
    pausedDL:     { ...PAUSED_DL, label: "Paused", sortRank: 2, stopped: true, paused: true },
    stoppedDL:    { ...PAUSED_DL, label: "Paused", sortRank: 2, stopped: true, paused: true },
    stalledDL:    { ...STALLED, label: "Stalled",    sortRank: 1 },
    queuedDL:     { ...STALLED, label: "Queued",     sortRank: 1 },
    checkingDL:   { ...STALLED, label: "Checking",   sortRank: 1 },
    checkingUP:   { ...STALLED, label: "Checking",   sortRank: 1 },
    allocating:   { ...STALLED, label: "Allocating", sortRank: 1 },
    error:        { ...ERROR, label: "Error",         sortRank: 3, stopped: true },
    missingFiles: { ...ERROR, label: "Missing Files", sortRank: 3, stopped: true },
  }

  function describe(state) {
    const s = STATES[state]
    if (!s) {
      return { label: state, barGroup: "downloading", badgeGroup: "stalled", group: "stalled", sortRank: 0, active: false, stopped: false, paused: false }
    }
    return { active: false, stopped: false, paused: false, ...s, group: s.paused ? "paused" : s.barGroup }
  }

  function progressBarClass(state, progress) {
    if (progress === 1) return "seeding"
    return describe(state).barGroup
  }

  function matchesFilter(torrent, viewFilter) {
    switch (viewFilter) {
      case "downloading": return describe(torrent.state).active
      case "completed": return torrent.progress === 1
      case "paused": return describe(torrent.state).paused
      default: return true
    }
  }

  return { describe, progressBarClass, matchesFilter }
})
