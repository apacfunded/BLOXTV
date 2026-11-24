// ReelPlayer: plays an episode storyboard as a 9:16 blocky-town reel on <canvas>.
// Captions + optional browser voiceover. Can record to a .webm the creator can post.
(function () {
  const W = 540, H = 960;
  const SKIES = {
    day: ["#7cc4ff", "#d7efff"], sunset: ["#ff8a5b", "#ffd29a"],
    night: ["#0b1a3a", "#27407a"], storm: ["#3c4656", "#7b8696"],
  };

  function rng(seed) {
    let h = 2166136261;
    for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 10000) / 10000;
  }
  const shade = (hex, f) => {
    const n = parseInt(hex.slice(1), 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
    return `rgb(${c.join(",")})`;
  };

  // Block with a front face, a lighter top and a darker side for a 2.5D look.
  function block(ctx, x, y, w, h, color, depth = 18) {
    ctx.fillStyle = shade(color, 1.18);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + depth, y - depth); ctx.lineTo(x + w + depth, y - depth); ctx.lineTo(x + w, y); ctx.fill();
    ctx.fillStyle = shade(color, 0.72);
    ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x + w + depth, y - depth); ctx.lineTo(x + w + depth, y + h - depth); ctx.lineTo(x + w, y + h); ctx.fill();
    ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
  }

  function avatar(ctx, x, y, s, shirt, t, pose) {
    const bob = Math.sin(t * 4) * 3 * s;
    const swing = pose === "walk" ? Math.sin(t * 8) * 10 * s : Math.sin(t * 2) * 2 * s;
    ctx.save(); ctx.translate(x, y + bob);
    // legs
    block(ctx, -22 * s, 40 * s + swing * 0.3, 20 * s, 46 * s, "#3b5bdb", 6 * s);
    block(ctx, 2 * s, 40 * s - swing * 0.3, 20 * s, 46 * s, "#3b5bdb", 6 * s);
    // arms
    block(ctx, -42 * s, -24 * s + swing, 18 * s, 56 * s, "#f6c945", 6 * s);
    block(ctx, 24 * s, -24 * s - swing, 18 * s, 56 * s, "#f6c945", 6 * s);
    // torso
    block(ctx, -24 * s, -26 * s, 48 * s, 68 * s, shirt, 8 * s);
    // head
    block(ctx, -20 * s, -70 * s, 40 * s, 40 * s, "#f6c945", 8 * s);
    ctx.fillStyle = "#111";
    ctx.fillRect(-10 * s, -58 * s, 5 * s, 7 * s); ctx.fillRect(5 * s, -58 * s, 5 * s, 7 * s);
    ctx.beginPath(); ctx.lineWidth = 3 * s; ctx.strokeStyle = "#111";
    ctx.arc(0, -46 * s, 8 * s, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.restore();
  }

  function wrap(ctx, text, maxW) {
    const words = text.split(/\s+/), lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  class ReelPlayer {
    constructor(container, episode, opts = {}) {
      this.ep = episode; this.coin = episode.coin || {}; this.opts = opts;
      this.canvas = document.createElement("canvas");
      this.canvas.width = W; this.canvas.height = H;
      this.canvas.className = "reel-canvas";
      this.canvas.setAttribute("role", "img");
      this.canvas.setAttribute("aria-label", `${episode.title}. ` + episode.scenes.map((s) => s.line).join(" "));
      container.appendChild(this.canvas);
      this.ctx = this.canvas.getContext("2d");
      this.durations = episode.scenes.map((s) => Math.max(2.6, s.line.split(/\s+/).length * 0.36 + 1));
      this.total = this.durations.reduce((a, b) => a + b, 0);
      this.t = 0; this.playing = false; this.voice = !!opts.voice; this.lastSpoken = -1;
      this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.draw();
    }
    sceneAt(t) {
      let acc = 0;
      for (let i = 0; i < this.durations.length; i++) {
        if (t < acc + this.durations[i]) return { i, local: t - acc, dur: this.durations[i] };
        acc += this.durations[i];
      }
      const i = this.durations.length - 1;
      return { i, local: this.durations[i], dur: this.durations[i] };
    }
    play() {
      if (this.playing) return;
      if (this.t >= this.total) { this.t = 0; this.lastSpoken = -1; }
      this.playing = true; this.prev = performance.now();
      const loop = (now) => {
        if (!this.playing) return;
        this.t += (now - this.prev) / 1000; this.prev = now;
        if (this.t >= this.total) {
          this.t = this.total; this.draw(); this.playing = false;
          this.opts.onEnd?.(); return;
        }
        this.draw(); this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
      this.opts.onState?.(true);
    }
    pause() {
      this.playing = false; cancelAnimationFrame(this.raf);
      speechSynthesis?.cancel(); this.lastSpoken = -1; this.opts.onState?.(false);
    }
    toggle() { this.playing ? this.pause() : this.play(); }
    seek(t) { this.t = Math.max(0, Math.min(this.total, t)); this.draw(); }
    destroy() { this.pause(); this.canvas.remove(); }
    speak(i) {
      if (!this.voice || !("speechSynthesis" in window) || i === this.lastSpoken) return;
      this.lastSpoken = i;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(this.ep.scenes[i].line);
      u.rate = 1.08; u.pitch = 1.15; speechSynthesis.speak(u);
    }

    draw() {
      const { ctx } = this;
      const { i, local, dur } = this.sceneAt(this.t);
      const scene = this.ep.scenes[i];
      const r = rng((this.coin.id || "x") + i);
      const t = this.reduced ? 0 : this.t;
      if (this.playing) this.speak(i);

      // Slow push-in per scene
      const zoom = this.reduced ? 1 : 1 + (local / dur) * 0.06;
      ctx.save();
      ctx.translate(W / 2, H * 0.6); ctx.scale(zoom, zoom); ctx.translate(-W / 2, -H * 0.6);

      // Sky
      const [a, b] = SKIES[scene.mood] || SKIES.day;
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.62);
      g.addColorStop(0, a); g.addColorStop(1, b);
      ctx.fillStyle = g; ctx.fillRect(-40, -40, W + 80, H + 80);
      if (scene.mood === "night") {
        ctx.fillStyle = "#fff";
        for (let s = 0; s < 40; s++) ctx.fillRect(r() * W, r() * H * 0.45, 3, 3);
        block(ctx, 400, 110, 54, 54, "#f1f3f5", 10);
      } else if (scene.mood !== "storm") {
        block(ctx, 70, 120, 64, 64, scene.mood === "sunset" ? "#ff6b3d" : "#ffd43b", 10);
      }
      // Clouds
      ctx.fillStyle = scene.mood === "storm" ? "#5c6675" : "rgba(255,255,255,0.9)";
      for (let c = 0; c < 4; c++) {
        const cx = ((r() * W + t * 14 * (c + 1)) % (W + 200)) - 100, cy = 60 + r() * 220;
        ctx.fillRect(cx, cy, 120, 30); ctx.fillRect(cx + 26, cy - 22, 66, 26);
      }

      // Buildings
      const ground = H * 0.62;
      const palette = ["#e8590c", "#1c7ed6", "#f59f00", "#2f9e44", "#ae3ec9", "#e64980", "#868e96", "#fab005"];
      let x = -30;
      while (x < W) {
        const w = 70 + r() * 70, h = 120 + r() * 220, col = palette[Math.floor(r() * palette.length)];
        block(ctx, x, ground - h, w, h, col, 20);
        // windows
        const lit = scene.mood === "night" || scene.mood === "storm";
        for (let wy = ground - h + 18; wy < ground - 30; wy += 38)
          for (let wx = x + 12; wx < x + w - 22; wx += 30) {
            ctx.fillStyle = lit ? (r() > 0.35 ? "#ffe066" : "#1b1f2a") : "rgba(255,255,255,0.75)";
            ctx.fillRect(wx, wy, 16, 20);
          }
        x += w + 14 + r() * 20;
      }

      // Baseplate ground with studs
      ctx.fillStyle = scene.mood === "night" ? "#2b6a3a" : "#40c057";
      ctx.fillRect(-40, ground, W + 80, H);
      ctx.fillStyle = scene.mood === "night" ? "#245a31" : "#37b24d";
      for (let gy = ground + 14; gy < H + 40; gy += 34)
        for (let gx = (gy / 34) % 2 ? 0 : 17; gx < W + 40; gx += 34) ctx.fillRect(gx, gy, 14, 8);

      // Signpost with the setting
      ctx.font = "600 20px Rubik, sans-serif";
      const label = scene.setting.slice(0, 26);
      const lw = ctx.measureText(label).width + 28;
      block(ctx, 52, ground - 10, 12, 80, "#8d5524", 5);
      block(ctx, 20, ground - 58, lw, 44, "#c68642", 6);
      ctx.fillStyle = "#fff"; ctx.fillText(label, 34, ground - 29);

      // Avatar(s)
      const walk = /walk|run|climb|dance|hide|chase/i.test(scene.action);
      avatar(ctx, W * 0.5 + (walk && !this.reduced ? Math.sin(t) * 40 : 0), ground + 120, 1.55, this.coin.color || "#2563eb", t, walk ? "walk" : "idle");
      if (/neighbo|everyone|people|avatars|crowd|unison/i.test(scene.action + scene.line)) {
        avatar(ctx, W * 0.17, ground + 70, 0.9, "#e03131", t + 1, "idle");
        avatar(ctx, W * 0.84, ground + 76, 0.9, "#7048e8", t + 2, "idle");
      }

      // Rain
      if (scene.mood === "storm") {
        ctx.strokeStyle = "rgba(220,235,255,0.6)"; ctx.lineWidth = 2;
        for (let d = 0; d < 70; d++) {
          const rx = (r() * W + t * 60) % W, ry = (r() * H + t * 700) % H;
          ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 6, ry + 18); ctx.stroke();
        }
      }
      ctx.restore();

      // Night vignette
      if (scene.mood === "night" || scene.mood === "storm") {
        const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.7);
        v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.45)");
        ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
      }

      // Progress segments
      const segW = (W - 32 - (this.durations.length - 1) * 4) / this.durations.length;
      this.durations.forEach((d, k) => {
        const p = k < i ? 1 : k > i ? 0 : local / dur;
        ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillRect(16 + k * (segW + 4), 16, segW, 5);
        ctx.fillStyle = "#fff"; ctx.fillRect(16 + k * (segW + 4), 16, segW * p, 5);
      });

      // Caption: one word at a time, centered, bold white with a black outline (the trend's CapCut style).
      const words = scene.line.split(/\s+/);
      ctx.textAlign = "center"; ctx.lineJoin = "round";
      if (this.reduced) {
        ctx.font = "800 40px Montserrat, Rubik, sans-serif";
        wrap(ctx, scene.line, W - 80).forEach((ln, k) => {
          ctx.lineWidth = 9; ctx.strokeStyle = "#000"; ctx.strokeText(ln, W / 2, H * 0.48 + k * 48);
          ctx.fillStyle = "#fff"; ctx.fillText(ln, W / 2, H * 0.48 + k * 48);
        });
      } else {
        const wi = Math.max(0, Math.min(words.length - 1, Math.floor((local / (dur * 0.9)) * words.length) || 0));
        const word = (words[wi] || "").toLowerCase();
        ctx.font = "800 58px Montserrat, Rubik, sans-serif";
        ctx.lineWidth = 12; ctx.strokeStyle = "#000"; ctx.strokeText(word, W / 2, H * 0.5);
        ctx.fillStyle = "#fff"; ctx.fillText(word, W / 2, H * 0.5);
      }
      ctx.textAlign = "left";

      // Handle + ticker
      ctx.font = "600 24px Rubik, sans-serif";
      ctx.lineWidth = 6; ctx.strokeStyle = "rgba(0,0,0,0.6)";
      const handle = "@" + (this.coin.town || "town").toLowerCase().replace(/\s+/g, "");
      ctx.strokeText(handle, 24, H - 70); ctx.fillStyle = "#fff"; ctx.fillText(handle, 24, H - 70);
      ctx.font = "500 20px Rubik, sans-serif";
      const sub = `${this.ep.title}`.slice(0, 40);
      ctx.strokeText(sub, 24, H - 40); ctx.fillText(sub, 24, H - 40);
    }

    // Record the reel to a silent .webm (voiceover is added by the creator's app of choice).
    async record(onProgress) {
      if (!this.canvas.captureStream || !window.MediaRecorder) throw new Error("Recording isn't supported in this browser.");
      const stream = this.canvas.captureStream(30);
      const mime = ["video/webm;codecs=vp9", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4e6 });
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const done = new Promise((res) => (rec.onstop = res));
      const voice = this.voice; this.voice = false;
      this.pause(); this.t = 0; rec.start(250);
      const prevEnd = this.opts.onEnd;
      await new Promise((res) => {
        this.opts.onEnd = res;
        const tick = setInterval(() => onProgress?.(this.t / this.total), 200);
        this.play();
        done.then(() => clearInterval(tick));
      });
      this.opts.onEnd = prevEnd; this.voice = voice;
      rec.stop(); await done;
      return new Blob(chunks, { type: "video/webm" });
    }
  }
  // ClipPlayer: same interface as ReelPlayer, for episodes rendered as real video clips
  // (one per scene). Plays them back to back with the scene's caption on top.
  class ClipPlayer {
    constructor(container, episode, opts = {}) {
      this.ep = episode; this.opts = opts; this.i = 0; this.playing = false; this.voice = !!opts.voice;
      this.canvas = document.createElement("div"); // named "canvas" so callers can treat both players alike
      this.canvas.className = "reel-canvas clip-player";
      this.canvas.setAttribute("role", "img");
      this.canvas.setAttribute("aria-label", episode.title + ". " + episode.scenes.map((s) => s.line).join(" "));
      this.canvas.innerHTML = `<video playsinline muted preload="auto"></video><div class="clip-cap"></div><div class="clip-bars"></div>`;
      this.video = this.canvas.querySelector("video");
      this.cap = this.canvas.querySelector(".clip-cap");
      this.bars = this.canvas.querySelector(".clip-bars");
      this.bars.innerHTML = episode.clips.map(() => "<i><b></b></i>").join("");
      this.video.addEventListener("ended", () => this.next());
      this.video.addEventListener("timeupdate", () => this.progress());
      container.appendChild(this.canvas);
      this.load(0);
    }
    load(i) {
      this.i = i; this.video.src = this.ep.clips[i];
      this.cap.textContent = "";
      this.progress();
      if (this.voice && "speechSynthesis" in window && this.playing) {
        speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(this.ep.scenes[this.i]?.line || ""); u.rate = 1.08; u.pitch = 1.15; speechSynthesis.speak(u);
      }
    }
    progress() {
      // One word at a time, timed across the clip.
      const words = (this.ep.scenes[this.i]?.line || "").split(/\s+/);
      const f = this.video.duration ? this.video.currentTime / (this.video.duration * 0.9) : 0;
      const w = words[Math.min(words.length - 1, Math.floor(f * words.length))] || "";
      if (this.cap.textContent !== w.toLowerCase()) this.cap.textContent = w.toLowerCase();
      [...this.bars.children].forEach((bar, k) => {
        const p = k < this.i ? 1 : k > this.i ? 0 : (this.video.currentTime / (this.video.duration || 1));
        bar.firstChild.style.width = (p * 100).toFixed(1) + "%";
      });
    }
    next() {
      if (this.i + 1 < this.ep.clips.length) { this.load(this.i + 1); this.video.play().catch(() => {}); }
      else { this.playing = false; this.opts.onState?.(false); this.opts.onEnd?.(); }
    }
    play() {
      if (this.i === this.ep.clips.length - 1 && this.video.ended) this.load(0);
      this.playing = true; this.video.play().catch(() => {}); this.opts.onState?.(true);
    }
    pause() { this.playing = false; this.video.pause(); speechSynthesis?.cancel(); this.opts.onState?.(false); }
    toggle() { this.playing ? this.pause() : this.play(); }
    destroy() { this.pause(); this.video.removeAttribute("src"); this.canvas.remove(); }
    async record() { throw new Error("This episode is already a real video. Save the clips from the script panel."); }
  }
  // FilePlayer: a finished episode file (narration, captions and music already in it).
  class FilePlayer {
    constructor(container, ep, opts = {}) {
      this.ep = ep; this.opts = opts; this.playing = false;
      this.canvas = document.createElement("div"); this.canvas.className = "reel-canvas clip-player";
      this.canvas.innerHTML = `<video playsinline preload="auto" ${opts.sound ? "" : "muted"}></video>`;
      this.video = this.canvas.querySelector("video"); this.video.src = ep.videoUrl;
      this.video.addEventListener("ended", () => { this.playing = false; this.opts.onState?.(false); this.opts.onEnd?.(); });
      container.appendChild(this.canvas);
    }
    play() { this.playing = true; this.video.play().catch(() => { this.video.muted = true; this.video.play().catch(() => {}); }); this.opts.onState?.(true); }
    pause() { this.playing = false; this.video.pause(); this.opts.onState?.(false); }
    toggle() { this.playing ? this.pause() : this.play(); }
    destroy() { this.pause(); this.video.removeAttribute("src"); this.canvas.remove(); }
    async record() { throw new Error("This episode is already a finished video."); }
  }
  // Pick the right player for an episode.
  ReelPlayer.for = (container, ep, opts) => ep.videoUrl ? new FilePlayer(container, ep, opts) : ep.clips?.length ? new ClipPlayer(container, ep, opts) : new ReelPlayer(container, ep, opts);

  // A still frame of one scene, for storyboards.
  ReelPlayer.still = (container, ep, index) => {
    const p = new ReelPlayer(container, { ...ep, scenes: [ep.scenes[index]], title: `Scene ${index + 1}` });
    p.reduced = true; // full caption, no motion
    p.seek(p.durations[0] * 0.8);
    return p;
  };
  window.ReelPlayer = ReelPlayer;
})();
