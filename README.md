MMM-QBittorrent

MagicMirror module for monitoring and controlling qBittorrent.

![MagicMirror](https://img.shields.io/badge/MagicMirror-v2.33.0-blue)
![Torrent](https://img.shields.io/badge/QBittorrent-green)
![Module](https://img.shields.io/badge/Module-Display-orange)
![Version](https://img.shields.io/badge/Version-1.2.15-yellow)
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

## Installation

```bash
cd ~/MagicMirror/modules
git clone https://github.com/th3pajay/MMM-QBittorrent.git
```

## Configuration

Add to `~/MagicMirror/config/config.js`:

```javascript
		{
			module: "MMM-QBittorrent",
			position: "bottom_left",
			config: {
			  connection: {
				host: "http://192.168.1.100:8090",
				username: "user",
				password: "password"
			  },
			  polling: {
				updateInterval: 30000,
				pollTimeout: 2000,
				maxConsecutiveFailures: 3,
				pauseOnRepeatedFailures: true
			  },
			  display: {
				maxItems: 5,
				viewFilter: "all",
				compact: true,
				scale: 0.8,
				columns: ['name', 'progress', 'status', 'dlspeed', 'eta', 'actions'],
				sortBy: 'added_on',
				sortOrder: 'desc',
				showProgressBar: true,
				headerAlign: "left",
				headerDetails: {
				  show: true,
				  components: [
					'downloadedSession',
					'uploadedSession',
					'downloadLimit',
					'uploadLimit',
					'totalShareRatio',
					'completionRatio',
					'connectedSeeds',
					'connectedLeechers',
					'totalPeers',
				  ]
				}
			  }
			}
		  }
```

See `config.js.example` for complete configuration template.

## Security

For HTTPS connections with self-signed certificates, either:
- Set `connection.tls.rejectUnauthorized: false` (development only)
- Provide CA certificate path in `connection.tls.ca` (recommended)

For mutual TLS authentication, provide both `connection.tls.cert` and `connection.tls.key`.

For simple local access you can also try to enable QBittorrent/WebUI settings:
- Bypass authentication for clients on localhost
- Bypass authentication for clients in whitelisted IP subnets
and specify the subnet you use locally.

## License

MIT
