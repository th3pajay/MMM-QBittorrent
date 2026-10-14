(function (root, factory) {
  if (typeof module === "object" && module.exports && typeof window === "undefined") module.exports = factory(require("./config"))
  else root.MMMQBFormat = factory(root.MMMQBConfig)
})(typeof self !== "undefined" ? self : this, function (Config) {
  const C = Config.CONSTANTS

  function eta(seconds) {
    if (seconds <= 0 || seconds === C.INFINITE_ETA) return "∞"
    if (seconds < 60) return `${seconds}s`
    if (seconds < C.MIN_ETA_FOR_HOURS) return `${Math.round(seconds / 60)}m`
    const hours = Math.floor(seconds / 3600)
    const mins = Math.round((seconds % 3600) / 60)
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  }

  function speed(bytesPerSec) {
    if (!bytesPerSec) return ""
    if (bytesPerSec < C.MIN_SPEED_FOR_MB) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
    return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`
  }

  function size(bytes) {
    if (!bytes || bytes <= 0) return "0 B"
    const units = ["B", "KB", "MB", "GB", "TB"]
    const k = 1024
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    const unitIndex = Math.min(i, units.length - 1)
    const value = bytes / Math.pow(k, unitIndex)
    const decimals = value < 10 ? 1 : 0
    return `${value.toFixed(decimals)} ${units[unitIndex]}`
  }

  function date(timestamp, locale, now = new Date()) {
    if (!timestamp) return "Unknown"
    const d = new Date(timestamp * 1000)
    const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return "Today"
    if (diffDays === 1) return "Yesterday"
    if (diffDays < 7) return `${diffDays}d ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
    return d.toLocaleDateString(locale || "en-US", { month: "short", day: "numeric", year: "numeric" })
  }

  return { eta, speed, size, date }
})
