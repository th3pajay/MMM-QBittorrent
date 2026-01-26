module.exports = {
  PULSE_DURATION_MS: 1000,
  DEFAULT_POLL_TIMEOUT_MS: 2000,
  DEFAULT_UPDATE_INTERVAL_MS: 5000,
  MIN_ETA_FOR_HOURS: 3600,
  MIN_SPEED_FOR_MB: 1048576,
  INFINITE_ETA: 8640000,
  AUTH_RETRY_DELAY_MS: 100,

  TORRENT_STATES: {
    DOWNLOADING: 'downloading',
    UPLOADING: 'uploading',
    PAUSED_DL: 'pausedDL',
    PAUSED_UP: 'pausedUP',
    STALLED_DL: 'stalledDL',
    STALLED_UP: 'stalledUP',
    QUEUED_DL: 'queuedDL',
    QUEUED_UP: 'queuedUP',
    CHECKING_DL: 'checkingDL',
    CHECKING_UP: 'checkingUP',
    FORCED_DL: 'forcedDL',
    FORCED_UP: 'forcedUP',
    META_DL: 'metaDL',
    ALLOCATING: 'allocating',
    ERROR: 'error',
    MISSING_FILES: 'missingFiles'
  },

  TORRENT_STATE_GROUPS: {
    DOWNLOADING: ['downloading', 'forcedDL', 'metaDL'],
    UPLOADING: ['uploading', 'forcedUP', 'stalledUP', 'queuedUP', 'pausedUP'],
    STALLED: ['stalledDL', 'queuedDL', 'checkingDL', 'checkingUP', 'allocating'],
    PAUSED: ['pausedDL']
  }
};
