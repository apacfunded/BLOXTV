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
  pumpUrl: raw.mint ? `https://pump.fun/coin/${raw.mint}` : null,
};
export const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
