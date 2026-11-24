// The show: one coin, one running story. Fees fill the fund; a full fund buys the next episode.
import { COIN } from "./config.js";
import { getDb, save, uid } from "./store.js";
import { writeScript } from "./script.js";
import { renderEpisode } from "./video.js";
import { assembleEpisode, episodesDir } from "./assemble.js";
import fs from "node:fs";
import path from "node:path";
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
    release: db.release ? { nextAt: db.release.nextAt, everyMs: db.release.everyMs, left: db.episodes.filter((e) => e.status === "scheduled").length } : null,
    episodes: db.episodes.filter((e) => e.status !== "scheduled").map((e) => ({ ...publicEpisode(e), season: Math.ceil(e.number / COIN.seasonLength), coin: { id: COIN.id, town: COIN.town, ticker: COIN.ticker, color: COIN.color } })),
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

// What the public API shows of an episode: no raw asset URLs once the finished file exists.
function publicEpisode(e) {
  const { narration, keyframes, votedPremise, ...rest } = e;
  if (rest.videoUrl) delete rest.clips;
  return rest;
}

// Spending guards for episodes the server makes by itself. A failure backs off (5 min, 10, 20 … up
// to 6 h) instead of retrying on every trade, and there is a cap per 24 hours.
function productionBlocked(db) {
  const g = (db.guard ??= { failures: 0, pausedUntil: 0 });
  if (Date.now() < g.pausedUntil) return `paused after a failure until ${new Date(g.pausedUntil).toISOString()}`;
  const dayAgo = Date.now() - 24 * 3600_000;
  const made = db.episodes.filter((e) => !e.imported && !e.test && e.createdAt > dayAgo).length;
  if (made >= COIN.maxEpisodesPerDay) return `daily cap of ${COIN.maxEpisodesPerDay} episodes reached`;
  return null;
}
let lastBlockLog = "";

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
  if (db.episodes.some((e) => e.status === "scheduled")) return null; // pre-made episodes go out first
  if (db.fund.balance < COIN.episodeCostSol) return null;
  if (!nextMaxScenes) { // test episodes are started by hand and skip the guards
    const why = productionBlocked(db);
    if (why) { if (why !== lastBlockLog) console.log("[episode] fund is full but not starting:", why); lastBlockLog = why; return null; }
  }
  lastBlockLog = "";
  db.fund.balance -= COIN.episodeCostSol; db.fund.spent += COIN.episodeCostSol;
  const number = db.episodes.filter((e) => e.status !== "failed").length + 1;
  const ep = { id: uid("ep"), number, status: "writing", costSol: COIN.episodeCostSol, createdAt: Date.now(), title: null, scenes: [], videoUrl: null };
  const decided = closePoll(ep.id);
  if (decided) { ep.premise = decided.premise; ep.pollId = decided.poll.id; ep.decidedBy = decided.poll.decidedBy; }
  db.episodes.unshift(ep);
  save(); emit("episode", ep); emit("vote", { ...pollView(decided?.poll), closed: true });
  // The next vote opens once this episode's cliffhanger is written (see produce).
  produce(ep).catch((err) => {
    const g = (db.guard ??= { failures: 0, pausedUntil: 0 });
    g.failures += 1;
    const waitMin = Math.min(360, 5 * 2 ** (g.failures - 1));
    g.pausedUntil = Date.now() + waitMin * 60_000;
    console.error("[episode]", ep.id, "failed:", err.message, ep.test ? "(test episode dropped)" : `(fees refunded; next try in ${waitMin} min, failure ${g.failures} in a row)`);
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

// Admin: import an episode whose clips were generated elsewhere. The server adds narration, captions
// and music, publishes it as the next episode, closes any open vote and opens the next one.
export async function importEpisode({ title, scenes, clips, keyframes = [], narration = null, cliffhanger = null, nextOptions = null, premise = null, videoFile = null, schedule = false }) {
  const db = getDb();
  if (db.episodes.some((e) => e.status === "writing" || e.status === "rendering")) return { error: "An episode is already being made." };
  if (!Array.isArray(scenes) || !scenes.length) return { error: "scenes must be a non-empty array." };
  if (!videoFile && (!Array.isArray(clips) || clips.length !== scenes.length)) return { error: "scenes and clips must be arrays of the same length (or give a finished videoFile)." };
  const number = db.episodes.filter((e) => e.status !== "failed").length + 1;
  const ep = { id: uid("ep"), number, status: "rendering", costSol: 0, createdAt: Date.now(), writtenAt: Date.now(), renderingAt: Date.now(), renderProgress: 0.7,
    title: title || `${COIN.town} — chapter ${number}`, scenes, premise, scriptSource: "imported", imported: true, keyframes, clips, narration: narration?.length === scenes.length ? narration : undefined, videoUrl: null,
    cliffhanger: cliffhanger || scenes.at(-1)?.line || null, nextOptions: nextOptions?.length === 3 ? nextOptions : null };
  if (!schedule) {
    const decided = closePoll(ep.id);
    if (decided) { ep.premise ??= decided.premise; ep.pollId = decided.poll.id; ep.decidedBy = decided.poll.decidedBy; }
  }
  db.episodes.unshift(ep); save(); if (!schedule) emit("episode", ep);
  try {
    const finished = videoFile && path.resolve(videoFile);
    if (finished && finished.startsWith(path.resolve("episodes") + path.sep) && fs.existsSync(finished)) {
      // Already assembled elsewhere (voice, captions, music in it): just publish the file.
      const dir = path.join(episodesDir(), ep.id);
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(finished, path.join(dir, "episode.mp4"));
      ep.videoUrl = `/episodes/${ep.id}.mp4`;
    } else {
      ep.videoUrl = await assembleEpisode(ep, clips, (p) => renderProgress(ep, 0.7 + p * 0.3, "adding the narration, captions and music"));
    }
    if (schedule) { ep.status = "scheduled"; save(); return { ok: true, id: ep.id, number, scheduled: true }; }
    ep.status = "ready"; ep.readyAt = Date.now(); save(); emit("episode", ep);
    if (ensurePoll()) emit("vote", pollView(currentPoll()));
    return { ok: true, id: ep.id, number, videoUrl: ep.videoUrl };
  } catch (err) {
    db.episodes.splice(db.episodes.indexOf(ep), 1); save(); emit("episode", ep);
    return { error: "Assembly failed: " + err.message };
  }
}

// ---- Scheduled releases --------------------------------------------------------
// Pre-made episodes can wait hidden ("scheduled") and go out one at a time on a clock.
const scheduled = () => getDb().episodes.filter((e) => e.status === "scheduled").sort((a, b) => a.number - b.number);

// Put released episodes from number `from` onward back into the queue (hidden again).
export function holdFrom(from) {
  const db = getDb();
  const moved = db.episodes.filter((e) => e.status === "ready" && e.number >= from);
  for (const e of moved) { e.status = "scheduled"; delete e.readyAt; }
  // The open vote belongs to an episode that is now hidden: drop it and reopen from the latest released one.
  db.polls = (db.polls || []).filter((p) => p.status !== "open");
  save(); ensurePoll();
  emit("episode", { held: true }); emit("vote", pollView(currentPoll()));
  return { ok: true, held: moved.map((e) => e.number).sort((a, b) => a - b), queued: scheduled().length };
}

// Release the next scheduled episode now: it premieres on the stream and its vote opens.
export function releaseNext() {
  const db = getDb();
  const ep = scheduled()[0];
  if (!ep) return null;
  const decided = closePoll(ep.id);
  if (decided) { ep.pollId = decided.poll.id; ep.decidedBy = decided.poll.decidedBy; ep.votedPremise = decided.premise; }
  ep.status = "ready"; ep.readyAt = Date.now(); ep.createdAt = Date.now();
  save(); emit("episode", ep);
  if (ensurePoll()) emit("vote", pollView(currentPoll()));
  console.log(`[release] episode ${ep.number} is out. ${scheduled().length} left in the queue.`);
  return ep;
}

// Start the clock: first release now (or after one interval), then one every `everyMinutes`.
export function startRelease(everyMinutes = 5, firstNow = true) {
  const db = getDb();
  if (!scheduled().length) return { error: "No scheduled episodes to release." };
  const everyMs = Math.max(1, Number(everyMinutes)) * 60_000;
  db.release = { everyMs, nextAt: Date.now() + (firstNow ? 0 : everyMs) };
  save(); tickRelease();
  return { ok: true, everyMinutes: everyMs / 60_000, queued: scheduled().length, nextAt: db.release?.nextAt || null };
}
export function stopRelease() { const db = getDb(); db.release = null; save(); emit("episode", { release: null }); return { ok: true, queued: scheduled().length }; }
export function releaseStatus() {
  const db = getDb();
  return { queued: scheduled().map((e) => ({ number: e.number, title: e.title })), clock: db.release ? { everyMinutes: db.release.everyMs / 60_000, nextAt: new Date(db.release.nextAt).toISOString() } : null };
}
export function tickRelease() {
  const db = getDb();
  if (!db.release) return;
  if (Date.now() < db.release.nextAt) return;
  const ep = releaseNext();
  if (!ep || !scheduled().length) {
    db.release = null; save();
    console.log("[release] queue finished; the server makes the next episodes from here.");
    maybeProduce();
    return;
  }
  db.release.nextAt = Date.now() + db.release.everyMs; save();
  emit("episode", { release: db.release });
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
  if (ep.status === "ready") { (getDb().guard ??= {}).failures = 0; getDb().guard.pausedUntil = 0; save(); maybeProduce(); }
}

export function renderProgress(ep, pct, note) {
  ep.renderProgress = Math.max(0, Math.min(1, pct)); if (note) ep.renderNote = note; save(); emit("episode", ep);
}

export function completeEpisode(ep, videoUrl) {
  Object.assign(ep, { status: "ready", videoUrl, readyAt: Date.now() });
  save(); emit("episode", ep); maybeProduce();
}
