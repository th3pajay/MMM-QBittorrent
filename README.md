MMM-QBittorrent

Modern MagicMirror module for monitoring and controlling qBittorrent.

![MagicMirror](https://img.shields.io/badge/MagicMirror-v2.33.0-blue)
![Torrent](https://img.shields.io/badge/QBittorrent-green)
![Module](https://img.shields.io/badge/Module-Display-orange)
![Version](https://img.shields.io/badge/Version-1.0.3-yellow)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

<p align="center">
<img src="Media/MMM-QBittorrent.png?raw=true" alt="In-use" width="256"/>
</p>

## Features

- Live torrent progress, speed, and ETA display
- Start, pause, and resume torrents directly from MagicMirror
- Customizable column display and sorting
- Filtered views (all, downloading, completed, paused)
- Compact mode for space-constrained displays
- Visual progress bars
- Full HTTPS/TLS support including mutual TLS authentication

## Installation (Nested structure)

```bash
cd ~/MagicMirror/modules
git clone https://github.com/th3pajay/MMM-QBittorrent.git temp_qb
mv temp_qb/MMM-QBittorrent .
rm -rf temp_qb
cd MMM-QBittorrent
npm install
```

## Configuration

Add to `~/MagicMirror/config/config.js`:

```javascript
{
  module: "MMM-QBittorrent",
  position: "bottom_left",
  config: {
    connection: {
      host: "http://localhost:8080", // Required: qBittorrent API URL (must start with http:// or https://)
      username: "admin",             // qBittorrent username
      password: "password",           // qBittorrent password
      tls: {
        rejectUnauthorized: true,    // Set to false for self-signed certificates (development only)
        ca: null,                    // Custom CA certificate path(s) (e.g., "/path/to/ca.crt")
        cert: null,                  // Client certificate path for mutual TLS
        key: null,                   // Client private key path for mutual TLS
        passphrase: null,            // Passphrase for encrypted private key
        minVersion: "TLSv1.2",       // Options: "TLSv1", "TLSv1.1", "TLSv1.2", "TLSv1.3"
        maxVersion: null             // Maximum TLS version (null for no limit)
      }
    },
    polling: {
      updateInterval: 5000,          // Poll interval in ms (minimum: 1000)
      pollTimeout: 2000,             // Request timeout in ms (minimum: 500)
      maxConsecutiveFailures: 3,     // Max failures before displaying error
      pauseOnRepeatedFailures: false // Pause polling if maxConsecutiveFailures is reached
    },
    display: {
      maxItems: 5,                   // Maximum torrents to display
      viewFilter: "all",             // Options: "all", "downloading", "completed", "paused"
      compact: false,                // Enable compact mode (reduced spacing)
      scale: 0.6,                    // Display scale factor (0.01 to 10)
      // Available columns: 'name', 'size', 'progress', 'status', 'seeds', 'peers', 'dlspeed', 'upspeed', 'eta', 'ratio', 'added_on', 'actions'
      columns: ['name', 'progress', 'status', 'dlspeed', 'eta', 'actions'],
      sortBy: 'added_on',            // Column to sort by
      sortOrder: 'desc',             // Sort direction: "asc" or "desc"
      showProgressBar: true,         // false = text percentage only
      headerAlign: null              // Options: "left", "center", "right", or null for auto
    }
  }
}
```

See `MMM-QBittorrent/config.js.example` for complete configuration template.

## Security

For HTTPS connections with self-signed certificates, either:
- Set `connection.tls.rejectUnauthorized: false` (development only)
- Provide CA certificate path in `connection.tls.ca` (recommended)

For mutual TLS authentication, provide both `connection.tls.cert` and `connection.tls.key`.

## License

MIT
