// Viewer votes: while the fund fills, viewers pick what the next episode is about.
// Votes come from the pump.fun livestream chat (one vote per wallet) and from the website
// (one vote per browser). A wallet's or browser's latest vote replaces its earlier one.
import { COIN } from "./config.js";
import { getDb, save, uid } from "./store.js";

const KEYS = ["A", "B", "C"];

// Fallback poll options when Claude isn't configured. The script writer turns the winner into the episode.
const IDEAS = [
  ["The ducks start delivering letters to people who haven't been born yet", "Every boat in town turns around and faces Ollie's house", "Mrs. Pearl admits she wrote the rule, and it was a lie"],
  ["The lighthouse starts blinking a message in code", "The copy of Milo starts going to school instead of Milo", "The rain stops for one minute, and everyone screams"],
  ["A new kid arrives and says the town underneath is nicer", "The puddles start showing tomorrow", "Ollie's reflection stops copying him"],
];

export function currentPoll() { return getDb().polls?.find((p) => p.status === "open") || null; }

export function openPoll(question, options, { source = "template", ...extra } = {}) {
  const db = getDb(); db.polls ??= [];
  const n = db.polls.length;
  const opts = options.slice(0, 3).map((label, i) => ({ key: KEYS[i], label }));
  const poll = { id: uid("poll"), number: n + 1, question, options: opts, status: "open", source, ...extra, openedAt: Date.now(),
    votes: {}, // voterId -> key
    recent: [] };
  db.polls.unshift(poll); save();
  return poll;
}

// Open the vote for the next episode. If the latest episode ended on a cliffhanger, its 3 options
// are the choices; otherwise (before episode 1, or an episode with no options) use a fixed idea set.
export function ensurePoll() {
  if (currentPoll()) return currentPoll();
  const db = getDb(); db.polls ??= [];
  const last = db.episodes.find((e) => e.status !== "failed");
  if (last && last.status === "writing" && !last.nextOptions) return null; // its cliffhanger isn't written yet
  const next = (last?.number || 0) + 1;
  if (last?.nextOptions?.length) {
    return openPoll(`What happens in episode ${next}?`, last.nextOptions, { source: "cliffhanger", cliffhanger: last.cliffhanger || null, fromEpisode: last.number });
  }
  return openPoll(`What happens in episode ${next}?`, IDEAS[db.polls.length % IDEAS.length]);
}

// Parse a chat message into a vote: "A", "b", "!vote C", "vote a", or the start of an option's label.
export function parseVote(text, poll) {
  const t = String(text).trim().toLowerCase();
  const m = t.match(/^(?:!?vote\s*)?([abc])\b[.!]?$/i);
  if (m) return m[1].toUpperCase();
  for (const o of poll.options) if (t.length > 8 && o.label.toLowerCase().startsWith(t.slice(0, 12))) return o.key;
  return null;
}

export function castVote(voterId, key, { source, name } = {}) {
  const poll = currentPoll();
  if (!poll || !poll.options.some((o) => o.key === key)) return null;
  const changed = poll.votes[voterId] !== key;
  poll.votes[voterId] = key;
  poll.recent.unshift({ name: name || voterId.slice(0, 6), key, source, at: Date.now() });
  poll.recent.length = Math.min(poll.recent.length, 30);
  save();
  return { poll, changed };
}

export function tally(poll) {
  const counts = Object.fromEntries(poll.options.map((o) => [o.key, 0]));
  for (const k of Object.values(poll.votes)) counts[k] = (counts[k] || 0) + 1;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const leader = poll.options.reduce((best, o) => (counts[o.key] > (counts[best?.key] ?? -1) ? o : best), null);
  return { counts, total, leader: total ? leader : null };
}

// Called when an episode gets funded: lock the poll and hand back the winning premise.
export function closePoll(episodeId) {
  const poll = currentPoll();
  if (!poll) return null;
  const t = tally(poll);
  const winner = t.leader || poll.options[Math.floor(Math.random() * poll.options.length)];
  Object.assign(poll, { status: "closed", closedAt: Date.now(), winner: winner.key, episodeId, decidedBy: t.total ? "votes" : "coin flip" });
  save();
  return { premise: winner.label, poll, tally: t };
}

export const pollView = (poll) => poll && { ...poll, votes: undefined, voters: Object.keys(poll.votes).length, tally: tally(poll) };
