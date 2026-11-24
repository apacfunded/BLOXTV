(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const app = $("#app");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sol = (n, d) => (d != null ? n.toFixed(d) : n >= 100 ? n.toFixed(0) : n >= 1 ? n.toFixed(2) : n.toFixed(3)) + " SOL";
  const lower = (s) => String(s).replace(/^./, (m) => m.toLowerCase()).replace(/[.!]+$/, "");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}h ${m}m` : m ? `${m}m ${String(x).padStart(2, "0")}s` : `${x}s`; };
  const ago = (t) => { const s = (Date.now() - t) / 1000; return s < 10 ? "just now" : s < 60 ? Math.floor(s) + "s ago" : s < 3600 ? Math.floor(s / 60) + "m ago" : s < 86400 ? Math.floor(s / 3600) + "h ago" : Math.floor(s / 86400) + "d ago"; };
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("show"), 3200); }

  let S = null, skew = 0;
  const wallet = (() => { try { let w = localStorage.getItem("imt-voter"); if (!w) { w = "v" + Math.random().toString(36).slice(2, 12); localStorage.setItem("imt-voter", w); } return w; } catch { return "v" + Math.random().toString(36).slice(2, 12); } })();
  const now = () => Date.now() + skew;
  const ready = () => S.episodes.filter((e) => e.status === "ready");

  // ---------- Background: rain falling over a dark block town, puddles catching the light
  (function rain() {
    const c = $("#bg"), ctx = c.getContext("2d");
    let W, H, drops = [], houses = [];
    const resize = () => {
      W = c.width = innerWidth; H = c.height = innerHeight;
      houses = []; let x = -20;
      while (x < W + 60) { const w = 50 + Math.random() * 90, h = 40 + Math.random() * 120; houses.push({ x, w, h, win: Math.random() > .4 }); x += w + 4 + Math.random() * 30; }
      drops = Array.from({ length: Math.min(260, Math.floor(W / 5)) }, () => ({ x: Math.random() * W, y: Math.random() * H, l: 10 + Math.random() * 18, v: 7 + Math.random() * 9 }));
    };
    addEventListener("resize", resize); resize();
    let t = 0;
    function frame() {
      t++;
      ctx.clearRect(0, 0, W, H);
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#120607"); g.addColorStop(.7, "#170709"); g.addColorStop(1, "#0d0405");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // skyline
      const base = H * .78;
      for (const h of houses) {
        ctx.fillStyle = "#1b090c"; ctx.fillRect(h.x, base - h.h, h.w, h.h);
        ctx.fillStyle = "#210b0e"; ctx.beginPath(); ctx.moveTo(h.x - 3, base - h.h); ctx.lineTo(h.x + h.w / 2, base - h.h - 18); ctx.lineTo(h.x + h.w + 3, base - h.h); ctx.fill();
        if (h.win) { const on = Math.sin(t / 90 + h.x) > -0.3; ctx.fillStyle = on ? "rgba(255, 210, 63, .55)" : "rgba(255, 210, 63, .12)"; ctx.fillRect(h.x + h.w * .3, base - h.h * .6, 10, 12); }
      }
      // water with reflections
      ctx.fillStyle = "#0e0405"; ctx.fillRect(0, base, W, H - base);
      for (const h of houses) if (h.win) { ctx.fillStyle = "rgba(255, 210, 63, .06)"; ctx.fillRect(h.x + h.w * .3 - 2, base + 4, 14, 30 + Math.sin(t / 40 + h.x) * 6); }
      ctx.fillStyle = "rgba(94, 230, 255, .05)"; ctx.fillRect(0, base, W, 2);
      // rain
      if (!reduced) {
        ctx.strokeStyle = "rgba(255, 255, 255, .11)"; ctx.lineWidth = 1; ctx.beginPath();
        for (const d of drops) { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 1.5, d.y + d.l); d.y += d.v; d.x -= .4; if (d.y > H) { d.y = -20; d.x = Math.random() * W; } }
        ctx.stroke();
        requestAnimationFrame(frame);
      }
    }
    frame();
  })();

  // ---------- What is "the next episode" right now?
  function current() {
    const making = S.episodes.find((e) => e.id === S.producing);
    if (making) return { ep: making, number: making.number, stage: making.status === "writing" ? 1 : 2 };
    const latest = ready()[0];
    if (latest && now() - latest.readyAt < 90_000) return { ep: latest, number: latest.number, stage: 3 };
    const number = S.episodes.filter((e) => e.status !== "failed").length + 1;
    return { ep: null, number, stage: 0 };
  }
  const stageWord = (stage, n) => [`Episode ${n} is being funded`, `Episode ${n} is being written`, `Episode ${n} is rendering`, `Episode ${n} just premiered`][stage];

  // ---------- Router: every section is its own page
  const PAGES = { "/": home, "/live": live, "/vote": vote, "/episodes": episodes, "/towns": towns, "/how": how };
  let page = null, pageKey = null, tv = null, tvId = null;
  function route() {
    let path = location.pathname.replace(/\/+$/, "") || "/";
    if (!PAGES[path]) path = "/";
    document.querySelectorAll("#nav a, .foot-nav a").forEach((a) => a.toggleAttribute("aria-current", a.getAttribute("href") === path));
    if (pageKey !== path) {
      tv?.destroy(); tv = null; tvId = null; boardKey = null; listSig = "";
      pageKey = path; page = PAGES[path]; app.innerHTML = page.html(); page.mount?.();
      scrollTo({ top: 0, behavior: "instant" });
      document.title = (path === "/" ? "" : `${$("#nav a[aria-current]")?.textContent} · `) + "BloxTV";
    }
    page.update();
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-link]"); if (!a || e.metaKey || e.ctrlKey) return;
    e.preventDefault(); history.pushState({}, "", a.getAttribute("href")); route();
  });
  addEventListener("popstate", route);

  // ---------- Shared bits
  const c = () => S.coin;
  const buyBtn = () => c().pumpUrl ? `<a class="btn btn-accent btn-lg" href="${esc(c().pumpUrl)}" target="_blank" rel="noopener">Buy $${esc(c().ticker)} on pump.fun</a>` : `<a class="btn btn-accent btn-lg" aria-disabled="true">Buying opens at launch</a>`;

  function voteHTML(big) {
    return `<section class="panel votes" aria-labelledby="vote-h">
      <div class="panel-head"><h3 id="vote-h">${big ? "What happens next?" : "Vote on the next episode"}</h3><span class="muted small" id="vote-src"></span></div>
      <blockquote class="cliff" id="vote-cliff" hidden></blockquote>
      <p class="muted small" id="vote-q"></p>
      <div class="vote-opts" id="vote-opts" role="group" aria-label="Vote options"></div>
      <p class="muted small" id="vote-foot"></p>
      <ul class="feed vote-feed" id="vote-feed" aria-live="polite"></ul>
    </section>`;
  }
  let myVote = null; try { myVote = JSON.parse(localStorage.getItem("imt-vote") || "null"); } catch {}
  function renderVote(poll) {
    const box = $("#vote-opts"); if (!box) return;
    if (!poll) { box.innerHTML = ""; $("#vote-q").textContent = "Writing the cliffhanger now. The vote for what happens next opens in a moment."; $("#vote-cliff").hidden = true; $("#vote-foot").textContent = ""; return; }
    const t = poll.tally, max = Math.max(1, ...Object.values(t.counts));
    const mine = myVote && myVote.pollId === poll.id ? myVote.key : null;
    $("#vote-q").textContent = poll.question;
    const cl = $("#vote-cliff"); cl.hidden = !poll.cliffhanger;
    if (poll.cliffhanger) cl.innerHTML = `<span>Episode ${poll.fromEpisode} ended on</span>“${esc(poll.cliffhanger)}”`;
    $("#vote-src").textContent = S.chat?.state === "joined" ? "Chat votes live" : S.chat?.state === "off" ? "Website votes only" : "Chat reconnecting";
    box.innerHTML = poll.options.map((o) => `
      <button class="vote-opt ${t.leader?.key === o.key ? "lead" : ""} ${mine === o.key ? "mine" : ""}" data-key="${o.key}" aria-pressed="${mine === o.key}">
        <span class="k">${o.key}</span><span class="l">${esc(o.label)}</span><span class="n">${t.counts[o.key]}</span>
        <span class="bar"><span style="width:${(t.counts[o.key] / max * 100).toFixed(0)}%"></span></span>
      </button>`).join("");
    $("#vote-foot").textContent = (t.total ? `${t.total} vote${t.total === 1 ? "" : "s"} so far${t.leader ? `, ${t.leader.key} is winning` : ""}. ` : "No votes yet. ") + "Vote here, or type A, B or C in the pump.fun chat. The winner becomes the next episode when the fund fills.";
    box.querySelectorAll(".vote-opt").forEach((b) => b.onclick = async () => {
      try {
        const r = await fetch("/api/vote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ voter: wallet, key: b.dataset.key }) });
        if (!r.ok) throw new Error((await r.json()).error);
        myVote = { pollId: poll.id, key: b.dataset.key }; try { localStorage.setItem("imt-vote", JSON.stringify(myVote)); } catch {}
        toast(`Voted ${b.dataset.key}`);
      } catch (e) { toast(e.message); }
    });
    const feed = $("#vote-feed");
    if (feed) feed.innerHTML = (poll.recent || []).slice(0, 5).map((v) => `<li><span class="plus">${esc(v.key)}</span><span>${esc(v.name)}</span><span class="muted">${v.source === "chat" ? "pump.fun chat" : "website"}</span><span class="when muted">${ago(v.at)}</span></li>`).join("");
  }

  // The TV: plays the latest episode; static between episodes.
  function mountTV(container) {
    const latest = ready()[0];
    const { stage } = current();
    if (latest && tvId !== latest.id) {
      tv?.destroy(); container.innerHTML = "";
      tv = ReelPlayer.for(container, { ...latest, coin: c() }, { onEnd: () => tv.play() });
      tvId = latest.id; tv.play();
      const btn = document.createElement("button"); btn.className = "btn tv-sound"; btn.textContent = "Sound on"; btn.type = "button";
      btn.onclick = () => { const v = container.querySelector("video"); if (!v) return; v.muted = !v.muted; btn.textContent = v.muted ? "Sound on" : "Sound off"; if (!v.muted) v.play().catch(() => {}); };
      container.appendChild(btn);
    } else if (!latest && !container.querySelector(".static")) {
      container.innerHTML = `<div class="static"><span>${stage ? "Episode 1 is being made" : "Episode 1 premieres here"}</span></div>`;
    }
    $(".tv")?.classList.toggle("on-air", stage > 0 || !!latest);
  }

  // ---------- Page: Home (centered, the TV is the hero)
  function home() {}
  home.html = () => `
    <section class="home wrap">
      <span class="eyebrow"><span class="dot live" aria-hidden="true"></span> <span id="home-status">On air</span></span>
      <h1>In my town, <em>every coin</em> gets its own show.</h1>
      <p class="lede">Every trade on <strong>$${esc(c().ticker)}</strong> pays a creator fee. The fees buy the next <strong>“In my town…”</strong> episode. You vote on what happens, and it premieres live on pump.fun.</p>
      <div class="home-cta">${buyBtn()}<a class="btn btn-lg" href="/vote" data-link>Vote on the story</a></div>

      <div class="tv-wrap"><div class="tv on-air" aria-label="BloxTV">
        <div class="screen" id="screen"></div>
        <div class="tv-controls"><span class="tv-badge">BloxTV · ${esc(c().town)}</span><span class="knobs"><span class="knob"></span><span class="knob"></span></span></div>
      </div></div>
      <div class="tv-caption">
        <strong id="tv-title"></strong>
        <span class="muted" id="tv-sub"></span>
        <div class="mini"><span id="tv-bar"></span></div>
      </div>

      <div class="home-vote">${voteHTML(true)}</div>

      <div class="home-grid">
        <a class="tile" href="/live" data-link><span class="k">Live</span><h3>Watch it get made</h3><p>Fees landing, the script typing itself, the render bar moving.</p></a>
        <a class="tile" href="/episodes" data-link><span class="k">Episodes</span><h3 id="tile-eps">The story so far</h3><p>Every episode, in order, with its cliffhanger.</p></a>
        <a class="tile" href="/how" data-link><span class="k">How it works</span><h3>Fees pay for the show</h3><p>60% of every creator fee goes into the episode fund.</p></a>
      </div>

      <div class="launch-tease">
        <span class="soon">Coming next</span>
        <h2>Launch your own town</h2>
        <p>After $${esc(c().ticker)}, any coin can get its own show. Same deal: no launch fee, fees pay for the episodes, viewers vote on the story.</p>
        <button class="btn btn-lg" type="button" data-launch>Launch a town</button>
      </div>
    </section>`;
  home.update = () => {
    const { ep, number, stage } = current();
    const latest = ready()[0];
    mountTV($("#screen"));
    $("#home-status").textContent = stageWord(stage, number);
    $("#tv-title").textContent = latest ? `Now playing: Episode ${latest.number}` : "Nothing aired yet";
    $("#tv-sub").textContent = latest ? `“${latest.cliffhanger || latest.scenes.at(-1)?.line || latest.title}”` : "The pilot premieres the moment the fund is full.";
    const f = S.fund, p = stage === 0 ? f.progress : stage === 2 ? (ep.renderProgress || 0) : 1;
    $("#tv-bar").style.width = (p * 100).toFixed(1) + "%";
    $("#tile-eps").textContent = ready().length ? `${ready().length} episode${ready().length === 1 ? "" : "s"} so far` : "The story so far";
    renderVote(S.poll);
  };

  // ---------- Page: Live board
  function live() {}
  live.html = () => `
    <section class="page wrap">
      <div class="page-head"><span class="eyebrow"><span class="dot live" aria-hidden="true"></span> Live</span><h1 id="board-title"></h1><p id="board-sub"></p></div>
      <ol class="stages" id="stages" aria-label="Production stages">
        ${["Funding", "Writing", "Rendering", "Premiere"].map((n, i) => `<li data-i="${i}"><span class="stage-n" aria-hidden="true">${i + 1}</span><div><strong>${n}</strong><span class="stage-detail"></span></div></li>`).join("")}
      </ol>
      <div class="board-grid">
        <section class="panel fund" aria-labelledby="fund-h">
          <div class="panel-head"><h3 id="fund-h">Episode fund</h3><span class="muted small" id="fund-since"></span></div>
          <p class="counter" aria-live="off"><span id="counter">0.000</span><span class="counter-of" id="counter-of"></span></p>
          <div class="meter big" role="progressbar" aria-label="Episode fund" aria-valuemin="0" aria-valuemax="100" id="fund-meter"><span id="fund-bar"></span></div>
          <dl class="kpis"><div><dt>Still needed</dt><dd id="k-need">–</dd></div><div><dt>Pace, last hour</dt><dd id="k-rate">–</dd></div><div><dt>Funded in</dt><dd id="k-eta">–</dd></div></dl>
          ${S.devTools ? `<form class="dev" id="dev"><label for="dev-sol">Test fees (dev only)</label><div class="row"><input id="dev-sol" inputmode="decimal" value="0.05"><button class="btn">Add fees</button></div></form>` : ""}
          <h4 class="feed-h">Fees coming in</h4>
          <ul class="feed" id="feed" aria-live="polite" aria-relevant="additions"></ul>
        </section>
        <section class="panel room" aria-labelledby="room-h">
          <div class="panel-head"><h3 id="room-h">Writers' room</h3><span class="muted small" id="room-status"></span></div>
          <ol class="script-live" id="script" aria-live="polite"></ol>
          <div class="render" id="render" hidden>
            <div class="panel-head"><strong>Rendering</strong><span class="muted small" id="render-pct"></span></div>
            <div class="meter" role="progressbar" aria-label="Render progress" aria-valuemin="0" aria-valuemax="100"><span id="render-bar"></span></div>
          </div>
          <h4 class="feed-h">Storyboard</h4>
          <div class="frames" id="frames"></div>
        </section>
      </div>
      <div class="section">${voteHTML(false)}</div>
    </section>`;
  live.mount = () => {
    const dev = $("#dev");
    if (dev) dev.onsubmit = async (e) => { e.preventDefault(); const r = await fetch("/api/dev/fees", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sol: $("#dev-sol").value }) }); if (!r.ok) toast((await r.json()).error); };
    shownFees = new Set(); shown = null;
  };
  let boardKey = null, shownFees = new Set(), shown = null, tweenRaf = 0;
  live.update = () => {
    const { ep, number, stage } = current();
    const f = S.fund;
    $("#board-title").textContent = stageWord(stage, number);
    $("#board-sub").textContent = [
      `Every trade adds to the fund. At ${sol(f.cost)} the script starts writing, right here.`,
      `Funded. ${ep?.premise ? `You voted: “${ep.premise}”. ` : ""}Scene ${(ep?.scenes.length || 0) + 1} is being written now.`,
      `The script is locked. Rendering the episode now.`,
      `It's playing on the pump.fun livestream right now.`,
    ][stage];
    document.querySelectorAll("#stages li").forEach((li, i) => { li.className = i < stage ? "done" : i === stage ? "active" : ""; li.toggleAttribute("aria-current", i === stage); });
    stageDetails();
    const bal = stage === 0 ? f.balance : f.cost;
    tweenCounter(bal);
    $("#counter-of").textContent = ` / ${sol(f.cost)}`;
    const p = Math.min(1, bal / f.cost);
    $("#fund-bar").style.width = (p * 100).toFixed(2) + "%";
    $("#fund-meter").setAttribute("aria-valuenow", Math.round(p * 100));
    const need = Math.max(0, f.cost - f.balance);
    const { rate, trades } = pace();
    $("#k-need").textContent = stage === 0 ? sol(need) : "Funded";
    $("#k-rate").textContent = rate > 0 ? `${sol(rate)}/hr` : "Waiting";
    $("#k-eta").textContent = stage > 0 ? "Done" : rate > 0 ? "~" + clock((need / rate) * 3600_000) : "Next trade";
    $("#fund-since").textContent = stage > 0 ? (f.balance > 0 ? `${sol(f.balance)} already in for episode ${number + 1}` : `Episode ${number + 1} fund opens next`) : trades ? `${trades} trade${trades === 1 ? "" : "s"} this round` : "";
    renderFeed();

    const key = ep ? ep.id : "funding-" + number;
    if (key !== boardKey) { boardKey = key; $("#script").innerHTML = ""; $("#frames").innerHTML = ""; typed = 0; queue.length = 0; frames = 0; instantUpTo = ep ? ep.scenes.length : 0; }
    if (!ep) {
      const prev = ready()[0];
      $("#script").innerHTML = `<li class="note">Writing starts the moment the fund is full.${prev ? ` It picks up after “${esc(prev.cliffhanger || prev.title)}”.` : " It's the pilot."}</li>`;
      $("#frames").innerHTML = Array.from({ length: 5 }, (_, i) => `<div class="frame empty"><span>Scene ${i + 1}</span></div>`).join("");
      $("#room-status").textContent = "Waiting for funding";
      $("#render").hidden = true;
    } else {
      $("#script .note")?.remove();
      $("#frames .empty") && ($("#frames").innerHTML = "");
      for (let i = typed + queue.length; i < ep.scenes.length; i++) queue.push(ep.scenes[i].line);
      pump();
      for (; frames < ep.scenes.length; frames++) {
        const box = document.createElement("div");
        box.className = "frame in";
        box.setAttribute("aria-label", `Scene ${frames + 1}: ${ep.scenes[frames].setting}`);
        ReelPlayer.still(box, { ...ep, coin: { ...c() } }, frames);
        box.insertAdjacentHTML("beforeend", `<span>Scene ${frames + 1}</span>`);
        $("#frames").appendChild(box);
      }
      $("#frames .writing")?.remove();
      if (ep.status === "writing") $("#frames").insertAdjacentHTML("beforeend", `<div class="frame writing"><span><span class="dot live" aria-hidden="true"></span> Scene ${ep.scenes.length + 1}</span></div>`);
      $("#room-status").textContent = ep.status === "writing" ? `${ep.scenes.length} scene${ep.scenes.length === 1 ? "" : "s"} written` : `${ep.scenes.length} scenes · ${ep.scriptSource === "claude" ? "written by Claude" : "house script"}`;
      $("#render").hidden = ep.status !== "rendering";
      if (ep.status === "rendering") {
        const rp = ep.renderProgress || 0;
        $("#render-bar").style.width = (rp * 100).toFixed(1) + "%";
        $("#render-pct").textContent = (rp ? Math.round(rp * 100) + "%" : "Starting") + (ep.renderNote ? " · " + ep.renderNote : "");
      }
    }
    renderVote(S.poll);
  };
  function stageDetails() {
    if (!$("#stages")) return;
    const { ep, stage } = current();
    const f = S.fund, t = now();
    const d = [
      stage === 0 ? `${Math.round(f.progress * 100)}% · ${f.since ? clock(t - f.since) : "–"}` : ep ? `Done in ${clock(ep.createdAt - (prevBuy(ep) || ep.createdAt))}` : "",
      stage < 1 ? "Up next" : stage === 1 ? `${ep.scenes.length} scenes · ${clock(t - ep.createdAt)}` : `Done in ${clock((ep.writtenAt || ep.createdAt) - ep.createdAt)}`,
      stage < 2 ? "Up next" : stage === 2 ? `${Math.round((ep.renderProgress || 0) * 100)}% · ${clock(t - (ep.renderingAt || t))}` : `Done in ${clock((ep.readyAt || t) - (ep.renderingAt || ep.readyAt || t))}`,
      stage < 3 ? "On the livestream" : `Live · ${ago(ep.readyAt)}`,
    ];
    document.querySelectorAll("#stages .stage-detail").forEach((el, i) => (el.textContent = d[i]));
  }
  const prevBuy = (ep) => S.episodes.find((e) => e.number === ep.number - 1)?.createdAt || S.feeLog.at(-1)?.at;
  function pace() {
    const t = now(), since = Math.max(S.fund.since || 0, t - 3600_000);
    const recent = S.feeLog.filter((l) => l.at >= since);
    if (!recent.length) return { rate: 0, trades: 0 };
    const start = Math.min(since === t - 3600_000 ? since : recent.at(-1).at, t - 60_000);
    const sum = recent.reduce((a, l) => a + l.sol, 0);
    return { rate: (sum / (t - start)) * 3600_000, trades: recent.reduce((a, l) => a + (l.txCount || 1), 0) };
  }
  function renderFeed() {
    const ul = $("#feed"); if (!ul) return;
    if (!S.feeLog.length) { ul.innerHTML = `<li class="note">No fees yet. They show up here the moment a trade lands.</li>`; return; }
    ul.querySelector(".note")?.remove();
    const items = S.feeLog.slice(0, 12);
    for (const l of [...items].reverse()) {
      const k = l.at + ":" + l.sol;
      if (shownFees.has(k)) continue;
      shownFees.add(k);
      const li = document.createElement("li");
      li.className = shownFees.size > items.length ? "new" : "";
      li.dataset.at = l.at;
      li.innerHTML = `<span class="plus">+${sol(l.sol, 4)}</span><span class="src">${l.txCount ? `${l.txCount} trade${l.txCount === 1 ? "" : "s"}` : esc(l.source)}</span><span class="when muted">${ago(l.at)}</span>${l.sig ? `<a class="tx" href="https://solscan.io/tx/${esc(l.sig)}" target="_blank" rel="noopener">View tx</a>` : `<span></span>`}`;
      ul.prepend(li);
    }
    while (ul.children.length > 12) ul.lastChild.remove();
  }
  let typed = 0, typing = false, frames = 0, instantUpTo = 0;
  const queue = [];
  function pump() {
    if (typing || !queue.length) return;
    const list = $("#script"); if (!list) { queue.length = 0; return; }
    typing = true;
    const line = queue.shift();
    const li = document.createElement("li");
    list.appendChild(li);
    if (reduced || typed < instantUpTo) { li.textContent = line; typed++; typing = false; return pump(); }
    li.classList.add("typing");
    let i = 0;
    const step = () => { if (!li.isConnected) { typing = false; return; } li.textContent = line.slice(0, ++i); if (i < line.length) setTimeout(step, 22); else { li.classList.remove("typing"); typed++; typing = false; pump(); } };
    step();
  }
  function tweenCounter(to) {
    const el = $("#counter"); if (!el) return;
    if (shown === null || reduced) { shown = to; el.textContent = to.toFixed(3); return; }
    const from = shown, t0 = performance.now();
    cancelAnimationFrame(tweenRaf);
    const step = (t) => { const k = Math.min(1, (t - t0) / 700), v = from + (to - from) * (1 - Math.pow(1 - k, 3)); el.textContent = v.toFixed(3); if (k < 1) tweenRaf = requestAnimationFrame(step); else shown = to; };
    if (to !== from) { el.parentElement.classList.remove("bump"); void el.offsetWidth; el.parentElement.classList.add("bump"); }
    tweenRaf = requestAnimationFrame(step);
  }

  // ---------- Page: Vote
  function vote() {}
  vote.html = () => `
    <section class="page wrap narrow">
      <div class="page-head"><span class="eyebrow">Vote</span><h1>You write the next episode</h1><p>Every episode ends on a cliffhanger. Pick what happens next. When the fund fills, the winner becomes the story.</p></div>
      ${voteHTML(true)}
      <div class="vote-how">
        <div><b>In the pump.fun chat</b>Type <strong>A</strong>, <strong>B</strong> or <strong>C</strong> while the stream is on. One vote per wallet; a new vote replaces your old one.</div>
        <div><b>On this page</b>Tap an option above. Votes from here and from chat are counted together, live.</div>
      </div>
      <div class="card section" id="last-vote" hidden><h3>Last vote</h3><p class="muted" id="last-vote-text"></p></div>
    </section>`;
  vote.update = () => {
    renderVote(S.poll);
    const lp = S.lastPoll, box = $("#last-vote");
    box.hidden = !lp;
    if (lp) { const w = lp.options.find((o) => o.key === lp.winner); $("#last-vote-text").textContent = `“${w?.label}” won ${lp.decidedBy === "votes" ? `with ${lp.tally.counts[lp.winner]} of ${lp.tally.total} votes` : "on a coin flip (no votes)"} and became episode ${S.episodes.find((e) => e.pollId === lp.id)?.number ?? "next"}.`; }
  };

  // ---------- Page: Episodes
  function episodes() {}
  let listSig = "";
  episodes.html = () => `
    <section class="page wrap">
      <div class="page-head"><span class="eyebrow">Episodes</span><h1>The story so far</h1><p id="ep-summary"></p></div>
      <div class="posters" id="posters"></div>
    </section>`;
  episodes.update = () => {
    const list = ready();
    const sig = list.map((e) => e.id).join();
    if (sig === listSig) return;
    listSig = sig;
    $("#ep-summary").textContent = list.length ? `${list.length} episode${list.length === 1 ? "" : "s"} · ${sol(S.fund.spent)} of creator fees spent on video` : "No episodes yet. The pilot is being funded.";
    $("#posters").innerHTML = list.map((e) => `
      <button class="poster" data-ep="${e.id}">
        ${e.videoUrl ? `<video src="${esc(e.videoUrl)}#t=1.5" muted playsinline preload="metadata"></video>` : `<div class="frame-still"></div>`}
        <span class="shade"></span>
        <span class="ep-play" aria-hidden="true">▶</span>
        <span class="meta"><span class="ep-num">Episode ${e.number}</span><span class="ep-line">“${esc(e.cliffhanger || e.scenes.at(-1)?.line || e.title)}”</span><span class="ep-when">${ago(e.readyAt || e.createdAt)}</span></span>
        <span class="sr-only">Play ${esc(e.title)}</span>
      </button>`).join("") + `<div class="poster empty"><span>Episode ${list.length + 1}<br><small>being funded</small></span></div>`;
    document.querySelectorAll("[data-ep]").forEach((b) => b.onclick = () => openPlayer(S.episodes.find((e) => e.id === b.dataset.ep)));
    document.querySelectorAll(".poster .frame-still").forEach((box, i) => ReelPlayer.still(box, { ...list[i], coin: c() }, 0));
  };
  function openPlayer(ep) {
    tv?.pause();
    const d = document.createElement("dialog");
    d.className = "player"; d.setAttribute("aria-label", ep.title);
    d.innerHTML = `<div class="player-stage"></div><div class="player-bar"></div>
      <details class="script"><summary>Script and shot list</summary><ol>${ep.scenes.map((s) => `<li><strong>${esc(s.line)}</strong><br><span class="muted">${esc(s.setting)}. ${esc(s.action)}. ${esc(s.mood)}.</span></li>`).join("")}</ol>
      <p class="muted small">Paid for with ${sol(ep.costSol)} of creator fees.${ep.writtenAt ? ` Written in ${clock(ep.writtenAt - ep.createdAt)}.` : ""}</p></details>`;
    document.body.appendChild(d);
    const bar = $(".player-bar", d);
    let p;
    if (ep.videoUrl) {
      $(".player-stage", d).innerHTML = `<video src="${esc(ep.videoUrl)}" controls autoplay playsinline></video>`;
      bar.innerHTML = `<a class="btn" href="${esc(ep.videoUrl)}" download="bloxtv-ep${ep.number}.mp4">Download video</a><button class="btn" data-act="close">Close</button>`;
    } else {
      bar.innerHTML = `<button class="btn" data-act="play">Pause</button><button class="btn" data-act="close">Close</button>`;
      const playBtn = $("[data-act=play]", d);
      p = ReelPlayer.for($(".player-stage", d), { ...ep, coin: c() }, { onState: (on) => (playBtn.textContent = on ? "Pause" : "Play"), onEnd: () => (playBtn.textContent = "Replay") });
      playBtn.onclick = () => p.toggle(); p.play();
    }
    const close = () => { p?.destroy(); d.close(); d.remove(); tv?.play(); };
    $("[data-act=close]", d).onclick = close;
    d.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
    d.showModal();
  }

  // ---------- Page: Towns
  function towns() {}
  towns.html = () => `
    <section class="page wrap">
      <div class="page-head"><span class="eyebrow">Towns</span><h1>Every town is a coin with its own show</h1><p>$${esc(c().ticker)} is the first. The launchpad opens to other coins next.</p></div>
      <dl class="stats" aria-label="Totals">
        <div><dt>Towns</dt><dd>1</dd></div><div><dt>Episodes made</dt><dd id="s-episodes">0</dd></div><div><dt>Fees spent on video</dt><dd id="s-spent">0</dd></div><div><dt>Votes cast</dt><dd id="s-votes">0</dd></div>
      </dl>
      <section class="card">
        <ul class="towns"><li><a class="town-row" href="/live" data-link>
          <img src="/brand/pfp-512.jpg" alt="">
          <div><div class="t-name">${esc(c().town)} <span class="muted">· $${esc(c().ticker)}</span></div><div class="t-meta">“In my town, ${esc(lower(c().facts.weird))}.”</div></div>
          <div class="t-right"><b id="t-eps">0 episodes</b><span id="t-fund"></span></div>
        </a></li></ul>
      </section>
      <section class="card section">
        <span class="eyebrow">Creator fees</span>
        <h2 style="margin-top:10px">Every trade feeds the show.</h2>
        <p class="muted" style="max-width:60ch">pump.fun pays creator fees on every trade. On BloxTV those fees are split the moment they land.</p>
        <div class="split" aria-hidden="true"><div class="s1"><b>60%</b>Episode fund</div><div class="s2"><b>20%</b>Creator</div><div class="s3"><b>20%</b>Platform</div></div>
        <div class="split-notes"><div><b>60% makes episodes.</b> Each time the fund reaches ${sol(S.fund.cost)}, the next episode is written, rendered and premiered on stream.</div><div><b>20% to the creator.</b> Paid out like any pump.fun coin.</div><div><b>20% runs the platform.</b> Hosting, the stream and the video credits.</div></div>
      </section>
      <div class="launch-tease" style="text-align:center">
        <span class="soon">Coming next</span>
        <h2>Your town could be next</h2>
        <p>Launching other towns opens after $${esc(c().ticker)}. No launch fee. Fees pay for the episodes. Viewers vote on the story.</p>
        <button class="btn btn-lg" type="button" data-launch>Launch a town</button>
      </div>
    </section>`;
  towns.update = () => {
    const { number, stage } = current(), n = ready().length;
    $("#s-episodes").textContent = n; $("#s-spent").textContent = S.fund.spent.toFixed(2);
    $("#s-votes").textContent = (S.poll?.voters || 0) + (S.lastPoll?.voters || 0);
    $("#t-eps").textContent = `${n} episode${n === 1 ? "" : "s"}`;
    $("#t-fund").textContent = stage > 0 ? "making episode " + number : `fund ${Math.round(S.fund.progress * 100)}%`;
  };

  // ---------- Page: How it works
  function how() {}
  how.html = () => `
    <section class="page wrap">
      <div class="page-head"><span class="eyebrow">How it works</span><h1>Fees in, episodes out</h1><p>A memecoin that makes its own TV show, paid for by the people trading it.</p></div>
      <div class="cols">
        <section class="card"><h2>The loop</h2><ol class="steps">
          <li><b>Trade $${esc(c().ticker)} on pump.fun.</b> Every trade pays a creator fee, and 60% of it goes into the episode fund.</li>
          <li><b>Vote while it fills.</b> Each episode ends on a cliffhanger with three ways it could go. Type A, B or C in the pump.fun chat, or vote here.</li>
          <li><b>At ${sol(S.fund.cost)} the episode gets made.</b> The winning option becomes the story. The script is written live, scene by scene, then rendered.</li>
          <li><b>It premieres on the stream.</b> Then the next fund opens and the next vote starts.</li>
        </ol>${c().mint ? `<p class="muted small" style="margin:14px 0 0">Contract <code>${esc(c().mint)}</code></p>` : ""}</section>
        <section class="card"><h2>The town of ${esc(c().town)}</h2><dl class="facts">
          <div><dt class="muted small">What's strange about it</dt><dd>${esc(c().facts.weird)}</dd></div>
          <div><dt class="muted small">Who lives there</dt><dd>${esc(c().facts.who)}</dd></div>
          <div><dt class="muted small">What happens at night</dt><dd>${esc(c().facts.night)}</dd></div>
          <div><dt class="muted small">The cast</dt><dd>Ollie, who tells the story. Milo, his best friend. Mrs. Pearl next door. The ducks who run the post office.</dd></div>
        </dl></section>
      </div>
      <section class="card section faq"><h2>Questions</h2>
        <details><summary>Is it still a pump.fun coin?</summary><p>Yes. $${esc(c().ticker)} is a normal pump.fun coin with the normal bonding curve and trading. BloxTV only reads the creator fees and makes the show.</p></details>
        <details><summary>Who writes the episodes?</summary><p>The viewers pick what happens by vote. A writer model turns it into a 7-scene script in the show's voice, and the clips, narration and captions are generated and edited automatically. The cast and the town stay the same every episode.</p></details>
        <details><summary>How do I vote?</summary><p>Type A, B or C in the pump.fun livestream chat, or tap an option on the Vote page. Each wallet gets one vote, and a new vote replaces the old one.</p></details>
        <details><summary>Where does an episode premiere?</summary><p>On the coin's pump.fun livestream, the moment it's rendered. It's also added to the Episodes page, where you can download it to post.</p></details>
        <details><summary>Can I launch my own town?</summary><p>Not yet. The launchpad opens to other coins after $${esc(c().ticker)}. Every town will get the same deal: no launch fee, fees pay for the episodes, viewers vote.</p></details>
      </section>
    </section>`;
  how.update = () => {};

  // ---------- Launch teaser (doesn't launch anything yet)
  function openLaunch() {
    const d = document.createElement("dialog");
    d.className = "launch";
    d.innerHTML = `<span class="soon">Opens after $${esc(c().ticker)}</span><h2>Launch a town</h2>
      <p class="muted">This is what launching will look like. Every coin on BloxTV gets its own narrator, its own town and its own 24/7 show, paid for by its trading fees.</p>
      <div class="form" aria-hidden="true">
        <label>Town name<input value="Emberfall" readonly></label>
        <label>What's strange about it<input value="The volcano hums a different song every night" readonly></label>
        <label>Who lives there<input value="Lizards who run the bakery and never blink" readonly></label>
      </div>
      <div class="row"><button class="btn btn-accent" disabled>Launch · not yet</button>${c().links?.x ? `<a class="btn" href="${esc(c().links.x)}" target="_blank" rel="noopener">Follow for the opening</a>` : ""}<button class="btn" data-act="close" type="button">Close</button></div>`;
    document.body.appendChild(d);
    const close = () => { d.close(); d.remove(); };
    $("[data-act=close]", d).onclick = close;
    d.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
    d.showModal();
  }
  document.addEventListener("click", (e) => { if (e.target.closest("[data-launch], #launch-btn")) openLaunch(); });

  // ---------- Header + data
  const setViewers = (n) => { $("#viewers").innerHTML = `<b>${n}</b><span class="vw"> watching</span>`; };
  function header() {
    $("#brand-name").textContent = c().name;
    const buy = $("#buy"); buy.textContent = `Buy $${c().ticker}`;
    if (c().pumpUrl) buy.href = c().pumpUrl; else buy.setAttribute("aria-disabled", "true");
    document.documentElement.style.setProperty("--c", c().color);
  }
  async function refresh() {
    const t0 = Date.now();
    S = await (await fetch("/api/state")).json();
    skew = S.now - (t0 + Date.now()) / 2;
    header(); setViewers(S.viewers); route();
  }
  let pending = null;
  const soon = () => { clearTimeout(pending); pending = setTimeout(refresh, 150); };
  function connect() {
    const es = new EventSource("/api/events");
    es.addEventListener("fees", soon);
    es.addEventListener("episode", soon);
    es.addEventListener("vote", (e) => { const p = JSON.parse(e.data); if (S && p && p.options && !p.closed) { S.poll = p; renderVote(p); } else soon(); });
    es.addEventListener("chat", (e) => { if (S) { S.chat = JSON.parse(e.data); renderVote(S.poll); } });
    es.addEventListener("viewers", (e) => { if (S) setViewers((S.viewers = JSON.parse(e.data).viewers)); });
    es.onopen = () => { $("#conn").hidden = true; refresh(); };
    es.onerror = () => { $("#conn").hidden = false; };
  }
  setInterval(() => {
    if (!S) return;
    stageDetails();
    document.querySelectorAll("#feed li[data-at] .when").forEach((el) => (el.textContent = ago(+el.parentElement.dataset.at)));
    const { stage } = current();
    if (stage === 3 && now() - ready()[0].readyAt >= 90_000) page?.update();
  }, 1000);

  refresh().then(connect).catch(() => { app.innerHTML = `<div class="empty"><h2>We couldn't load the town</h2><p>Check that the server is running, then refresh.</p></div>`; });
})();
