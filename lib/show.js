// The show: one coin, one running story. Fees fill the fund; a full fund buys the next episode.
import { COIN } from "./config.js";
import { getDb, save, uid } from "./store.js";
import { writeScript } from "./script.js";
import { renderEpisode } from "./video.js";
import { ensurePoll, currentPoll, closePoll, castVote, parseVote, pollView } from "./votes.js";

const listeners = new Set();
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = (type, data) => listeners.forEach((fn) => fn(type, data));

let viewers = 0;
let chatStatus = { state: "off", viewers: null };
export function setChatStatus(state, extra) {
  if (state === "viewers") chatStatus.viewers = Number(extra);
  else chatStatus.state = state;
  emit("chat", chatStatus);
}

// A chat message from the pump.fun livestream: count it as a vote if it names an option.
export function onChatMessage(m) {
  const poll = currentPoll(); if (!poll) return;
  const key = parseVote(m.text, poll); if (!key) return;
  const r = castVote("wallet:" + m.wallet, key, { source: "chat", name: m.username });
  if (r) emit("vote", { ...pollView(r.poll), last: r.poll.recent[0] });
}
export function siteVote(browserId, key) {
  const r = castVote("site:" + browserId, key, { source: "site", name: "viewer" });
  if (r) emit("vote", { ...pollView(r.poll), last: r.poll.recent[0] });
  return r && pollView(r.poll);
}
export function setViewers(n) { viewers = n; emit("viewers", { viewers }); }

export function state() {
  const db = getDb();
  const ready = db.episodes.filter((e) => e.status === "ready");
  return {
    coin: { name: COIN.name, ticker: COIN.ticker, town: COIN.town, color: COIN.color, facts: COIN.facts, mint: COIN.mint, pumpUrl: COIN.pumpUrl, links: COIN.links, id: COIN.id, seasonLength: COIN.seasonLength, trailer: COIN.trailer },
    fund: { ...db.fund, cost: COIN.episodeCostSol, progress: Math.min(1, db.fund.balance / COIN.episodeCostSol),
      // When the current round of funding started: the last time an episode was bought.
      since: db.episodes.find((e) => e.status !== "failed")?.createdAt || db.feeLog.at(-1)?.at || null },
    episodes: db.episodes.map((e) => ({ ...e, season: Math.ceil(e.number / COIN.seasonLength), coin: { id: COIN.id, town: COIN.town, ticker: COIN.ticker, color: COIN.color } })),
    latest: ready[0]?.id || null,
    producing: db.episodes.find((e) => e.status === "writing" || e.status === "rendering")?.id || null,
    feeLog: db.feeLog.slice(0, 40),
    poll: pollView(currentPoll()),
    lastPoll: pollView((db.polls || []).find((p) => p.status === "closed")),
    chat: chatStatus,
    viewers,
    now: Date.now(),
  };
}

export function addFees(sol, meta = {}) {
  if (typeof meta === "string") meta = { source: meta };
  const db = getDb();
  db.fund.balance += sol; db.fund.totalIn += sol;
  db.feeLog.unshift({ sol, source: meta.source || "creator fees", txCount: meta.txCount ?? null, sig: meta.sig ?? null, at: Date.now() });
  db.feeLog.length = Math.min(db.feeLog.length, 200);
  save();
  emit("fees", db.feeLog[0]);
  maybeProduce();
}

export function maybeProduce() {
  const db = getDb();
  if (db.episodes.some((e) => e.status === "writing" || e.status === "rendering")) return null;
  if (db.fund.balance < COIN.episodeCostSol) return null;
  db.fund.balance -= COIN.episodeCostSol; db.fund.spent += COIN.episodeCostSol;
  const number = db.episodes.filter((e) => e.status !== "failed").length + 1;
  const ep = { id: uid("ep"), number, status: "writing", costSol: COIN.episodeCostSol, createdAt: Date.now(), title: null, scenes: [], videoUrl: null };
  const decided = closePoll(ep.id);
  if (decided) { ep.premise = decided.premise; ep.pollId = decided.poll.id; ep.decidedBy = decided.poll.decidedBy; }
  db.episodes.unshift(ep);
  save(); emit("episode", ep); emit("vote", { ...pollView(decided?.poll), closed: true });
  // The next vote opens once this episode's cliffhanger is written (see produce).
  produce(ep).catch((err) => {
    console.error("[episode]", ep.id, "failed:", err.message, ep.test ? "(test episode dropped)" : "(fees refunded, retried on the next trade)");
    db.episodes.splice(db.episodes.indexOf(ep), 1);
    db.fund.spent -= ep.costSol;
    if (!ep.test) db.fund.balance += ep.costSol; // refund, try again later; a test's pretend fees are dropped
    save(); emit("episode", ep);
    if (ensurePoll()) emit("vote", pollView(currentPoll()));
  });
  return ep;
}

// Admin: remove episodes that aren't real AI renders (preview reels, failed renders) and restart the story.
// Real episodes are renumbered so the story stays continuous; the open vote is reset to match.
export function clearPreviewEpisodes() {
  const db = getDb();
  if (db.episodes.some((e) => e.status === "writing" || e.status === "rendering")) return { error: "An episode is being made right now. Wait for it to finish." };
  const removed = db.episodes.filter((e) => !e.videoUrl || e.renderError);
  db.episodes = db.episodes.filter((e) => !removed.includes(e));
  db.episodes.slice().reverse().forEach((e, i) => { e.number = i + 1; });
  db.polls = (db.polls || []).filter((p) => p.status !== "open");
  save();
  ensurePoll();
  emit("episode", { cleared: true }); emit("vote", pollView(currentPoll()));
  return { ok: true, removed: removed.map((e) => `${e.number}: ${e.title}`), remaining: db.episodes.length };
}

// Admin: wipe everything (episodes, votes, fee log, fund) for a clean launch. Episode files are
// removed too, except a stream self-test recording.
export function resetShow() {
  const db = getDb();
  if (db.episodes.some((e) => e.status === "writing" || e.status === "rendering")) return { error: "An episode is being made right now. Wait for it to finish." };
  const n = db.episodes.length;
  db.episodes = []; db.polls = []; db.feeLog = [];
  db.fund = { balance: 0, totalIn: 0, spent: 0 };
  save();
  ensurePoll();
  emit("episode", { reset: true }); emit("vote", pollView(currentPoll()));
  return { ok: true, removedEpisodes: n };
}

// Test episodes: an admin can fund one episode and cap its length (see /api/admin/test-episode).
let nextMaxScenes = null;
export function startTestEpisode(maxScenes) {
  const db = getDb();
  if (db.episodes.some((e) => e.status === "writing" || e.status === "rendering")) return { error: "An episode is already being made." };
  nextMaxScenes = Math.max(2, Math.min(8, Number(maxScenes) || 4));
  const need = Math.max(0, COIN.episodeCostSol - db.fund.balance);
  addFees(need || 0.000001, { source: "test episode" });
  return { ok: true, scenes: nextMaxScenes };
}

async function produce(ep) {
  const done = getDb().episodes.filter((e) => e.status === "ready");
  const previous = done.map((e) => e.title).reverse();
  const script = await writeScript({ ...COIN }, ep.number, previous, ep.premise || null, done[0]?.cliffhanger || null);
  if (nextMaxScenes && script.scenes.length > nextMaxScenes) {
    // Keep the hook and the ending, drop from the middle.
    script.scenes = [...script.scenes.slice(0, nextMaxScenes - 1), script.scenes[script.scenes.length - 1]];
    ep.test = true;
  }
  nextMaxScenes = null;
  // Reveal the script on stream one line at a time, like it's being written live.
  ep.scriptSource = script.source; ep.title = script.title;
  for (const s of script.scenes) {
    ep.scenes.push(s); save(); emit("episode", ep);
    await new Promise((r) => setTimeout(r, Number(process.env.SCRIPT_REVEAL_MS ?? 2500)));
  }
  ep.writtenAt = Date.now();
  // The last line is the cliffhanger; its 3 follow-ups become the vote for the next episode,
  // open while this one renders and premieres.
  ep.cliffhanger = script.scenes.at(-1)?.line || null;
  ep.nextOptions = script.nextOptions || null;
  save(); emit("episode", ep);
  if (ensurePoll()) emit("vote", pollView(currentPoll()));
  ep.status = "rendering"; ep.renderingAt = Date.now(); ep.renderProgress = 0; save(); emit("episode", ep);
  const r = await renderEpisode({ ...COIN }, ep, (pct, note) => renderProgress(ep, pct, note));
  Object.assign(ep, r, r.status === "ready" ? { readyAt: Date.now() } : {});
  save(); emit("episode", ep);
  if (ep.status === "ready") maybeProduce();
}

export function renderProgress(ep, pct, note) {
  ep.renderProgress = Math.max(0, Math.min(1, pct)); if (note) ep.renderNote = note; save(); emit("episode", ep);
}

export function completeEpisode(ep, videoUrl) {
  Object.assign(ep, { status: "ready", videoUrl, readyAt: Date.now() });
  save(); emit("episode", ep); maybeProduce();
}
