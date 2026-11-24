// Reads the pump.fun livestream chat for one coin (read-only, anonymous).
//
// pump.fun has no public chat API. Its chat is a socket.io service at livechat.pump.fun, and this
// talks to it the way the open-source clients do (pumpstream, pump-chat-client). It can break
// whenever pump.fun changes the service; when that happens the site keeps working and votes
// fall back to the website only.
//
// Keep ONE connection per coin. Several connections from one IP get refused.
import WebSocket from "ws";

const URL = "wss://livechat.pump.fun/socket.io/?EIO=4&transport=websocket";

export function startPumpChat(mint, onMessage, { onStatus } = {}) {
  let ws, pingTimer, attempt = 0, stopped = false;
  const seen = new Set();
  const status = (s, extra) => { onStatus?.(s, extra); if (s !== "message") console.log(`[chat] ${s}${extra ? " " + extra : ""}`); };
  const debug = process.env.PUMP_CHAT_DEBUG === "1";

  const send = (s) => { if (ws?.readyState === WebSocket.OPEN) ws.send(s); };

  function handle(raw) {
    const data = String(raw);
    if (debug) console.log("[chat] <<", data.slice(0, 300));
    if (data === "2") return send("3");                      // engine.io ping -> pong
    if (data.startsWith("0")) {                              // engine.io open. The SERVER pings and we pong (above);
      // a client-sent ping makes a socket.io v4 server close the connection as a protocol error.
      send(`40${JSON.stringify({ origin: "https://pump.fun", timestamp: Date.now(), token: null })}`);
      return;
    }
    if (data.startsWith("40")) {                             // socket.io connected: join the coin's room
      send(`420${JSON.stringify(["joinRoom", { roomId: mint, username: "anonymous" }])}`);
      status("joined", mint);
      attempt = 0;
      return;
    }
    if (data.startsWith("430")) {                            // the server's answer to joinRoom
      if (debug) console.log("[chat] joinRoom reply", data.slice(3, 300));
      return;
    }
    if (data.startsWith("42")) {
      let payload;
      try { payload = JSON.parse(data.slice(data.indexOf("["))); } catch { return; }
      const [event, body] = payload;
      const items = Array.isArray(body) ? body : [body];
      for (const m of items) {
        if (!m || typeof m !== "object" || typeof m.message !== "string" || typeof m.userAddress !== "string") continue;
        if (event === "messageHistory") continue;            // don't count old messages as new votes
        const id = m.id || `${m.userAddress}:${m.timestamp}:${m.message}`;
        if (seen.has(id)) continue;
        seen.add(id); if (seen.size > 5000) seen.delete(seen.values().next().value);
        onMessage({ id, wallet: m.userAddress, username: m.username || m.userAddress.slice(0, 4) + "…", text: m.message,
          at: m.timestamp ? Date.parse(m.timestamp) || Date.now() : Date.now(), isCreator: !!m.isCreator });
      }
      if (event === "viewerCount") { const n = typeof body === "number" ? body : body?.count; if (n != null) status("viewers", String(n)); }
    }
  }

  function connect() {
    if (stopped) return;
    status("connecting");
    ws = new WebSocket(URL, {
      headers: { Origin: "https://pump.fun", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36", "Accept-Language": "en-US,en;q=0.9", Pragma: "no-cache", "Cache-Control": "no-cache" },
    });
    ws.on("message", handle);
    ws.on("error", (e) => status("error", e.message));
    ws.on("close", (code, reason) => {
      clearInterval(pingTimer);
      if (debug) console.log(`[chat] closed by ${code === 1000 || code === 1005 ? "us or cleanly" : "server"}: code ${code} ${String(reason)}`);
      if (stopped) return;
      const delay = Math.min(60_000, 3000 * 2 ** Math.min(attempt++, 5));
      status("disconnected", `retry in ${Math.round(delay / 1000)}s`);
      setTimeout(connect, delay);
    });
  }
  connect();
  return () => { stopped = true; clearInterval(pingTimer); ws?.close(); };
}
