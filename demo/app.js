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

  let S = null, skew = 0, built = false, boardKey = null, hero = null, heroId = null, listSig = "";
  const wallet = (() => { try { let w = localStorage.getItem("imt-voter"); if (!w) { w = "v" + Math.random().toString(36).slice(2, 12); localStorage.setItem("imt-voter", w); } return w; } catch { return "v" + Math.random().toString(36).slice(2, 12); } })();
  const now = () => Date.now() + skew;

  // ---------- What is "the next episode" right now?
  function current() {
    const making = S.episodes.find((e) => e.id === S.producing);
    if (making) return { ep: making, number: making.number, stage: making.status === "writing" ? 1 : 2 };
    const latest = S.episodes.find((e) => e.status === "ready");
    if (latest && now() - latest.readyAt < 90_000) return { ep: latest, number: latest.number, stage: 3 };
    const number = S.episodes.filter((e) => e.status !== "failed").length + 1;
    return { ep: null, number, stage: 0 };
  }

  // ---------- Skeleton (built once)
  function build() {
    const c = S.coin;
    document.title = `${c.town} · $${c.ticker}`;
    $("#brand-name").textContent = c.name;
    const buy = $("#buy");
    buy.textContent = `Buy $${c.ticker}`;
    if (c.pumpUrl) buy.href = c.pumpUrl; else buy.setAttribute("aria-disabled", "true");
    document.documentElement.style.setProperty("--c", c.color);

    app.innerHTML = `
    <section class="hero" aria-labelledby="hero-h">
      <div class="wrap">
        <div>
          <span class="eyebrow"><span class="dot live" aria-hidden="true"></span> Live on pump.fun</span>
          <h1 id="hero-h">In my town, <em>every coin</em> gets its own show.</h1>
          <p class="lede">Every trade on <strong>$${esc(c.ticker)}</strong> pays a creator fee. The fees buy the next <strong>“In my town…”</strong> episode, you vote on what happens in it, and it premieres live on the pump.fun stream.</p>
          <div class="chips"><span>No launch fee</span><span>Fees pay for every episode</span><span>Viewers vote on the story</span><span class="hot">Premieres live on pump.fun</span></div>
          <div class="hero-cta">
            <a class="btn btn-accent btn-lg" id="board-cta" target="_blank" rel="noopener">Watch it live</a>
            <a class="btn btn-lg" href="#episodes">Watch the episodes</a>
          </div>
        </div>
        <figure class="hero-art">
          <span class="glow" aria-hidden="true"></span>
          <img src="brand/pfp.jpg" alt="Ollie, the narrator, peering out of an old red television with a siren on top, in a blocky night-time town">
          <figcaption><span class="dot live" aria-hidden="true"></span><span id="hero-cap">Episode fund filling</span></figcaption>
        </figure>
      </div>
    </section>

    <div class="wrap">
    <section class="board" id="live" aria-labelledby="board-title">
      <div class="board-head">
        <div>
          <span class="eyebrow"><span class="dot live" aria-hidden="true"></span> Next episode, live</span>
          <h2 id="board-title"></h2>
          <p id="board-sub"></p>
        </div>
        <span class="pill"><b id="viewers-2">0</b>&nbsp;watching</span>
      </div>

      <ol class="stages" id="stages" aria-label="Production stages">
        ${["Funding", "Writing", "Rendering", "Premiere"].map((n, i) => `<li data-i="${i}"><span class="stage-n" aria-hidden="true">${i + 1}</span><div><strong>${n}</strong><span class="stage-detail"></span></div></li>`).join("")}
      </ol>

      <div class="board-grid">
        <section class="panel fund" aria-labelledby="fund-h">
          <div class="panel-head"><h3 id="fund-h">Episode fund</h3><span class="muted small" id="fund-since"></span></div>
          <p class="counter" aria-live="off"><span id="counter">0.000</span><span class="counter-of" id="counter-of"></span></p>
          <div class="meter big" role="progressbar" aria-label="Episode fund" aria-valuemin="0" aria-valuemax="100" id="fund-meter"><span id="fund-bar"></span></div>
          <dl class="kpis">
            <div><dt>Still needed</dt><dd id="k-need">–</dd></div>
            <div><dt>Pace, last hour</dt><dd id="k-rate">–</dd></div>
            <div><dt>Funded in</dt><dd id="k-eta">–</dd></div>
          </dl>
          ${S.devTools ? `<form class="dev" id="dev"><label for="dev-sol">Add test fees (demo)</label><div class="row"><input id="dev-sol" inputmode="decimal" value="0.05"><button class="btn">Add fees</button></div></form>` : ""}
          <h4 class="feed-h">Fees coming in</h4>
          <ul class="feed" id="feed" aria-live="polite" aria-relevant="additions"></ul>
        </section>

        <section class="panel votes" id="vote" aria-labelledby="vote-h">
          <div class="panel-head"><h3 id="vote-h">Vote on the next episode</h3><span class="muted small" id="vote-src"></span></div>
          <p class="muted small" id="vote-q"></p>
          <div class="vote-opts" id="vote-opts" role="group" aria-label="Vote options"></div>
          <p class="muted small" id="vote-foot"></p>
          <ul class="feed vote-feed" id="vote-feed" aria-live="polite"></ul>
        </section>
      </div>

      <section class="panel room" style="margin-top:16px" aria-labelledby="room-h">
        <div class="panel-head"><h3 id="room-h">Writers' room</h3><span class="muted small" id="room-status"></span></div>
        <ol class="script-live" id="script" aria-live="polite"></ol>
        <div class="render" id="render" hidden>
          <div class="panel-head"><strong>Rendering</strong><span class="muted small" id="render-pct"></span></div>
          <div class="meter" role="progressbar" aria-label="Render progress" aria-valuemin="0" aria-valuemax="100"><span id="render-bar"></span></div>
        </div>
        <h4 class="feed-h">Storyboard</h4>
        <div class="frames" id="frames"></div>
      </section>
    </section>

    <dl class="stats" aria-label="Totals">
      <div><dt>Towns</dt><dd id="s-towns">1</dd><small>Live on In My Town</small></div>
      <div><dt>Episodes made</dt><dd id="s-episodes">0</dd><small>Paid for by fees</small></div>
      <div><dt>Fees spent on video</dt><dd id="s-spent">0</dd><small>SOL, all from trading</small></div>
      <div><dt>Votes cast</dt><dd id="s-votes">0</dd><small>pump.fun chat and here</small></div>
      <div class="hot"><dt>Launch fee</dt><dd>0</dd><small>You only pay pump.fun's costs</small></div>
    </dl>

    <section class="section card" id="towns" aria-labelledby="towns-h">
      <div class="section-head"><h2 id="towns-h">Towns on In My Town</h2><span class="muted small">Every town is a coin with its own show</span></div>
      <ul class="towns">
        <li><a class="town-row" href="#live">
          <img src="brand/pfp-512.jpg" alt="">
          <div><div class="t-name">${esc(c.town)} <span class="muted">· $${esc(c.ticker)}</span></div><div class="t-meta">“In my town, ${esc(lower(c.facts.weird))}.”</div></div>
          <div class="t-right"><b id="t-eps">0 episodes</b><span id="t-fund">fund 0%</span></div>
        </a></li>
      </ul>
      <div class="empty small" style="margin-top:12px"><h3>Your town could be next</h3><p>Launching other towns opens after $${esc(c.ticker)}. Same rules: fees pay for the episodes, viewers vote on the story.</p><a class="btn" aria-disabled="true">Launch a town · soon</a></div>
    </section>

    <section class="section card" aria-labelledby="split-h">
      <span class="eyebrow">Creator fees</span>
      <h2 id="split-h" style="margin-top:10px">Every trade feeds the show.</h2>
      <p class="muted" style="max-width:60ch">pump.fun pays creator fees on every trade of $${esc(c.ticker)}. On In My Town those fees are split the moment they land.</p>
      <div class="split" aria-hidden="true"><div class="s1"><b>60%</b>Episode fund</div><div class="s2"><b>20%</b>Creator</div><div class="s3"><b>20%</b>Platform</div></div>
      <div class="split-notes">
        <div><b>60% makes episodes.</b> Each time the fund reaches ${sol(S.fund.cost)}, the next episode is written, rendered and premiered on stream.</div>
        <div><b>20% to the creator.</b> Paid out the same way as any pump.fun coin.</div>
        <div><b>20% runs the platform.</b> Hosting, the stream, and the video credits that make the show.</div>
      </div>
    </section>

    <section class="section card latest" id="episodes" aria-labelledby="latest-h">
      <div class="latest-grid">
        <div class="phone" id="hero-phone"></div>
        <div>
          <div class="section-head"><h2 id="latest-h">Episodes</h2><p class="muted small" id="ep-summary" style="margin:0"></p></div>
          <div class="reel-grid" id="episodes-grid"></div>
        </div>
      </div>
    </section>

    <div class="cols section">
      <section class="card">
        <h2>The town of ${esc(c.town)}</h2>
        <dl class="facts" style="margin:0;display:grid;gap:12px">
          <div><dt class="muted small">What's strange about it</dt><dd style="margin:0;font-weight:500">${esc(c.facts.weird)}</dd></div>
          <div><dt class="muted small">Who lives there</dt><dd style="margin:0;font-weight:500">${esc(c.facts.who)}</dd></div>
          <div><dt class="muted small">What happens at night</dt><dd style="margin:0;font-weight:500">${esc(c.facts.night)}</dd></div>
        </dl>
      </section>
      <section class="card" id="how">
        <h2>How it works</h2>
        <ol class="steps">
          <li><b>Trade $${esc(c.ticker)} on pump.fun.</b> Every trade pays a creator fee, and 60% of it goes into the episode fund.</li>
          <li><b>Vote while it fills.</b> Type A, B or C in the pump.fun chat, or vote here. One vote per wallet.</li>
          <li><b>At ${sol(S.fund.cost)} the episode gets made.</b> The winning vote becomes the story. The script is written live, scene by scene, then rendered.</li>
          <li><b>It premieres on the stream.</b> Then the next fund opens and the next vote starts.</li>
        </ol>
        ${c.mint ? `<p class="muted small" style="margin:12px 0 0">Contract <code>${esc(c.mint)}</code></p>` : ""}
      </section>
    </div>

    <section class="section card faq" aria-labelledby="faq-h">
      <h2 id="faq-h">Questions</h2>
      <details><summary>Is it still a pump.fun coin?</summary><p>Yes. $${esc(c.ticker)} is a normal pump.fun coin with the normal bonding curve and trading. In My Town only reads the creator fees and makes the show.</p></details>
      <details><summary>Who writes the episodes?</summary><p>The viewers pick the premise by vote. A writer model turns it into a 7-scene script in the show's voice, and the clips, narration and captions are generated and edited automatically. The cast and the town stay the same every episode.</p></details>
      <details><summary>How do I vote?</summary><p>Type A, B or C in the pump.fun livestream chat, or tap an option on this page. Each wallet gets one vote, and a new vote replaces the old one.</p></details>
      <details><summary>Where does an episode premiere?</summary><p>On the coin's pump.fun livestream, the moment it's rendered. It's also added here, where you can download it to post.</p></details>
      <details><summary>Can I launch my own town?</summary><p>Not yet. The launchpad opens to other coins after $${esc(c.ticker)}. Every town will get the same deal: no launch fee, fees pay for the episodes, viewers vote.</p></details>
    </section>
    </div>`;

    const dev = $("#dev");
    if (dev) dev.onsubmit = async (e) => {
      e.preventDefault();
      const r = await fetch("/api/dev/fees", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sol: $("#dev-sol").value }) });
      if (!r.ok) toast((await r.json()).error);
    };
    built = true;
  }

  // ---------- Live updates (targeted, so typing and animations don't restart)
  function update() {
    if (!built) build();
    const { ep, number, stage } = current();
    const f = S.fund;
    setViewers(S.viewers);

    // Header
    const title = ["is being funded", "is being written", "is rendering", "just premiered"][stage];
    $("#board-title").textContent = `Episode ${number} ${title}`;
    $("#board-sub").textContent = [
      `Every trade adds to the fund. At ${sol(f.cost)} the script starts writing, right here.`,
      `Funded. ${ep?.premise ? `You voted: "${ep.premise}". ` : ""}Scene ${(ep?.scenes.length || 0) + 1} is being written now.`,
      `The script is locked. Rendering the reel now.`,
      `It's playing on the pump.fun livestream right now.`,
    ][stage];
    const cta = $("#board-cta");
    cta.textContent = stage === 3 ? "Watch the premiere" : stage === 0 ? `Buy $${S.coin.ticker} on pump.fun` : "Watch it live";
    if (S.coin.pumpUrl) cta.href = S.coin.pumpUrl; else { cta.removeAttribute("href"); cta.setAttribute("aria-disabled", "true"); }

    // Stage tracker
    document.querySelectorAll("#stages li").forEach((li, i) => {
      li.className = i < stage ? "done" : i === stage ? "active" : "";
      li.toggleAttribute("aria-current", i === stage);
    });
    stageDetails();

    // Fund
    const bal = stage === 0 ? f.balance : f.cost; // once bought, this round is full
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
    $("#fund-since").textContent = stage > 0
      ? (f.balance > 0 ? `${sol(f.balance)} already in for episode ${number + 1}` : `Episode ${number + 1} fund opens next`)
      : trades ? `${trades} trade${trades === 1 ? "" : "s"} this round` : "";
    renderFeed();

    // Writers' room
    const key = ep ? ep.id : "funding-" + number;
    if (key !== boardKey) { boardKey = key; $("#script").innerHTML = ""; $("#frames").innerHTML = ""; typed = 0; queue.length = 0; frames = 0; instantUpTo = ep ? ep.scenes.length : 0; }
    if (!ep) {
      const prev = S.episodes.find((e) => e.status === "ready");
      $("#script").innerHTML = `<li class="note">Writing starts the moment the fund is full.${prev ? ` It picks up after “${esc(prev.title)}”.` : " It's the pilot."}</li>`;
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
        ReelPlayer.still(box, { ...ep, coin: { ...S.coin } }, frames);
        box.insertAdjacentHTML("beforeend", `<span>Scene ${frames + 1}</span>`);
        $("#frames").appendChild(box);
      }
      $("#frames .writing")?.remove();
      if (ep.status === "writing") $("#frames").insertAdjacentHTML("beforeend", `<div class="frame writing"><span><span class="dot live" aria-hidden="true"></span> Scene ${ep.scenes.length + 1}</span></div>`);
      $("#room-status").textContent = ep.status === "writing" ? `${ep.scenes.length} scene${ep.scenes.length === 1 ? "" : "s"} written` : `${ep.scenes.length} scenes · ${ep.scriptSource === "claude" ? "written by Claude" : "template script"}`;
      $("#render").hidden = ep.status !== "rendering";
      if (ep.status === "rendering") {
        const rp = ep.renderProgress || 0;
        $("#render-bar").style.width = (rp * 100).toFixed(1) + "%";
        $("#render-pct").textContent = rp ? Math.round(rp * 100) + "%" : "Starting";
      }
    }

    renderEpisodes();
    renderVote(S.poll);
    const readyN = S.episodes.filter((e) => e.status === "ready").length;
    const votes = (S.poll?.voters || 0) + (S.lastPoll?.voters || 0);
    $("#s-episodes").textContent = readyN;
    $("#s-spent").textContent = f.spent.toFixed(2);
    $("#s-votes").textContent = votes;
    $("#t-eps").textContent = `${readyN} episode${readyN === 1 ? "" : "s"}`;
    $("#t-fund").textContent = stage > 0 ? "making episode " + number : `fund ${Math.round(f.progress * 100)}%`;
    $("#hero-cap").textContent = ["Episode fund filling", "Writing the script now", "Rendering the episode", "Premiering now"][stage];
  }

  let myVote = null; try { myVote = JSON.parse(localStorage.getItem("imt-vote") || "null"); } catch {}
  function renderVote(poll) {
    const box = $("#vote-opts"); if (!box) return;
    if (!poll) { box.innerHTML = ""; $("#vote-q").textContent = "Voting opens when the next round of funding starts."; $("#vote-foot").textContent = ""; return; }
    const t = poll.tally, max = Math.max(1, ...Object.values(t.counts));
    const mine = myVote && myVote.pollId === poll.id ? myVote.key : null;
    $("#vote-q").textContent = poll.question;
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
    feed.innerHTML = (poll.recent || []).slice(0, 5).map((v) => `<li><span class="plus">${esc(v.key)}</span><span>${esc(v.name)}</span><span class="muted">${v.source === "chat" ? "pump.fun chat" : "website"}</span><span class="when muted">${ago(v.at)}</span></li>`).join("");
  }

  function stageDetails() {
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

  // Fees per hour over the current round (max one hour)
  function pace() {
    const t = now(), since = Math.max(S.fund.since || 0, t - 3600_000);
    const recent = S.feeLog.filter((l) => l.at >= since);
    if (!recent.length) return { rate: 0, trades: 0 };
    const start = Math.min(since === t - 3600_000 ? since : recent.at(-1).at, t - 60_000);
    const sum = recent.reduce((a, l) => a + l.sol, 0);
    return { rate: (sum / (t - start)) * 3600_000, trades: recent.reduce((a, l) => a + (l.txCount || 1), 0) };
  }

  let shownFees = new Set();
  function renderFeed() {
    const ul = $("#feed");
    if (!S.feeLog.length) { ul.innerHTML = `<li class="note">No fees yet. They show up here the moment a trade lands.</li>`; return; }
    ul.querySelector(".note")?.remove();
    const items = S.feeLog.slice(0, 12);
    for (const l of [...items].reverse()) {
      const k = l.at + ":" + l.sol;
      if (shownFees.has(k)) continue;
      shownFees.add(k);
      const li = document.createElement("li");
      li.className = built && shownFees.size > items.length ? "new" : "";
      li.dataset.at = l.at;
      li.innerHTML = `<span class="plus">+${sol(l.sol, 4)}</span><span class="src">${l.txCount ? `${l.txCount} trade${l.txCount === 1 ? "" : "s"}` : esc(l.source)}</span>
        <span class="when muted">${ago(l.at)}</span>${l.sig ? `<a class="tx" href="https://solscan.io/tx/${esc(l.sig)}" target="_blank" rel="noopener">View tx</a>` : `<span></span>`}`;
      ul.prepend(li);
    }
    while (ul.children.length > 12) ul.lastChild.remove();
  }

  // Typewriter for script lines
  let typed = 0, typing = false, frames = 0, instantUpTo = 0; // lines already written when you arrived show at once
  const queue = [];
  function pump() {
    if (typing || !queue.length) return;
    typing = true;
    const line = queue.shift();
    const li = document.createElement("li");
    $("#script").appendChild(li);
    if (reduced || typed < instantUpTo) { li.textContent = line; typed++; typing = false; return pump(); }
    li.classList.add("typing");
    let i = 0;
    const step = () => {
      li.textContent = line.slice(0, ++i);
      if (i < line.length) setTimeout(step, 22);
      else { li.classList.remove("typing"); typed++; typing = false; pump(); }
    };
    step();
  }

  let shown = null, tweenRaf = 0;
  function tweenCounter(to) {
    const el = $("#counter");
    if (shown === null || reduced) { shown = to; el.textContent = to.toFixed(3); return; }
    const from = shown, t0 = performance.now();
    cancelAnimationFrame(tweenRaf);
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 700), v = from + (to - from) * (1 - Math.pow(1 - k, 3));
      el.textContent = v.toFixed(3);
      if (k < 1) tweenRaf = requestAnimationFrame(step); else shown = to;
    };
    if (to !== from) { el.parentElement.classList.remove("bump"); void el.offsetWidth; el.parentElement.classList.add("bump"); }
    tweenRaf = requestAnimationFrame(step);
  }

  function renderEpisodes() {
    const ready = S.episodes.filter((e) => e.status === "ready");
    const sig = ready.map((e) => e.id).join();
    if (sig === listSig) return;
    listSig = sig;
    $("#ep-summary").textContent = ready.length ? `${ready.length} made · ${sol(S.fund.spent)} of creator fees spent on video` : "No episodes yet. The pilot is being funded above.";
    $("#episodes-grid").innerHTML = ready.map((e) => `
      <button class="reel-tile" data-ep="${e.id}">
        <span class="ep-num">Ep ${e.number}</span>
        <span class="ep-line">“${esc(e.scenes[0]?.line)}”</span>
        <span class="ep-when">${ago(e.readyAt || e.createdAt)}</span>
        <span class="ep-play" aria-hidden="true">▶</span><span class="sr-only">Play ${esc(e.title)}</span>
      </button>`).join("");
    document.querySelectorAll("[data-ep]").forEach((b) => b.onclick = () => openPlayer(S.episodes.find((e) => e.id === b.dataset.ep)));
    const latest = ready[0];
    if (latest && heroId !== latest.id) {
      hero?.destroy();
      $("#hero-phone").innerHTML = "";
      hero = ReelPlayer.for($("#hero-phone"), { ...latest, coin: S.coin }, { onEnd: () => hero.play() });
      heroId = latest.id; hero.play();
    } else if (!latest) $("#hero-phone").innerHTML = `<div class="phone-empty">The pilot premieres here</div>`;
  }

  function openPlayer(ep) {
    hero?.pause();
    const d = document.createElement("dialog");
    d.className = "player";
    d.setAttribute("aria-label", ep.title);
    d.innerHTML = `<div class="player-stage"></div>
      <div class="player-bar">
        <button class="btn" data-act="play">Pause</button>
        <button class="btn" data-act="voice" aria-pressed="false">Voice off</button>
        <button class="btn" data-act="rec">Download video</button>
        <button class="btn" data-act="close">Close</button>
      </div>
      <details class="script"><summary>Script and shot list</summary><ol>${ep.scenes.map((s) => `<li><strong>${esc(s.line)}</strong><br><span class="muted">${esc(s.setting)}. ${esc(s.action)}. ${esc(s.mood)}.</span></li>`).join("")}</ol>
      ${ep.clips?.length ? `<p class="small">Clips: ${ep.clips.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">Scene ${i + 1}</a>`).join(" · ")}</p>` : ""}
      <p class="muted small">Paid for with ${sol(ep.costSol)} of creator fees.${ep.writtenAt ? ` Written in ${clock(ep.writtenAt - ep.createdAt)}.` : ""}</p></details>`;
    document.body.appendChild(d);
    const playBtn = $("[data-act=play]", d);
    let p;
    if (ep.videoUrl) {
      $(".player-stage", d).innerHTML = `<video src="${esc(ep.videoUrl)}" controls autoplay playsinline class="reel-canvas"></video>`;
      d.querySelectorAll("[data-act=play],[data-act=voice],[data-act=rec]").forEach((b) => b.remove());
    } else {
      if (ep.clips?.length) $("[data-act=rec]", d).remove();
      p = ReelPlayer.for($(".player-stage", d), { ...ep, coin: S.coin }, { onState: (on) => (playBtn.textContent = on ? "Pause" : "Play"), onEnd: () => (playBtn.textContent = "Replay") });
      $(".player-stage", d).onclick = () => p.toggle();
      playBtn.onclick = () => p.toggle();
      $("[data-act=voice]", d).onclick = (e) => { p.voice = !p.voice; e.target.textContent = p.voice ? "Voice on" : "Voice off"; e.target.setAttribute("aria-pressed", p.voice); if (!p.voice) speechSynthesis?.cancel(); };
      $("[data-act=rec]", d).onclick = async (e) => {
        const b = e.target; b.disabled = true;
        try {
          const blob = await p.record((fr) => (b.textContent = `Recording ${Math.round(fr * 100)}%`));
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob); a.download = `in-my-town-ep${ep.number}.webm`; a.click();
          toast("Video saved. It has no sound yet, so add a voiceover before you post it.");
        } catch (err) { toast(err.message); }
        b.disabled = false; b.textContent = "Download video";
      };
      p.play();
    }
    const close = () => { p?.destroy(); d.close(); d.remove(); hero?.play(); };
    $("[data-act=close]", d).onclick = close;
    d.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
    d.showModal();
  }

  const setViewers = (n) => { $("#viewers").innerHTML = `<b>${n}</b><span class="vw"> watching</span>`; const v2 = $("#viewers-2"); if (v2) v2.textContent = n; };

  // ---------- Data
  async function refresh() {
    const t0 = Date.now();
    S = await (await fetch("/api/state")).json();
    skew = S.now - (t0 + Date.now()) / 2;
    update();
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
    if (stage === 3 && now() - S.episodes.find((e) => e.status === "ready").readyAt >= 90_000) update();
  }, 1000);

  refresh().then(connect).catch(() => { app.innerHTML = `<div class="empty"><h2>We couldn't load the town</h2><p>Check that the server is running, then refresh.</p></div>`; });
})();
