#!/usr/bin/env bash
# Renders $SITE_URL/stream in a headless Chromium and streams it to $RTMP_URL/$STREAM_KEY.
# Restarts every piece if it dies, so the stream stays up around the clock.
set -u
: "${SITE_URL:?set SITE_URL}"
# SELFTEST_SECONDS=20 records that many seconds to /out/stream-test/episode.mp4 instead of streaming, then exits.
# The web service serves it at /episodes/stream-test.mp4, so you can watch what the stream would look like.
SELFTEST=${SELFTEST_SECONDS:-}
if [ -z "$SELFTEST" ]; then : "${RTMP_URL:?set RTMP_URL (from pump.fun > Start Livestream > Generate RTMP Credentials)}"; : "${STREAM_KEY:?set STREAM_KEY}"; fi
W=${WIDTH:-1920}; H=${HEIGHT:-1080}; FPS=${FPS:-30}
export DISPLAY=:99
export XDG_RUNTIME_DIR=/tmp/runtime-$(id -u); mkdir -p "$XDG_RUNTIME_DIR"
export PULSE_SERVER=unix:$XDG_RUNTIME_DIR/pulse/native

log() { echo "[streamer] $(date -u +%H:%M:%S) $*"; }

# Wait until the site answers, so the browser doesn't open an error page.
until curl -sf "$SITE_URL/api/state" >/dev/null; do log "waiting for $SITE_URL"; sleep 5; done

Xvfb :99 -screen 0 "${W}x${H}x24" -nolisten tcp >/tmp/xvfb.log 2>&1 &
sleep 1
pulseaudio --start --exit-idle-time=-1 --disallow-exit >/tmp/pulse.log 2>&1 || true
pactl load-module module-null-sink sink_name=stream sink_properties=device.description=stream >/dev/null 2>&1 || true
pactl set-default-sink stream >/dev/null 2>&1 || true

browser() {
  chromium --no-sandbox --disable-gpu --disable-dev-shm-usage --kiosk --no-first-run --disable-infobars \
    --autoplay-policy=no-user-gesture-required --window-size="${W},${H}" --window-position=0,0 \
    --hide-scrollbars --force-device-scale-factor=1 --audio-output-channels=2 \
    --user-data-dir=/tmp/chrome "$SITE_URL/stream?voice=0" >/tmp/chrome.log 2>&1
}
encoder() {
  ffmpeg -hide_banner -loglevel warning \
    -f x11grab -framerate "$FPS" -video_size "${W}x${H}" -draw_mouse 0 -i :99 \
    -f pulse -i stream.monitor \
    -c:v libx264 -preset veryfast -tune zerolatency -pix_fmt yuv420p -g "$((FPS * 2))" -keyint_min "$FPS" \
    -b:v "${VIDEO_BITRATE:-4500k}" -maxrate "${VIDEO_BITRATE:-4500k}" -bufsize "$((2 * ${VIDEO_BITRATE%k}))k" \
    -c:a aac -b:a "${AUDIO_BITRATE:-160k}" -ar 44100 -ac 2 \
    "$@"
}
if [ -n "$SELFTEST" ]; then
  mkdir -p /out/stream-test
  log "self-test: recording ${SELFTEST}s of the stream to /out/stream-test/episode.mp4"
  browser & BPID=$!
  sleep 8
  encoder -t "$SELFTEST" -y -f mp4 -movflags +faststart /out/stream-test/episode.mp4; code=$?
  kill "$BPID" 2>/dev/null; wait "$BPID" 2>/dev/null
  log "self-test done (ffmpeg exit $code). Open /episodes/stream-test.mp4 on the site to watch it."
  exit $code
fi

while true; do
  log "starting browser"
  browser & BPID=$!
  sleep 6
  log "starting encoder -> ${RTMP_URL%/}/********"
  encoder -f flv "${RTMP_URL%/}/${STREAM_KEY}"; code=$?
  log "encoder exited ($code), restarting in 5s"
  kill "$BPID" 2>/dev/null; wait "$BPID" 2>/dev/null
  sleep 5
done
