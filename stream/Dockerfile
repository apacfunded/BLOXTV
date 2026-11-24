# The 24/7 streamer: a headless Chromium renders the /stream page at 1920x1080 on a virtual
# display, PulseAudio carries the page's sound, and ffmpeg pushes both to pump.fun over RTMP.
FROM debian:bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium xvfb pulseaudio ffmpeg fonts-liberation fonts-noto-color-emoji ca-certificates curl procps \
    && rm -rf /var/lib/apt/lists/*
RUN useradd -m streamer
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
USER streamer
ENV SITE_URL=http://web:3000 \
    RTMP_URL= \
    STREAM_KEY= \
    WIDTH=1920 HEIGHT=1080 FPS=30 VIDEO_BITRATE=4500k AUDIO_BITRATE=160k
ENTRYPOINT ["/entrypoint.sh"]
