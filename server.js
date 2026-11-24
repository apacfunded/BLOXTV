import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { COIN } from "./lib/config.js";
import { load, getDb } from "./lib/store.js";
import { state, addFees, subscribe, completeEpisode, maybeProduce, renderProgress, setViewers, onChatMessage, siteVote, setChatStatus, startTestEpisode, clearPreviewEpisodes, resetShow, importEpisode, holdFrom, startRelease, stopRelease, releaseStatus, tickRelease } from "./lib/show.js";
import { ensurePoll } from "./lib/votes.js";
import { startPumpChat } from "./lib/pumpchat.js";
import { episodeFile } from "./lib/assemble.js";
import { startFeeWatcher, watchedAddresses } from "./lib/fees.js";
import { provider } from "./lib/video.js";

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.resolve("public");
const DEV = process.env.DEV_TOOLS === "1";
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".mp3": "audio/mpeg" };

load();
// An episode left mid-production by a restart gets refunded and retried: the render ran inside
// the old process, so nothing is working on it any more.
for (const ep of [...getDb().episodes]) if (ep.status === "writing" || ep.status === "rendering") {
  console.log(`[episode] ${ep.id} was mid-production when the server stopped; ${ep.test ? "dropping the test episode" : `refunding ${ep.costSol} SOL and retrying`}.`);
  getDb().episodes.splice(getDb().episodes.indexOf(ep), 1);
  getDb().fund.spent -= ep.costSol;
  if (!ep.test) getDb().fund.balance += ep.costSol; // a test episode's fees were pretend, so don't start a real one with them
}
// Only the fund's share of each creator fee counts toward the next episode (60% by default).
startFeeWatcher((sol, meta = {}) => addFees(sol * COIN.fundShare, typeof meta === "string" ? { source: meta } : meta));
ensurePoll();
if (COIN.mint && process.env.PUMP_CHAT !== "0") startPumpChat(COIN.mint, onChatMessage, { onStatus: setChatStatus });
else console.log("[chat] No mint in coin.config.json, so chat votes are off. Website votes still work.");
// Dev only: simulate a steady trickle of trades so the live page has something to show.
if (DEV && process.env.DEV_SIM_FEES === "1") setInterval(() => {
  const keys = ["A", "A", "B", "C", "a", "!vote b", "B"];
  onChatMessage({ id: "sim" + Math.random(), wallet: "sim" + Math.floor(Math.random() * 40), username: "viewer" + Math.floor(Math.random() * 40), text: keys[Math.floor(Math.random() * keys.length)], at: Date.now() });
  const n = 1 + Math.floor(Math.random() * 4);
  addFees(+(n * (0.002 + Math.random() * 0.01)).toFixed(4), { source: "simulated trades", txCount: n });
}, 4000);
maybeProduce();
setInterval(tickRelease, 5_000); // the release clock (survives restarts: it's stored in the db)
setInterval(maybeProduce, 60_000); // picks production back up after a backoff or the daily cap, without waiting for a trade

// Never let one bad request or a stray async error take the whole show down mid-render.
process.on("unhandledRejection", (err) => console.error("[unhandledRejection]", err));
process.on("uncaughtException", (err) => console.error("[uncaughtException]", err));

// The real client address. Only Caddy can reach this server, and it appends the client IP last.
const clientIp = (req) => String(req.headers["x-forwarded-for"] || "").split(",").pop().trim() || req.socket.remoteAddress || "unknown";
// Small in-memory rate limiter: at most `max` hits per `windowMs` per key.
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now(), list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now); hits.set(key, list);
  return list.length > max;
}
setInterval(() => { const now = Date.now(); for (const [k, l] of hits) if (!l.some((t) => now - t < 60_000)) hits.delete(k); }, 60_000);
const sseByIp = new Map();
const MAX_SSE = 5000, MAX_SSE_PER_IP = 30;

// Server-sent events so the site and the stream overlay update live.
const clients = new Set();
subscribe((type, data) => {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
});
setInterval(() => { for (const res of clients) res.write(": ping\n\n"); }, 25_000);

const routes = [
  ["GET", /^\/api\/state$/, () => ({ ...state(), videoProvider: provider(), watching: watchedAddresses(), devTools: DEV })],
  // Admin: make one short test episode now. Only from inside the server (localhost), never through the website.
  ["POST", /^\/api\/admin\/test-episode$/, (_, body, req) => {
    const ip = req.socket.remoteAddress || "";
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip)) return [403, { error: "Admin routes only work from inside the server." }];
    const r = startTestEpisode(body.scenes);
    return r.error ? [409, r] : r;
  }],
  // Admin: remove preview-reel / failed episodes so only real renders stay. Localhost only.
  ["POST", /^\/api\/admin\/clear-previews$/, (_, body, req) => {
    const ip = req.socket.remoteAddress || "";
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip)) return [403, { error: "Admin routes only work from inside the server." }];
    const r = clearPreviewEpisodes();
    return r.error ? [409, r] : r;
  }],
  // Admin: release schedule. Localhost only.
  ["POST", /^\/api\/admin\/release$/, (_, body, req) => {
    const ip = req.socket.remoteAddress || "";
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip)) return [403, { error: "Admin routes only work from inside the server." }];
    const a = body.action;
    const r = a === "hold" ? holdFrom(Number(body.from)) : a === "start" ? startRelease(body.every ?? 5, body.firstNow !== false) : a === "stop" ? stopRelease() : releaseStatus();
    return r.error ? [409, r] : r;
  }],
  // Admin: import an episode made elsewhere (clips as URLs). Localhost only.
  ["POST", /^\/api\/admin\/import-episode$/, async (_, body, req) => {
    const ip = req.socket.remoteAddress || "";
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip)) return [403, { error: "Admin routes only work from inside the server." }];
    const r = await importEpisode(body);
    return r.error ? [409, r] : r;
  }],
  // Admin: wipe episodes, votes and the fund for a clean launch. Localhost only.
  ["POST", /^\/api\/admin\/reset$/, (_, body, req) => {
    const ip = req.socket.remoteAddress || "";
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip)) return [403, { error: "Admin routes only work from inside the server." }];
    if (body.confirm !== "RESET") return [400, { error: "Send {\"confirm\":\"RESET\"} to wipe everything." }];
    const r = resetShow();
    const epDir = path.resolve("data/episodes");
    if (r.ok && fs.existsSync(epDir)) for (const d of fs.readdirSync(epDir, { withFileTypes: true })) if (d.isDirectory() && d.name !== "stream-test") fs.rmSync(path.join(path.resolve("data/episodes"), d.name), { recursive: true, force: true });
    return r.error ? [409, r] : r;
  }],
  ["POST", /^\/api\/vote$/, (_, body, req) => {
    // One website vote per network address (changing it replaces the old one), so a script can't stuff the vote.
    const ip = clientIp(req), key = String(body.key || "").toUpperCase();
    if (limited("vote:" + ip, 12, 60_000)) return [429, { error: "Too many votes from here. Wait a minute and try again." }];
    const poll = siteVote(ip, key);
    return poll ? { poll } : [400, { error: "That option isn't open for votes." }];
  }],
  ["POST", /^\/api\/dev\/chat$/, (_, body) => {
    if (!DEV) return [403, { error: "Dev tools are off. Start with DEV_TOOLS=1." }];
    onChatMessage({ id: "dev" + Math.random(), wallet: String(body.wallet || "devwallet" + Math.floor(Math.random() * 50)), username: body.username || "tester", text: String(body.text || ""), at: Date.now() });
    return { ok: true };
  }],
  ["POST", /^\/api\/dev\/fees$/, (_, body) => {
    if (!DEV) return [403, { error: "Dev tools are off. Start with DEV_TOOLS=1." }];
    const sol = Number(body.sol);
    if (!(sol > 0 && sol < 100)) return [400, { error: "Enter an amount between 0 and 100 SOL." }];
    addFees(sol, "test fees");
    return { ok: true };
  }],
  ["POST", /^\/api\/episodes\/(\w+)\/progress$/, ([id], body, req) => {
    const secret = process.env.VIDEO_CALLBACK_SECRET;
    if (!secret || req.headers["x-callback-secret"] !== secret) return [401, { error: "Bad callback secret." }];
    const ep = getDb().episodes.find((e) => e.id === id && e.status === "rendering");
    if (!ep) return [404, { error: "No episode rendering with that id." }];
    renderProgress(ep, Number(body.progress));
    return { ok: true };
  }],
  ["POST", /^\/api\/episodes\/(\w+)\/complete$/, ([id], body, req) => {
    const secret = process.env.VIDEO_CALLBACK_SECRET;
    if (!secret || req.headers["x-callback-secret"] !== secret) return [401, { error: "Bad callback secret." }];
    const ep = getDb().episodes.find((e) => e.id === id);
    if (!ep) return [404, { error: "Episode not found." }];
    if (!/^https:\/\//.test(body.videoUrl || "")) return [400, { error: "videoUrl must be https." }];
    completeEpisode(ep, body.videoUrl);
    return { ok: true };
  }],
];

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) { raw += chunk; if (raw.length > 1e5) throw new Error("too large"); }
  return raw ? JSON.parse(raw) : {};
}

http.createServer(async (req, res) => {
  const send = (code, data, type = "application/json") => {
    if (res.headersSent) return res.end();
    res.writeHead(code, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin" });
    res.end(type === "application/json" ? JSON.stringify(data) : data);
  };
  try {
    const url = new URL(req.url, "http://x");
    if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "POST") return send(405, { error: "Method not allowed." });
    if (url.pathname === "/api/events") {
      const ip = clientIp(req), mine = sseByIp.get(ip) || 0;
      if (clients.size >= MAX_SSE || mine >= MAX_SSE_PER_IP) return send(429, { error: "Too many live connections." });
      sseByIp.set(ip, mine + 1);
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      res.write("retry: 3000\n\n");
      clients.add(res); setViewers(clients.size);
      req.on("close", () => { clients.delete(res); const n = (sseByIp.get(ip) || 1) - 1; n > 0 ? sseByIp.set(ip, n) : sseByIp.delete(ip); setViewers(clients.size); });
      return;
    }
    if (url.pathname.startsWith("/api/") && limited("api:" + clientIp(req), 240, 60_000)) return send(429, { error: "Slow down a little." });
    if (url.pathname.startsWith("/api/")) {
      for (const [method, re, fn] of routes) {
        const m = url.pathname.match(re);
        if (m && req.method === method) {
          const body = method === "POST" ? await readBody(req) : {};
          const out = await fn(m.slice(1), body, req);
          return Array.isArray(out) && typeof out[0] === "number" ? send(out[0], out[1]) : send(200, out);
        }
      }
      return send(404, { error: "Not found." });
    }
    const epm = url.pathname.match(/^\/episodes\/([\w-]+)\.mp4$/);
    if (epm) {
      const hidden = getDb().episodes.find((e) => e.id === epm[1] && e.status === "scheduled");
      const f = hidden ? null : episodeFile(epm[1]);
      if (!f) return send(404, "Not found", "text/plain");
      const stat = fs.statSync(f), range = req.headers.range?.match(/bytes=(\d+)-(\d*)/);
      const start = range ? Number(range[1]) : 0, end = Math.min(stat.size - 1, range && range[2] ? Number(range[2]) : stat.size - 1);
      if (start > end || start >= stat.size) { res.writeHead(416, { "content-range": `bytes */${stat.size}` }); return res.end(); }
      res.writeHead(range ? 206 : 200, { "content-type": "video/mp4", "accept-ranges": "bytes", "content-length": end - start + 1, ...(range ? { "content-range": `bytes ${start}-${end}/${stat.size}` } : {}) });
      const stream = fs.createReadStream(f, { start, end });
      stream.on("error", () => res.destroy());
      return stream.pipe(res);
    }
    const pathname = url.pathname === "/stream" ? "/stream.html" : url.pathname;
    let file = path.join(PUBLIC, path.normalize(pathname));
    if (!file.startsWith(PUBLIC)) return send(403, "Forbidden", "text/plain");
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, "index.html");
    send(200, fs.readFileSync(file), TYPES[path.extname(file)] || "application/octet-stream");
  } catch (err) {
    const bad = err instanceof SyntaxError || err?.code === "ERR_INVALID_URL" || err?.message === "too large";
    if (!bad) console.error(err);
    try { send(bad ? 400 : 500, { error: bad ? "That request couldn't be read." : "Something broke on our side. Try again." }); } catch { res.destroy(); }
  }
}).listen(PORT, () => {
  console.log(`${COIN.name} ($${COIN.ticker}) → http://localhost:${PORT}`);
  console.log(`Stream overlay for OBS → http://localhost:${PORT}/stream`);
  console.log(`Video: ${provider()}${DEV ? " · dev tools ON" : ""}`);
});
