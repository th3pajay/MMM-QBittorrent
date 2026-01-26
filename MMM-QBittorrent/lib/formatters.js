/** @param {number} seconds @param {number} INFINITE_ETA @param {number} MIN_ETA_FOR_HOURS @returns {string} */
function formatETA(seconds, INFINITE_ETA, MIN_ETA_FOR_HOURS) {
  if (seconds <= 0 || seconds === INFINITE_ETA) return "∞";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < MIN_ETA_FOR_HOURS) {
    return `${Math.round(seconds / 60)}m`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/** @param {number} bytesPerSec @param {number} MIN_SPEED_FOR_MB @returns {string} */
function formatSpeed(bytesPerSec, MIN_SPEED_FOR_MB) {
  if (!bytesPerSec) return "";
  if (bytesPerSec < MIN_SPEED_FOR_MB) {
    return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  }
  return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
}

/** @param {number} bytes @returns {string} */
function formatSize(bytes) {
  if (!bytes || bytes === 0) return "0 B";

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const unitIndex = Math.min(i, units.length - 1);
  const value = bytes / Math.pow(k, unitIndex);
  const decimals = value < 10 ? 1 : 0;

  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

/** @param {number} timestamp @returns {string} */
function formatDate(timestamp) {
  if (!timestamp) return "Unknown";

  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  else if (diffDays === 1) return "Yesterday";
  else if (diffDays < 7) return `${diffDays}d ago`;
  else if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;

  const options = { month: 'short', day: 'numeric', year: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

/** @param {string} state @returns {string} */
function formatStateName(state) {
  const stateNames = {
    downloading: "Downloading",
    uploading: "Seeding",
    pausedDL: "Paused",
    pausedUP: "Paused",
    stalledDL: "Stalled",
    stalledUP: "Seeding",
    queuedDL: "Queued",
    queuedUP: "Queued",
    checkingDL: "Checking",
    checkingUP: "Checking",
    forcedDL: "Downloading",
    forcedUP: "Seeding",
    metaDL: "Metadata",
    allocating: "Allocating",
    error: "Error",
    missingFiles: "Missing Files"
  };

  return stateNames[state] || state;
}

module.exports = {
  formatETA,
  formatSpeed,
  formatSize,
  formatDate,
  formatStateName
};
