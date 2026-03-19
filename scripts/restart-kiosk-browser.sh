#!/usr/bin/env bash

set -eu

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_ROOT="$(CDPATH='' cd -- "$SCRIPT_DIR/.." && pwd)"

DISPLAY_VALUE="${DISPLAY:-:0}"
XAUTHORITY_VALUE="${XAUTHORITY:-/home/user/.Xauthority}"
URL="${KIOSK_URL:-http://localhost:3000}"
AUDIO_STACK="${AUDIO_STACK:-alsa}"
AUDIO_OUTPUT_PREFERENCE="${AUDIO_OUTPUT_PREFERENCE:-hdmi}"
AUDIO_VOLUME="${AUDIO_VOLUME:-1.0}"
KIOSK_LOG_PATH="${KIOSK_LOG_PATH:-/tmp/kiosk-browser.log}"
KIOSK_URL_WAIT_SECONDS="${KIOSK_URL_WAIT_SECONDS:-30}"
KIOSK_FOREGROUND="${KIOSK_FOREGROUND:-0}"
CHROMIUM_EXTRA_FLAGS="${CHROMIUM_EXTRA_FLAGS:---disable-gpu --disable-gpu-rasterization --disable-accelerated-video-decode --disable-accelerated-2d-canvas --disable-features=UseSkiaRenderer,Vulkan}"
ALSA_CONFIG_PATH_VALUE="${ALSA_CONFIG_PATH:-$PROJECT_ROOT/config/asoundrc}"
KIOSK_PROFILE_DIR="${KIOSK_PROFILE_DIR:-/tmp/kiosk-chromium-profile}"

if [ -n "${CHROMIUM_BIN:-}" ]; then
  CHROMIUM_BIN="$CHROMIUM_BIN"
elif command -v chromium-browser >/dev/null 2>&1; then
  CHROMIUM_BIN="$(command -v chromium-browser)"
elif command -v chromium >/dev/null 2>&1; then
  CHROMIUM_BIN="$(command -v chromium)"
else
  echo "Chromium executable not found" >&2
  exit 1
fi

export DISPLAY="$DISPLAY_VALUE"
export XAUTHORITY="$XAUTHORITY_VALUE"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-}"

mkdir -p "$KIOSK_PROFILE_DIR"

if [ "$AUDIO_STACK" = "alsa" ] && [ -f "$ALSA_CONFIG_PATH_VALUE" ]; then
  export ALSA_CONFIG_PATH="$ALSA_CONFIG_PATH_VALUE"
fi

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$KIOSK_LOG_PATH"
}

select_audio_sink() {
  command -v wpctl >/dev/null 2>&1 || return 0

  case "$AUDIO_OUTPUT_PREFERENCE" in
    hdmi)
      sink_pattern='Digital Stereo \(HDMI\)'
      ;;
    analog)
      sink_pattern='Built-in Audio Stereo'
      ;;
    *)
      return 0
      ;;
  esac

  sink_id="$(wpctl status | sed -n "s/^[[:space:]]*[*[:space:]]*\\([0-9]\\+\\)\\. .*${sink_pattern}.*/\\1/p" | head -n 1)"

  if [ -n "${sink_id:-}" ]; then
    wpctl set-default "$sink_id" || true
    wpctl set-volume "$sink_id" "$AUDIO_VOLUME" || true
  fi
}

wait_for_kiosk_url() {
  command -v curl >/dev/null 2>&1 || return 0

  attempt=0
  while [ "$attempt" -lt "$KIOSK_URL_WAIT_SECONDS" ]; do
    if curl -fsS --max-time 2 "$URL" >/dev/null 2>&1; then
      return 0
    fi

    attempt=$((attempt + 1))
    sleep 1
  done

  log "Proceeding without confirmed app readiness for $URL"
}

log "Restarting kiosk browser for $URL on display $DISPLAY using $AUDIO_STACK audio"
: >"$KIOSK_LOG_PATH"
log "Chromium extra flags: $CHROMIUM_EXTRA_FLAGS"

# Prefer the requested desktop sink whenever PipeWire is available, even if
# Chromium itself is using ALSA underneath.
select_audio_sink

if [ "$KIOSK_FOREGROUND" != "1" ]; then
  pkill -f 'chromium.*--kiosk' || true
  pkill -f '(^|/)chromium-browser( |$)' || true
  pkill -f '(^|/)chromium( |$)' || true

  sleep 2
fi

wait_for_kiosk_url

set -- "$CHROMIUM_BIN" \
  --kiosk \
  --remote-debugging-port=9222 \
  --autoplay-policy=no-user-gesture-required \
  --no-first-run \
  --no-default-browser-check \
  --noerrdialogs \
  --disable-infobars \
  --password-store=basic \
  --user-data-dir="$KIOSK_PROFILE_DIR" \
  "$URL"

# shellcheck disable=SC2086
set -- "$@" $CHROMIUM_EXTRA_FLAGS

if [ "$KIOSK_FOREGROUND" = "1" ]; then
  log "Launching Chromium in foreground with $CHROMIUM_BIN"
  exec "$@" >>"$KIOSK_LOG_PATH" 2>&1
fi

nohup "$@" >>"$KIOSK_LOG_PATH" 2>&1 &

log "Chromium launch requested with $CHROMIUM_BIN"
