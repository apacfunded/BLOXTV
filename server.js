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
startFeeWatcher(addFees);
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
  ["POST", /^\/api\/vote$/, (_, body) => {
    const id = String(body.voter || "").slice(0, 40), key = String(body.key || "").toUpperCase();
    if (!id) return [400, { error: "Missing voter id." }];
    const poll = siteVote(id, key);
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
  const url = new URL(req.url, "http://x");
  const send = (code, data, type = "application/json") => {
    res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
    res.end(type === "application/json" ? JSON.stringify(data) : data);
  };
  try {
    if (url.pathname === "/api/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      res.write("retry: 3000\n\n");
      clients.add(res); setViewers(clients.size);
      req.on("close", () => { clients.delete(res); setViewers(clients.size); });
      return;
    }
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
      const start = range ? Number(range[1]) : 0, end = range && range[2] ? Number(range[2]) : stat.size - 1;
      res.writeHead(range ? 206 : 200, { "content-type": "video/mp4", "accept-ranges": "bytes", "content-length": end - start + 1, ...(range ? { "content-range": `bytes ${start}-${end}/${stat.size}` } : {}) });
      return fs.createReadStream(f, { start, end }).pipe(res);
    }
    const pathname = url.pathname === "/stream" ? "/stream.html" : url.pathname;
    let file = path.join(PUBLIC, path.normalize(pathname));
    if (!file.startsWith(PUBLIC)) return send(403, "Forbidden", "text/plain");
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, "index.html");
    send(200, fs.readFileSync(file), TYPES[path.extname(file)] || "application/octet-stream");
  } catch (err) {
    console.error(err);
    send(500, { error: "Something broke on our side. Try again." });
  }
}).listen(PORT, () => {
  console.log(`${COIN.name} ($${COIN.ticker}) → http://localhost:${PORT}`);
  console.log(`Stream overlay for OBS → http://localhost:${PORT}/stream`);
  console.log(`Video: ${provider()}${DEV ? " · dev tools ON" : ""}`);
});
