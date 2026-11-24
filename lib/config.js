import fs from "node:fs";

// The one coin this show is about. Edit coin.config.json (copied from coin.config.example.json).
const FILE = process.env.COIN_CONFIG || "coin.config.json";
const raw = JSON.parse(fs.readFileSync(fs.existsSync(FILE) ? FILE : "coin.config.example.json", "utf8"));

export const COIN = {
  ...raw,
  id: raw.mint || raw.ticker,
  ticker: String(raw.ticker).toUpperCase(),
  episodeCostSol: Number(process.env.EPISODE_COST_SOL || raw.episodeCostSol || 0.5),
  pollSeconds: Math.max(5, Number(raw.pollSeconds || 20)),
  // Share of every creator fee that counts toward the episode fund. The main coin has no split: all of it
  // counts (1). The 60/20/20 split is the deal for towns launched later; set 0.6 for those.
  fundShare: Math.min(1, Math.max(0.01, Number(raw.fundShare ?? 1))),
  // Safety cap on episodes the server makes by itself in any 24 hours (each costs real API credit).
  maxEpisodesPerDay: Math.max(1, Number(process.env.MAX_EPISODES_PER_DAY || raw.maxEpisodesPerDay || 12)),
  seasonLength: Math.max(1, Number(raw.seasonLength || 10)), // episodes per season
  trailer: raw.trailer === false ? null : (raw.trailer || "/brand/trailer.mp4"),
  pumpUrl: raw.mint ? `https://pump.fun/coin/${raw.mint}` : null,
};
export const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
