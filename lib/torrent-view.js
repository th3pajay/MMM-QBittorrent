(function (root, factory) {
  if (typeof module === "object" && module.exports && typeof window === "undefined") {
    module.exports = factory(require("./config"), require("./torrent-state"), require("./format"))
  } else {
    root.MMMQBTorrentView = factory(root.MMMQBConfig, root.MMMQBTorrentState, root.MMMQBFormat)
  }
})(typeof self !== "undefined" ? self : this, function (Config, TorrentState, Format) {
  const CRITICAL_FIELDS = ["progress", "state", "dlspeed", "upspeed", "eta"]
  const SECONDARY_FIELDS = ["num_seeds", "num_leechs", "ratio", "size", "completed"]
  const MAX_HEADER_STATS = 9

  const num = field => (a, b) => (a[field] || 0) - (b[field] || 0)
  const etaValue = t => (t.eta === Config.CONSTANTS.INFINITE_ETA ? Infinity : (t.eta || 0))

  const COMPARATORS = {
    name: (a, b) => (a.name || "").localeCompare(b.name || ""),
    size: num("size"),
    progress: num("progress"),
    status: (a, b) => TorrentState.describe(b.state).sortRank - TorrentState.describe(a.state).sortRank,
    seeds: num("num_seeds"),
    peers: num("num_leechs"),
    dlspeed: num("dlspeed"),
    upspeed: num("upspeed"),
    eta: (a, b) => etaValue(a) - etaValue(b),
    ratio: num("ratio"),
    added_on: num("added_on")
  }

  const newest = (a, b) => (b.added_on || 0) - (a.added_on || 0) || (a.hash < b.hash ? -1 : 1)

  const sorter = (sortBy, sortOrder) => {
    const cmp = COMPARATORS[sortBy]
    if (!cmp) return newest
    const directed = sortOrder === "desc" ? (a, b) => cmp(b, a) : cmp
    return (a, b) => directed(a, b) || newest(a, b)
  }

  const optimisticState = (progress, stopped) => (stopped ? (progress >= 1 ? "pausedUP" : "pausedDL") : (progress >= 1 ? "uploading" : "downloading"))

  function hasRelevantChanges(oldT, newT) {
    if (!oldT) return true
    if (oldT === newT) return false
    return CRITICAL_FIELDS.some(f => oldT[f] !== newT[f]) || SECONDARY_FIELDS.some(f => oldT[f] !== newT[f])
  }

  const sumOf = (list, fn) => list.reduce((s, t) => s + fn(t), 0)

  function create() {
    const torrents = new Map()
    let transferInfo = null
    const pending = new Map()

    function settle(t) {
      const p = pending.get(t.hash)
      if (!p) return t
      if (Date.now() > p.until || TorrentState.describe(t.state).stopped === p.stopped) {
        pending.delete(t.hash)
        return t
      }
      return { ...t, state: optimisticState(t.progress, p.stopped), dlspeed: p.stopped ? 0 : t.dlspeed }
    }

    const STAT_DEFS = {
      downloadedSession: { label: "DL Session", value: ({ info }) => info ? Format.size(info.dl_info_data) : "—" },
      uploadedSession: { label: "UL Session", value: ({ info }) => info ? Format.size(info.up_info_data) : "—" },
      downloadLimit: { label: "DL Limit", value: ({ info }) => info ? (info.dl_rate_limit > 0 ? Format.speed(info.dl_rate_limit) : "∞") : "—" },
      uploadLimit: { label: "UL Limit", value: ({ info }) => info ? (info.up_rate_limit > 0 ? Format.speed(info.up_rate_limit) : "∞") : "—" },
      totalShareRatio: {
        label: "Share Ratio",
        value: ({ all }) => {
          const up = sumOf(all, t => t.uploaded || 0)
          const down = sumOf(all, t => t.downloaded || 0)
          return down === 0 ? "—" : (up / down).toFixed(2)
        }
      },
      completionRatio: {
        label: "Complete",
        value: ({ all }) => all.length === 0 ? "—" : `${Math.round((all.filter(t => t.progress === 1).length / all.length) * 100)}%`
      },
      connectedSeeds: { label: "Seeds", value: ({ all }) => String(sumOf(all, t => t.num_seeds || 0)) },
      connectedLeechers: { label: "Leechers", value: ({ all }) => String(sumOf(all, t => t.num_leechs || 0)) },
      totalPeers: { label: "Peers", value: ({ all }) => String(sumOf(all, t => (t.num_seeds || 0) + (t.num_leechs || 0))) }
    }

    return {
      ingest(torrentList, info) {
        transferInfo = info || null
        const hashes = new Set(torrentList.map(t => t.hash))
        let dataChanged = false
        let structureChanged = false

        for (const hash of [...torrents.keys()]) {
          if (!hashes.has(hash)) {
            torrents.delete(hash)
            pending.delete(hash)
            dataChanged = true
            structureChanged = true
          }
        }

        for (const raw of torrentList) {
          const t = settle(raw)
          const existing = torrents.get(t.hash)
          if (!existing) structureChanged = true
          if (hasRelevantChanges(existing, t)) {
            torrents.set(t.hash, t)
            dataChanged = true
          }
        }

        return { dataChanged, structureChanged, hashes }
      },

      has: hash => torrents.has(hash),

      get: hash => torrents.get(hash),

      cancel(hashes) {
        let changed = false
        for (const hash of hashes) {
          const p = pending.get(hash)
          if (!p || !torrents.has(hash)) continue
          pending.delete(hash)
          torrents.set(hash, { ...torrents.get(hash), ...p.before })
          changed = true
        }
        return changed
      },

      expect(hash, action) {
        const t = torrents.get(hash)
        if (!t) return false
        const stopped = action === "pause"
        pending.set(hash, { stopped, until: Date.now() + Config.CONSTANTS.PENDING_ACTION_MS, before: { state: t.state, dlspeed: t.dlspeed } })
        torrents.set(hash, { ...t, state: optimisticState(t.progress, stopped), dlspeed: stopped ? 0 : t.dlspeed })
        return true
      },

      select({ viewFilter, sortBy, sortOrder, maxItems }) {
        const list = [...torrents.values()].filter(t => TorrentState.matchesFilter(t, viewFilter))
        list.sort(sorter(sortBy, sortOrder))
        return list.slice(0, maxItems)
      },

      glance({ maxItems, viewFilter, sortBy, sortOrder }) {
        const all = [...torrents.values()]
        const counts = {}
        let dl = 0
        let ul = 0
        for (const t of all) {
          const group = TorrentState.describe(t.state).group
          counts[group] = (counts[group] || 0) + 1
          dl += t.dlspeed || 0
          ul += t.upspeed || 0
        }
        const candidates = all
          .filter(t => TorrentState.matchesFilter(t, viewFilter))
          .sort(sorter(sortBy, sortOrder))
        const rows = candidates.slice(0, maxItems)
        const rest = candidates.slice(maxItems)
        const seeding = rest.filter(t => TorrentState.describe(t.state).group === "seeding").length
        return { rows, counts, dl, ul, seeding, more: rest.length - seeding, connection: transferInfo && transferInfo.connection_status }
      },

      aggregateSpeed() {
        let down = 0
        let up = 0
        for (const t of torrents.values()) {
          down += t.dlspeed || 0
          up += t.upspeed || 0
        }
        const parts = []
        if (down > 0) parts.push(`↓ ${Format.speed(down)}`)
        if (up > 0) parts.push(`↑ ${Format.speed(up)}`)
        return parts.join("  ")
      },

      headerStats(components) {
        const ctx = { info: transferInfo, all: [...torrents.values()] }
        const results = []
        for (const key of components) {
          const def = STAT_DEFS[key]
          if (def) results.push({ key, label: def.label, value: def.value(ctx) })
        }
        return results.slice(0, MAX_HEADER_STATS)
      }
    }
  }

  return { create, isSortable: name => Boolean(COMPARATORS[name]) }
})
