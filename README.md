# PI TV

A TV-style web app for Raspberry Pi that turns a browser into a living-room dashboard:

- live channel playback with fallback stream URLs
- a dedicated weather screen with selectable cities
- alerts + breaking news mode
- emergency contacts screen
- a separate remote-control web app
- fullscreen, volume, mute, refresh, and browser control
- kiosk-friendly deployment for Raspberry Pi / Chromium

Built with:

- `Node.js`
- `Express`
- `HLS.js`
- `WebSocket`
- `dotenv`

## Screenshots

### Main TV screen

![PI TV main screen](images/tv.jpg)

### Weather screen

![PI TV weather screen](images/weather_screen.jpg)

### Remote control

![PI TV remote control](images/remote.jpg)

## What It Includes

### TV screen app

The TV UI runs on the main port and is designed for kiosk / fullscreen playback.

Features:

- Channel `11`, `12`, `13` live playback
- fallback stream URLs per live channel
- weather screen with auto-scroll and city selection
- alerts screen with Pikud HaOref data
- combined news headlines from multiple sources
- emergency contacts screen
- persistent volume and mute state in the browser
- fullscreen mode
- on-screen control buttons for news, weather, mute, and channels

### Remote control app

The remote UI runs on a second port and syncs against the TV state in real time.

Features:

- channel switching
- news / weather / emergency shortcuts
- play / pause
- volume slider
- mute toggle
- fullscreen toggle
- browser refresh
- browser back
- browser close / minimize
- Pi beep test
- optional audio redirect for live channels

## Project Structure

Key files:

- [server.js](/home/user/tv/server.js): server, API routes, state sync, alerts/news/weather aggregation
- [Dockerfile](/home/user/tv/Dockerfile): production container image for the app server
- [docker-compose.yml](/home/user/tv/docker-compose.yml): local/prod container orchestration
- [.dockerignore](/home/user/tv/.dockerignore): excludes local-only and bulky files from image builds
- [public/index.html](/home/user/tv/public/index.html): TV screen markup
- [public/app.js](/home/user/tv/public/app.js): TV screen logic
- [public/styles.css](/home/user/tv/public/styles.css): TV screen styling
- [public-remote/index.html](/home/user/tv/public-remote/index.html): remote UI markup
- [public-remote/remote.js](/home/user/tv/public-remote/remote.js): remote logic
- [public-remote/remote.css](/home/user/tv/public-remote/remote.css): remote styling
- [.env.example](/home/user/tv/.env.example): example configuration
- [systemd/tv-app.service.example](/home/user/tv/systemd/tv-app.service.example): example service file
- [scripts/restart-kiosk-browser.sh](/home/user/tv/scripts/restart-kiosk-browser.sh): kiosk Chromium relaunch script

## Requirements

- Node.js `18+`
- npm
- Chromium or Chromium Browser on the Pi
- a desktop session if you want kiosk mode with visible browser output

## Quick Start

Install dependencies:

```bash
npm install
cp .env.example .env
```

Start the app:

```bash
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

This project can run cleanly in Docker for the app layer:

- TV web app
- remote web app
- alerts / news / weather APIs
- WebSocket state sync

The Raspberry Pi kiosk/browser layer is still best kept on the host:

- Chromium kiosk launch
- browser refresh / close scripts
- ALSA / PipeWire host integration
- desktop session startup

### Docker quick start

Build and run with Compose:

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

### Docker files

- `Dockerfile`: builds a production Node 20 image
- `docker-compose.yml`: runs the app with restart policy, env file, and port mapping
- `.dockerignore`: keeps `.env`, `node_modules`, logs, and generated files out of the image context

### Docker notes

- The container reads app settings from local `.env`
- Logs are persisted to `./logs`
- Ports are mapped from `PORT` and `REMOTE_PORT`
- The image includes a healthcheck against `/api/channels`

### Run without Compose

Build:

```bash
docker build -t pi-tv .
```

Run:

```bash
docker run -d \
  --name pi-tv \
  --restart unless-stopped \
  --env-file .env \
  -p 3000:3000 \
  -p 3001:3001 \
  -v "$(pwd)/logs:/app/logs" \
  pi-tv
```

### Raspberry Pi deployment model

Recommended split on a Pi:

- Docker container runs the Node app
- host system runs Chromium kiosk pointed at `http://localhost:3000`
- host system keeps systemd / autostart / audio-device integration

## Environment Configuration

The app is configured entirely from `.env`.

Sections currently used:

- Server
- System
- Logging And Diagnostics
- Channels
- Weather
- Alerts
- News
- Playback
- TV News UI

Sensitive local-only values can stay in `.env` and be omitted from `.env.example`.

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
DEFAULT_CHANNEL_ID=13

DEFAULT_VOLUME=70
```

Leave `REMOTE_CONTROL_URL` empty to auto-build the remote link from the current TV host IP. Set it only if you want to force a custom remote address.

### Local-only emergency contacts

The emergency screen can be populated from `EMERGENCY_CONTACTS`.

Example format:

```env
EMERGENCY_CONTACTS=[{"name":"משטרה","number":"100","primary":true},{"name":"אמבולנס","number":"101","primary":true},{"name":"מכבי אש","number":"102","primary":true}]
```

`.env.example` keeps the common public emergency numbers. Any local/private contacts should stay only in `.env`.

## Channels

Live channels:

- `11`
- `12`
- `13`

Built-in screens:

- `14`: alerts / news
- `15`: emergency

Each live channel supports:

- `CHANNEL##_URL`
- `CHANNEL##_FALLBACK_URLS`

Fallback URLs are comma-separated:

```env
CHANNEL11_FALLBACK_URLS=https://backup-a.example/11.m3u8,https://backup-b.example/11.m3u8
```

The player tries the primary URL first, then fallback URLs in order.

## Weather

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

- if `lat` / `lon` are missing, the server geocodes the city automatically
- `DEFAULT_WEATHER_CITY` chooses the default
- `WEATHER_CITIES_PRIORITY` can pin cities higher in alerts/weather sorting
- `TIMEZONE` is passed to the weather and air-quality APIs

Priority example:

```env
WEATHER_CITIES_PRIORITY=בת חפר,תל אביב,מודיעין,ראשון לציון
```

If an alert location list contains those cities, they will be moved to the front in the same order they appear in `WEATHER_CITIES_PRIORITY`.

Example with city-only config:

```env
WEATHER_CITIES={"tel-aviv":{"name":"Tel Aviv","aliases":["Tel Aviv","תל אביב","תל-אביב"]},"haifa":{"name":"Haifa","aliases":["Haifa","חיפה"]}}
DEFAULT_WEATHER_CITY=tel-aviv
```

Example with explicit geocoding query:

```env
WEATHER_CITIES={"nyc":{"name":"New York","query":"New York City","aliases":["NYC","New York"]}}
```

## Alerts And News

Alerts are fetched from Pikud HaOref.

Config:

- `PIKUD_HAOREF_CURRENT_URL`
- `PIKUD_HAOREF_HISTORY_URL`
- `PIKUD_HAOREF_REFERER`
- `PIKUD_HAOREF_CACHE_MS`
- `PIKUD_HAOREF_HISTORY_LIMIT`
- `ALERTS_REFRESH_MS`

Combined news currently uses:

- `YNET_BREAKING_NEWS_URL`
- `MAKO_NEWS_RSS_URL`
- `ISRAEL_HAYOM_NEWS_URL`
- `KAN_BREAKING_NEWS_URL`
- `KAN_HEADLINES_URL`

Tuning:

- `NEWS_CACHE_MS`
- `NEWS_ITEMS_PER_SOURCE`
- `NEWS_MAX_AGE_MINUTES`
- `TV_NEWS_PAGE_LIMIT`
- `TV_NEWS_MAX_AGE_MINUTES`
- `ALERTS_NEWS_SCROLL_DURATION_MS`
- `ALERTS_NEWS_SCROLL_PAUSE_MS`
- `MAX_STORED_MESSAGES`

The app now filters generic CTA-style titles like `לצפייה בכתבה` and prefers better headline candidates when available.

## Playback, Volume, And Mute

Playback defaults are controlled from env and browser state.

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

Behavior:

- chosen volume is preserved across channel changes
- volume is restored when returning to the page
- mute is synced between TV UI and remote
- mute toggling drops visible volume to `0%`
- unmute restores the last audible volume

## Logging And Diagnostics

Optional diagnostics:

- `ENABLE_FILE_LOGS=1`
- `ENABLE_CLIENT_DIAGNOSTICS=1`
- `VERBOSE_API_LOGGING=1`
- `API_SLOW_REQUEST_THRESHOLD_MS`

Log files:

- `logs/server-YYYY-MM-DD.log`
- `logs/client-YYYY-MM-DD.log`

## Runtime Endpoints

Main useful endpoints:

- `/api/channels`
- `/api/runtime-config`
- `/api/control/state`
- `/api/control/events`
- `/api/weather/cities`
- `/api/weather/current`
- `/api/alerts/current`
- `/api/alerts/history`
- `/api/news/combined`
- `/api/remote-qr`

## Kiosk Mode On Raspberry Pi

This project includes:

- [systemd/tv-app.service.example](/home/user/tv/systemd/tv-app.service.example)
- [scripts/restart-kiosk-browser.sh](/home/user/tv/scripts/restart-kiosk-browser.sh)

Typical setup:

```bash
sudo install -m 0644 /home/user/tv/systemd/tv-app.service.example /etc/systemd/system/tv-app.service
sudo chmod +x /home/user/tv/scripts/restart-kiosk-browser.sh
sudo systemctl daemon-reload
sudo systemctl enable tv-app.service
sudo systemctl restart tv-app.service
```

Useful commands:

```bash
sudo systemctl restart tv-app.service
sudo systemctl status tv-app.service --no-pager -n 20
sudo journalctl -u tv-app.service -n 100 --no-pager
```

The kiosk launcher:

- kills the existing Chromium kiosk process
- waits briefly
- relaunches Chromium against the TV UI
- uses a dedicated profile in `/tmp/kiosk-chromium-profile`

## Audio Notes

This setup has support for:

- Pi-local beep output
- optional remote-side audio redirect
- Chromium audio launched from the logged-in user session

Useful env values:

- `ALSA_BEEP_DEVICE`
- `CHROMIUM_BIN`
- `CHROMIUM_DEBUG_ORIGIN`

If desktop audio apps work but Chromium does not, prefer running the service inside the logged-in user's audio session rather than forcing a custom ALSA route.

## Recommended Workflow

1. Configure your stream URLs in `.env`
2. Set `REMOTE_CONTROL_URL` to the actual remote address
3. Confirm TV UI works at port `3000`
4. Confirm remote UI works at port `3001`
5. Tune `DEFAULT_VOLUME` and HLS settings
6. Enable kiosk mode with systemd once the browser flow is stable

## Notes

- This project is not currently a git repository in `/home/user/tv`, so pushing to GitHub will require initializing git or moving into the real repo root first.
- Use only streams and feeds you are legally allowed to access and display.
