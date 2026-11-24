// Demo backend: stands in for server.js inside the browser so the site can be previewed
// without a coin or a host. Fees are simulated. The real site reads creator fees on-chain.
(() => {
  const COST = 0.5;
  const coin = {
    id: "demo", name: "In My Town", ticker: "TOWN", town: "Puddleton", color: "#2563eb", mint: "",
    pumpUrl: "https://pump.fun", links: {},
    facts: {
      weird: "It has rained for 400 years and everyone owns a boat instead of a car",
      who: "Ducks run the post office and they are strict",
      night: "The puddles glow and you can see another town underneath",
    },
  };

  // --- Template script (same as lib/script.js) ---
  function rng(seed) { let h = 2166136261; for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 10000) / 10000; }
  const pick = (r, a) => a[Math.floor(r() * a.length)];
  const lc = (s) => s.trim().replace(/[.!]+$/, "").replace(/^./, (m) => m.toLowerCase());
  function script(n) {
    const r = rng(coin.id + ":" + n), t = coin.town;
    const extras = [
      ["the mayor is a dog and nobody questions it", "town hall steps", "a dog in a tiny hat stamps papers"],
      ["the bus only stops if you dance", "bus stop", "avatar does a stiff blocky dance, bus screeches in"],
      ["we pay for snacks with compliments", "corner store", "avatar bows to the cashier"],
      ["the river flows uphill on Tuesdays", "river bank", "water climbs a hill, fish look confused"],
      ["every house has exactly one door, but it's on the roof", "suburb street", "avatars climb ladders to get home"],
      ["the weather is decided by a coin flip", "town square", "a giant coin spins in the sky"],
      [`everyone holds $${coin.ticker} and nobody can explain why`, "the bank", "avatars hold glowing coins and shrug"],
    ];
    const a = pick(r, extras), b = pick(r, extras.filter((x) => x !== a));
    const scenes = [
      { line: `In my town, ${lc(coin.facts.weird)}.`, setting: `${t} main street`, action: "avatar turns to camera, deadpan", mood: "day" },
      { line: `Our neighbors? ${coin.facts.who}.`, setting: "neighborhood block", action: "neighbors wave in unison", mood: "day" },
      { line: `In my town, ${a[0]}.`, setting: a[1], action: a[2], mood: "sunset" },
      { line: `Also, ${b[0]}.`, setting: b[1], action: b[2], mood: "sunset" },
      { line: `But at night... ${lc(coin.facts.night)}.`, setting: `${t} at night`, action: "street lights flicker, avatar hides behind a block", mood: "night" },
      { line: n > 1 ? `Last time I told you about ${t}. They didn't like that.` : `Nobody leaves ${t}. Nobody wants to.`, setting: "town gate", action: "the gate slowly closes", mood: "storm" },
      { line: `Follow for part ${n + 1}. If I'm still here.`, setting: "avatar bedroom", action: "lights cut out", mood: "night" },
    ];
    if (n > 1) { scenes[0].line = `In my town, ${a[0]}.`; scenes[2].line = `And yes, ${lc(coin.facts.weird)}. Still.`; }
    return { title: `In my town: ${t} — part ${n}`, scenes };
  }

  // --- State ---
  const now = Date.now(), min = 60_000;
  const made = (n, ago, dur) => ({ id: "ep" + n, number: n, status: "ready", costSol: COST, scriptSource: "template", ...script(n),
    createdAt: now - ago, writtenAt: now - ago + 20_000, renderingAt: now - ago + 20_000, readyAt: now - ago + dur, renderProgress: 1, videoUrl: null });
  const db = {
    fund: { balance: 0, totalIn: 0, spent: 2 * COST },
    episodes: [made(2, 26 * min, 4 * min), made(1, 95 * min, 5 * min)],
    feeLog: [],
  };
  // Fees over the last 25 minutes of this round
  for (let t = now - 25 * min; t < now; t += 40_000 + Math.random() * 50_000) {
    const n = 1 + Math.floor(Math.random() * 3), sol = +(n * (0.003 + Math.random() * 0.009)).toFixed(4);
    db.feeLog.unshift({ sol, source: "trades", txCount: n, sig: null, at: Math.round(t) });
    db.fund.balance += sol; db.fund.totalIn += sol;
  }
  db.fund.balance = Math.min(db.fund.balance, 0.41);
  let viewers = 120 + Math.floor(Math.random() * 60);
  const IDEAS = [["The ducks start delivering letters to people who haven't been born yet", "Every boat in town turns around and faces Ollie's house", "Mrs. Pearl admits she wrote the rule, and it was a lie"],
    ["The lighthouse starts blinking a message in code", "The copy of Milo starts going to school instead of Milo", "The rain stops for one minute, and everyone screams"]];
  let pollN = 0, poll = null, lastPoll = null;
  const names = ["fan_7x2", "duckwatcher", "milo_fan", "puddle", "rainboy", "w3Kx", "sol_sam", "ollie4ever"];
  function newPoll() { poll = { id: "poll" + (++pollN), question: `What happens in episode ${db.episodes.length + 1}?`, options: IDEAS[pollN % 2].map((l, i) => ({ key: "ABC"[i], label: l })), votes: {}, recent: [] }; }
  newPoll();
  function tally(p) { const counts = { A: 0, B: 0, C: 0 }; for (const k of Object.values(p.votes)) counts[k]++; const total = Object.values(counts).reduce((a, b) => a + b, 0); const leader = total ? p.options.reduce((b, o) => counts[o.key] > counts[b.key] ? o : b) : null; return { counts, total, leader }; }
  const pollView = (p) => p && { id: p.id, question: p.question, options: p.options, recent: p.recent, voters: Object.keys(p.votes).length, tally: tally(p), winner: p.winner };
  function vote(id, key, source, name) { poll.votes[id] = key; poll.recent.unshift({ name, key, source, at: Date.now() }); poll.recent.length = Math.min(poll.recent.length, 30); emit("vote", { ...pollView(poll), last: poll.recent[0] }); }
  setInterval(() => { const k = ["A", "A", "B", "C", "A", "B"][Math.floor(Math.random() * 6)]; const n = names[Math.floor(Math.random() * names.length)]; vote("w:" + n, k, "chat", n); }, 3500);

  const listeners = new Set();
  const emit = (type, data) => listeners.forEach((l) => l(type, data));
  const producing = () => db.episodes.find((e) => e.status === "writing" || e.status === "rendering");
  function state() {
    const ready = db.episodes.filter((e) => e.status === "ready");
    return {
      coin, viewers, now: Date.now(), devTools: true, videoProvider: "preview", watching: [],
      fund: { ...db.fund, cost: COST, progress: Math.min(1, db.fund.balance / COST), since: db.episodes[0]?.createdAt },
      episodes: db.episodes.map((e) => ({ ...e, scenes: [...e.scenes], coin: { id: coin.id, town: coin.town, ticker: coin.ticker, color: coin.color } })),
      latest: ready[0]?.id || null, producing: producing()?.id || null, feeLog: db.feeLog.slice(0, 40),
      poll: pollView(poll), lastPoll: pollView(lastPoll), chat: { state: "joined", viewers },
    };
  }
  function addFees(sol, txCount) {
    db.fund.balance += sol; db.fund.totalIn += sol;
    db.feeLog.unshift({ sol, source: txCount ? "trades" : "test fees", txCount, sig: null, at: Date.now() });
    emit("fees", db.feeLog[0]);
    maybeProduce();
  }
  function maybeProduce() {
    if (producing() || db.fund.balance < COST) return;
    db.fund.balance -= COST; db.fund.spent += COST;
    const n = db.episodes.length + 1, full = script(n);
    const t = tally(poll); const win = t.leader || poll.options[0]; poll.winner = win.key; lastPoll = poll;
    full.scenes[0].line = `In my town, ${lc(win.label)}.`; full.scenes[3].line = "You voted for this. I just live here.";
    const ep = { id: "ep" + n, number: n, status: "writing", costSol: COST, createdAt: Date.now(), title: full.title, scenes: [], scriptSource: "template", videoUrl: null, premise: win.label, decidedBy: "votes" };
    newPoll(); emit("vote", pollView(poll));
    db.episodes.unshift(ep); emit("episode", ep);
    let i = 0;
    const write = setInterval(() => {
      ep.scenes.push(full.scenes[i++]); emit("episode", ep);
      if (i < full.scenes.length) return;
      clearInterval(write);
      Object.assign(ep, { status: "rendering", writtenAt: Date.now(), renderingAt: Date.now(), renderProgress: 0 }); emit("episode", ep);
      const render = setInterval(() => {
        ep.renderProgress = Math.min(1, ep.renderProgress + 0.1); emit("episode", ep);
        if (ep.renderProgress < 1) return;
        clearInterval(render);
        Object.assign(ep, { status: "ready", readyAt: Date.now() }); emit("episode", ep);
        maybeProduce();
      }, 800);
    }, 2600);
  }
  // Simulated trading
  (function tick() {
    setTimeout(() => { const n = 1 + Math.floor(Math.random() * 3); addFees(+(n * (0.004 + Math.random() * 0.01)).toFixed(4), n); tick(); }, 2500 + Math.random() * 3500);
  })();
  setInterval(() => { viewers = Math.max(40, viewers + Math.round((Math.random() - 0.45) * 6)); emit("viewers", { viewers }); }, 5000);

  // --- Stand-ins for fetch and EventSource ---
  const realFetch = window.fetch.bind(window);
  const json = (data, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } }));
  window.fetch = (url, opts = {}) => {
    const path = String(url);
    if (path === "/api/state") return json(state());
    if (path === "/api/vote") { const b = JSON.parse(opts.body || "{}"); vote("site:" + b.voter, String(b.key).toUpperCase(), "site", "you"); return json({ poll: pollView(poll) }); }
    if (path === "/api/dev/fees") {
      const sol = Number(JSON.parse(opts.body || "{}").sol);
      if (!(sol > 0 && sol < 100)) return json({ error: "Enter an amount between 0 and 100 SOL." }, 400);
      addFees(sol, null); return json({ ok: true });
    }
    return realFetch(url, opts);
  };
  window.EventSource = class {
    constructor() {
      this.h = {};
      this.off = ((l) => (listeners.add(l), () => listeners.delete(l)))((type, data) => (this.h[type] || []).forEach((fn) => fn({ data: JSON.stringify(data) })));
      setTimeout(() => this.onopen?.(), 50);
    }
    addEventListener(type, fn) { (this.h[type] ||= []).push(fn); }
    close() { this.off(); }
  };
})();
