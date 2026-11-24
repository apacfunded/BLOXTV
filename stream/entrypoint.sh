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
# Sound: a PulseAudio null sink the browser plays into; ffmpeg records its monitor.
pulseaudio -D --exit-idle-time=-1 --disallow-exit --disable-shm=true --log-target=file:/tmp/pulse.log >/dev/null 2>&1 || true
for i in $(seq 1 20); do pactl info >/dev/null 2>&1 && break; sleep 0.5; done
pactl load-module module-null-sink sink_name=stream sink_properties=device.description=stream >/dev/null 2>&1 || true
pactl set-default-sink stream >/dev/null 2>&1 || true
if pactl list short sinks 2>/dev/null | grep -q "stream"; then
  AUDIO_IN=(-f pulse -i stream.monitor)
  log "audio: PulseAudio sink ready"
else
  AUDIO_IN=(-f lavfi -i anullsrc=r=44100:cl=stereo)
  log "WARNING: PulseAudio failed, streaming SILENT audio. $(tail -n 3 /tmp/pulse.log 2>/dev/null | tr '\n' ' ')"
fi

browser() {
  chromium --no-sandbox --disable-gpu --disable-dev-shm-usage --kiosk --no-first-run --disable-infobars \
    --autoplay-policy=no-user-gesture-required --window-size="${W},${H}" --window-position=0,0 \
    --hide-scrollbars --force-device-scale-factor=1 --audio-output-channels=2 \
    --user-data-dir=/tmp/chrome "$SITE_URL/stream?voice=0" >/tmp/chrome.log 2>&1
}
encoder() {
  ffmpeg -hide_banner -loglevel warning \
    -probesize 20M -f x11grab -framerate "$FPS" -video_size "${W}x${H}" -draw_mouse 0 -i :99 \
    "${AUDIO_IN[@]}" \
    -c:v libx264 -preset "${PRESET:-ultrafast}" -tune zerolatency -threads 0 -pix_fmt yuv420p -g "$((FPS * 2))" -keyint_min "$FPS" \
    -b:v "${VIDEO_BITRATE:-4500k}" -maxrate "${VIDEO_BITRATE:-4500k}" -bufsize "$((2 * ${VIDEO_BITRATE%k}))k" \
    -c:a aac -b:a "${AUDIO_BITRATE:-160k}" -ar 44100 -ac 2 \
    "$@"
}
if [ -n "$SELFTEST" ]; then
  mkdir -p /out/stream-test 2>/dev/null || { log "cannot write to /out. On the server run: mkdir -p data/episodes/stream-test && chmod 777 data/episodes/stream-test"; exit 1; }
  log "self-test: recording ${SELFTEST}s of the stream to /out/stream-test/episode.mp4"
  browser & BPID=$!
  sleep 8
  encoder -t "$SELFTEST" -y -f mp4 -movflags +faststart /out/stream-test/episode.mp4; code=$?
  kill "$BPID" 2>/dev/null; wait "$BPID" 2>/dev/null
  log "self-test done (ffmpeg exit $code). Open /episodes/stream-test.mp4 on the site to watch it."
  exit $code
fi

# pump.fun gives either an rtmp:// address + key, or (external software / OBS) a WHIP https:// address + key.
# WHIP wants H.264 baseline without B-frames and 48 kHz stereo Opus; the key travels as a Bearer token.
whip_encoder() {
  ffmpeg -hide_banner -loglevel warning \
    -probesize 20M -f x11grab -framerate "$FPS" -video_size "${W}x${H}" -draw_mouse 0 -i :99 \
    "${AUDIO_IN[@]}" \
    -c:v libx264 -preset "${PRESET:-ultrafast}" -tune zerolatency -profile:v baseline -bf 0 -threads 0 -pix_fmt yuv420p \
    -g "$((FPS * 2))" -keyint_min "$FPS" \
    -b:v "${VIDEO_BITRATE:-4500k}" -maxrate "${VIDEO_BITRATE:-4500k}" -bufsize "$((2 * ${VIDEO_BITRATE%k}))k" \
    -fps_mode cfr -r "$FPS" \
    -c:a libopus -b:a "${AUDIO_BITRATE:-128k}" -ar 48000 -ac 2 -application lowdelay \
    -f whip -authorization "$STREAM_KEY" "$@"
}
# Any browser left over from an earlier round would keep playing sound into the stream: clear them first.
clear_browsers() { pkill -9 -f -- "--user-data-dir=/tmp/chrome" 2>/dev/null; rm -rf /tmp/chrome/Singleton* 2>/dev/null; }
while true; do
  clear_browsers
  log "starting browser"
  browser & BPID=$!
  sleep 6
  case "$RTMP_URL" in
    http://*|https://*)
      log "starting WHIP encoder -> ${RTMP_URL%/} (key sent as bearer token)"
      whip_encoder "${RTMP_URL%/}"; code=$? ;;
    *)
      log "starting RTMP encoder -> ${RTMP_URL%/}/********"
      encoder -f flv "${RTMP_URL%/}/${STREAM_KEY}"; code=$? ;;
  esac
  log "encoder exited ($code), restarting in 5s"
  kill "$BPID" 2>/dev/null; wait "$BPID" 2>/dev/null
  clear_browsers
  sleep 5
done
