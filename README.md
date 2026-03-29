# PI TV

A Raspberry Pi-friendly TV dashboard that turns a browser into a living-room control surface.

It includes:

- live channel playback with fallback stream URLs
- a weather screen with selectable cities and favorite support
- alerts plus combined news headlines
- an emergency contacts screen
- a built-in setup screen for channels, weather cities, emergency contacts, and news feeds
- a separate remote-control web app with live TV state sync
- Docker-friendly deployment for the app layer
- kiosk-friendly deployment for Chromium on the Pi host

Built with:

- `Node.js`
- `Express`
- `WebSocket`
- `QRCode`
- `dotenv`
- `ffmpeg` for RTSP relay

## Screenshots

### Main TV screen

![PI TV main screen](images/tv.jpg)

### Weather screen

![PI TV weather screen](images/weather_screen.jpg)

### Remote control

![PI TV remote control](images/remote.jpg)

## What It Includes

### TV app

The TV UI runs on the main port and is designed for fullscreen or kiosk playback.

Main screens:

- live channels: `11`, `12`, `13`, `16`
- alerts/news: `14`
- emergency contacts: `15`
- setup: settings editor inside the TV UI

TV features:

- HLS playback and RTSP-to-HLS relay support
- fallback URLs per channel
- weather city picker on both the weather screen and control panel
- active alerts plus alert history
- combined headlines from multiple sources
- emergency contacts display
- persistent volume and mute state
- fullscreen, mute, and channel controls on the right-side panel
- QR code and direct link for the remote app

### Remote control app

The remote UI runs on a second port and syncs against the TV state in real time.

Remote features:

- channel switching
- weather, alerts, emergency, and setup shortcuts
- play and pause
- volume slider
- mute toggle
- fullscreen toggle
- browser refresh
- browser back
- browser close and minimize
- Pi beep test
- optional remote-side audio redirect for live channels

## Project Structure

Key files:

- [server.js](/home/user/pi-tv-docker/server.js): Express server, APIs, control-state sync, alerts/news/weather aggregation, RTSP relay
- [Dockerfile](/home/user/pi-tv-docker/Dockerfile): production image
- [docker-compose.yml](/home/user/pi-tv-docker/docker-compose.yml): local and Pi container orchestration
- [.env.example](/home/user/pi-tv-docker/.env.example): example configuration
- [public/index.html](/home/user/pi-tv-docker/public/index.html): TV UI markup
- [public/app.js](/home/user/pi-tv-docker/public/app.js): TV UI behavior and setup screen logic
- [public/styles.css](/home/user/pi-tv-docker/public/styles.css): TV UI styling
- [public-remote/index.html](/home/user/pi-tv-docker/public-remote/index.html): remote markup
- [public-remote/remote.js](/home/user/pi-tv-docker/public-remote/remote.js): remote behavior
- [public-remote/remote.css](/home/user/pi-tv-docker/public-remote/remote.css): remote styling
- [systemd/pi-tv-kiosk.service.example](/home/user/pi-tv-docker/systemd/pi-tv-kiosk.service.example): example systemd service for Chromium kiosk mode
- [scripts/restart-kiosk-browser.sh](/home/user/pi-tv-docker/scripts/restart-kiosk-browser.sh): Chromium relaunch helper

## Requirements

- Node.js `18+`
- npm
- Chromium or Chromium Browser on the Raspberry Pi if you want kiosk mode
- `ffmpeg` on the host only if you are not using Docker

## Quick Start

Install and run locally:

```bash
npm install
cp .env.example .env
npm start
```

Development mode:

```bash
npm run dev
```

Open:

- TV UI: `http://<your-pi-ip>:3000`
- Remote UI: `http://<your-pi-ip>:3001`

## Docker

The containerized part of the project includes:

- TV web app
- remote web app
- alerts, news, and weather APIs
- WebSocket control-state sync
- RTSP relay through bundled `ffmpeg`

Recommended split on a Raspberry Pi:

- Docker container runs the Node app
- host system runs Chromium kiosk pointed at `http://localhost:3000`
- host system handles desktop session and audio integration

### Docker quick start

```bash
cp .env.example .env
docker compose up -d --build
```

Open:

- TV UI: `http://<your-host>:3000`
- Remote UI: `http://<your-host>:3001`

Stop:

```bash
docker compose down
```

Rebuild after changes:

```bash
docker compose up -d --build pi-tv
```

### Run without Compose

```bash
docker build -t pi-tv .
docker run -d \
  --name pi-tv \
  --restart unless-stopped \
  --env-file .env \
  -p 3000:3000 \
  -p 3001:3001 \
  -v "$(pwd)/logs:/app/logs" \
  -v "$(pwd)/data:/app/data" \
  pi-tv
```

## Configuration

The app reads its defaults from `.env`. Some settings can also be changed at runtime from the built-in setup screen.

Important sections in [.env.example](/home/user/pi-tv-docker/.env.example):

- Server
- System
- Logging And Diagnostics
- Channels
- Weather
- Alerts
- News
- Playback
- TV News UI

### Core example

```env
NODE_ENV=development
PORT=3000
REMOTE_PORT=3001
REMOTE_CONTROL_URL=

CHANNEL11_URL=https://your-stream-11.m3u8
CHANNEL11_FALLBACK_URLS=
CHANNEL12_URL=https://your-stream-12.m3u8
CHANNEL12_FALLBACK_URLS=
CHANNEL13_URL=https://your-stream-13.m3u8
CHANNEL13_FALLBACK_URLS=
CHANNEL16_URL=rtsp://user:password@camera.local:554/Streaming/Channels/102
CHANNEL16_FALLBACK_URLS=
DEFAULT_CHANNEL_ID=13

DEFAULT_VOLUME=70
```

Leave `REMOTE_CONTROL_URL` empty to auto-build the remote link from the current TV host. Set it only if you want to force a custom address.

### Built-in setup screen

The setup screen is available from the TV control panel and stores runtime settings through the app API.

Current setup fields:

- channel URLs for `11`, `12`, `13`, and `16`
- emergency contacts JSON
- weather cities JSON
- news source URLs

Setup API endpoints:

- `GET /api/setup/config`
- `POST /api/setup/config`

Use the setup screen for day-to-day updates. Keep sensitive or deployment-specific defaults in `.env`.

### Channels

Live channels:

- `11`
- `12`
- `13`
- `16`

Built-in screens:

- `14`: alerts and news
- `15`: emergency contacts

Each live channel supports:

- `CHANNEL##_URL`
- `CHANNEL##_FALLBACK_URLS`

`CHANNEL##_URL` can be either an HLS URL or an `rtsp://` URL. When a channel uses RTSP, the server relays it to browser-friendly HLS with `ffmpeg`.

Fallback URLs are comma-separated:

```env
CHANNEL11_FALLBACK_URLS=https://backup-a.example/11.m3u8,https://backup-b.example/11.m3u8
```

### Weather

Weather city options come from `WEATHER_CITIES`.

It is a JSON object keyed by city id:

```env
WEATHER_CITIES={"bat-hefer":{"name":"Bat-Hefer","aliases":["Bat Hefer","בת חפר"]},"yokneam":{"name":"Yokneam","aliases":["Yokneam","Yoqneam","Yokneam Illit","יקנעם","יוקנעם"]}}
```

Each entry may include:

- `name`: required
- `aliases`: optional
- `query`: optional geocoding hint
- `lat`: optional
- `lon`: optional

Notes:

- if `lat` and `lon` are missing, the server geocodes the city automatically
- `DEFAULT_WEATHER_CITY` chooses the initial city
- `WEATHER_CITIES_PRIORITY` can pin cities higher in alert ordering
- `TIMEZONE` is passed to the weather and air-quality APIs

### Emergency contacts

The emergency screen is populated from `EMERGENCY_CONTACTS` or the setup screen.

Example:

```env
EMERGENCY_CONTACTS=[{"name":"משטרה","number":"100","primary":true},{"name":"אמבולנס","number":"101","primary":true},{"name":"מכבי אש","number":"102","primary":true}]
```

### Alerts and news

Alerts are fetched from Pikud HaOref.

Main alert config:

- `PIKUD_HAOREF_CURRENT_URL`
- `PIKUD_HAOREF_HISTORY_URL`
- `PIKUD_HAOREF_REFERER`
- `PIKUD_HAOREF_CACHE_MS`
- `PIKUD_HAOREF_HISTORY_LIMIT`
- `ALERTS_REFRESH_MS`

Combined news sources:

- `YNET_BREAKING_NEWS_URL`
- `MAKO_NEWS_RSS_URL`
- `ISRAEL_HAYOM_NEWS_URL`
- `KAN_BREAKING_NEWS_URL`
- `KAN_HEADLINES_URL`

Useful news tuning:

- `NEWS_CACHE_MS`
- `NEWS_ITEMS_PER_SOURCE`
- `NEWS_MAX_AGE_MINUTES`
- `TV_NEWS_PAGE_LIMIT`
- `TV_NEWS_MAX_AGE_MINUTES`
- `ALERTS_NEWS_SCROLL_DURATION_MS`
- `ALERTS_NEWS_SCROLL_PAUSE_MS`
- `MAX_STORED_MESSAGES`

## Playback, volume, and mute

Relevant config:

- `DEFAULT_VOLUME`
- `HLS_LOW_LATENCY_MODE`
- `HLS_LIVE_SYNC_DURATION_COUNT`
- `HLS_LIVE_MAX_LATENCY_DURATION_COUNT`
- `HLS_BACK_BUFFER_LENGTH`
- `HLS_MAX_BUFFER_LENGTH`
- `HLS_MAX_MAX_BUFFER_LENGTH`
- `HLS_MAX_BUFFER_HOLE`
- `HLS_HIGH_BUFFER_WATCHDOG_PERIOD`
- `RTSP_RELAY_SEGMENT_DURATION`
- `RTSP_RELAY_SEGMENT_COUNT`
- `RTSP_RELAY_STARTUP_TIMEOUT_MS`
- `RTSP_RELAY_IDLE_TIMEOUT_MS`

Behavior:

- selected volume is preserved across channel changes
- mute state syncs between TV UI and remote UI
- unmute restores the last audible volume

## Logging and diagnostics

Optional diagnostics:

- `ENABLE_FILE_LOGS=1`
- `ENABLE_CLIENT_DIAGNOSTICS=1`
- `VERBOSE_API_LOGGING=1`
- `API_SLOW_REQUEST_THRESHOLD_MS`

Log files:

- `logs/server-YYYY-MM-DD.log`
- `logs/client-YYYY-MM-DD.log`

## Runtime endpoints

Useful endpoints:

- `/api/channels`
- `/api/setup/config`
- `/api/control/state`
- `/api/control/events`
- `/api/control/ping`
- `/api/weather/cities`
- `/api/weather/current`
- `/api/alerts/current`
- `/api/alerts/history`
- `/api/news/combined`
- `/api/remote-qr`

## Kiosk mode on Raspberry Pi

This project includes:

- [systemd/pi-tv-kiosk.service.example](/home/user/pi-tv-docker/systemd/pi-tv-kiosk.service.example)
- [scripts/restart-kiosk-browser.sh](/home/user/pi-tv-docker/scripts/restart-kiosk-browser.sh)

Typical setup:

```bash
cd /home/user/pi-tv-docker
sudo chmod +x /home/user/pi-tv-docker/scripts/restart-kiosk-browser.sh
sudo install -m 0644 /home/user/pi-tv-docker/systemd/pi-tv-kiosk.service.example /etc/systemd/system/pi-tv-kiosk.service
sudo systemctl daemon-reload
sudo systemctl enable pi-tv-kiosk.service
sudo systemctl restart pi-tv-kiosk.service
```

Useful commands:

```bash
sudo docker compose up -d --build
sudo docker compose ps
sudo docker compose logs --tail=100
sudo systemctl restart pi-tv-kiosk.service
sudo systemctl status pi-tv-kiosk.service --no-pager -n 20
sudo journalctl -u pi-tv-kiosk.service -n 100 --no-pager
```

## Notes

- The remote QR and remote link auto-use the active TV host when possible.
- The setup screen is best for operational tweaks, while `.env` remains the source of deployment defaults.
- Use only streams and feeds you are legally allowed to access and display.
