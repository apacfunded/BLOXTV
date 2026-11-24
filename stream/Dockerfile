# The 24/7 streamer: a headless Chromium renders the /stream page at 1920x1080 on a virtual
# display, PulseAudio carries the page's sound, and ffmpeg pushes both to pump.fun over RTMP.
FROM debian:bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium xvfb pulseaudio ffmpeg fonts-liberation fonts-noto-color-emoji ca-certificates curl procps xz-utils \
    && rm -rf /var/lib/apt/lists/*
# pump.fun's "stream with external software" hands out a WHIP (WebRTC) address, which needs ffmpeg 8+.
# Debian's ffmpeg is too old for that, so a current static build goes in front of it on the PATH.
RUN curl -fsSL -o /tmp/ff.tar.xz https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz \
    && mkdir -p /tmp/ff && tar -xJf /tmp/ff.tar.xz -C /tmp/ff --strip-components=1 \
    && install -m 755 /tmp/ff/bin/ffmpeg /usr/local/bin/ffmpeg && rm -rf /tmp/ff /tmp/ff.tar.xz \
    && ffmpeg -hide_banner -muxers 2>/dev/null | grep -q whip
RUN useradd -m streamer
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
USER streamer
ENV SITE_URL=http://web:3000 \
    RTMP_URL= \
    STREAM_KEY= \
    WIDTH=1280 HEIGHT=720 FPS=24 VIDEO_BITRATE=2500k AUDIO_BITRATE=128k PRESET=ultrafast
ENTRYPOINT ["/entrypoint.sh"]
