# MMM-QBittorrent

A glanceable qBittorrent dashboard for [MagicMirror²](https://magicmirror.builders/). Read speeds, progress and problems from across the room, and pause or resume torrents with a tap.

![MagicMirror](https://img.shields.io/badge/MagicMirror-v2.33.0-blue)
![qBittorrent](https://img.shields.io/badge/qBittorrent-v4%20%7C%20v5-green)
![Version](https://img.shields.io/badge/Version-1.2.25-yellow)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

<p align="center">
<img src="Media/MMM-QBittorrent.png?raw=true" alt="MMM-QBittorrent on a mirror" width="320"/>
</p>

## Install

```bash
cd ~/MagicMirror/modules
git clone https://github.com/th3pajay/MMM-QBittorrent.git
```

Enable the Web UI in qBittorrent, then add to `config/config.js`:

```javascript
{
  module: "MMM-QBittorrent",
  position: "bottom_left",
  config: {
    connection: { host: "http://192.168.1.100:8080", username: "user", password: "password" }
  }
}
```

That's it. No `npm install`, no build step.

<details>
<summary><b>Layouts</b>: glance (default) or table</summary>

| `display.layout` | Best for | Defaults |
| --- | --- | --- |
| `"glance"` | Reading from 2–3 m away | `scale: 1`, `maxItems: 4` |
| `"table"` | Dense lists, close up | `scale: 0.6`, `maxItems: 5` |

</details>

<details>
<summary><b>Full example</b>: every option</summary>

```javascript
config: {
  connection: { host: "http://192.168.1.100:8080", username: "user", password: "password" },
  polling: { updateInterval: 5000, pollTimeout: 2000, maxConsecutiveFailures: 3, pauseOnRepeatedFailures: false },
  display: {
    layout: "glance",
    maxItems: 4,
    viewFilter: "all",
    sortBy: "added_on",
    sortOrder: "desc",
    columns: ["name", "progress", "status", "dlspeed", "eta", "ratio", "actions"],
    scale: 1,
    compact: false,
    showProgressBar: true,
    headerAlign: "left",
    headerDetails: { show: true, components: ["totalShareRatio", "connectedSeeds", "downloadedSession"] },
    colors: { rowTint: false }
  }
}
```

See [`config.js.example`](config.js.example) for comments on each option.

</details>

<details>
<summary><b>Filtering, sorting and columns</b></summary>

- `viewFilter`: `all`, `downloading`, `completed`, `paused`
- `sortBy`: `name` `size` `progress` `status` `seeds` `peers` `dlspeed` `upspeed` `eta` `ratio` `added_on` · `sortOrder`: `asc` or `desc`
- `columns` also controls what each row shows; add `actions` for the pause/resume button.
- Use `sortBy: "status"` with `sortOrder: "asc"` to put downloading and errored torrents first.

</details>

<details>
<summary><b>HTTPS and security</b></summary>

- Self-signed certificate: set `connection.tls.ca` (recommended) or `connection.tls.rejectUnauthorized: false` (testing only).
- Mutual TLS: set both `connection.tls.cert` and `connection.tls.key`.
- On a trusted LAN you can let qBittorrent bypass authentication for localhost or a whitelisted subnet.

</details>

## License

MIT
