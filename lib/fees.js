// Watches the coin's pump.fun creator-fee vault(s) and credits new fees to the video fund.
//
// Fees pile up in a vault account until the creator claims them. We poll its SOL balance:
// any increase is new fees; a decrease is a claim and is ignored. So claiming your
// fees never costs the show an episode.
import { PublicKey } from "@solana/web3.js";
import { COIN, RPC_URL } from "./config.js";
import { getDb, save } from "./store.js";

const PUMP_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

// Bonding-curve creator vault: PDA of ["creator-vault", creator] under the Pump program.
// Verify it on Solscan against your coin's creator-fee account. After graduation fees move
// to the PumpSwap side; add that account to "feeVaults" in coin.config.json.
export function creatorVault(creator) {
  return PublicKey.findProgramAddressSync([Buffer.from("creator-vault"), new PublicKey(creator).toBuffer()], PUMP_PROGRAM)[0].toBase58();
}

export function watchedAddresses() {
  const list = [...(COIN.feeVaults || [])];
  if (COIN.creatorWallet && !list.length) list.push(creatorVault(COIN.creatorWallet));
  return list;
}

async function rpc(method, params) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}
const balanceSol = async (a) => (await rpc("getBalance", [a, { commitment: "confirmed" }])).value / 1e9;
// Transactions that touched the vault since the last one we saw (newest first).
const newSignatures = (a, until) =>
  rpc("getSignaturesForAddress", [a, { limit: 50, commitment: "confirmed", ...(until ? { until } : {}) }]).then((r) => r.filter((x) => !x.err));

export function startFeeWatcher(onFees) {
  const addrs = watchedAddresses();
  if (!addrs.length) {
    console.log("[fees] No creatorWallet or feeVaults in coin.config.json — fee watcher is off.");
    return;
  }
  console.log("[fees] Watching:", addrs.join(", "));
  const tick = async () => {
    const db = getDb();
    db.vaults ??= {}; db.lastSig ??= {};
    for (const a of addrs) {
      try {
        const bal = await balanceSol(a);
        const prev = db.vaults[a];
        db.vaults[a] = bal;
        if (prev === undefined) {
          console.log(`[fees] ${a} baseline ${bal} SOL`);
          db.lastSig[a] = (await newSignatures(a).catch(() => []))[0]?.signature;
          if (COIN.countExistingFees && bal > 0.00089088) onFees(bal - 0.00089088, "fees already in vault");
          continue;
        }
        const delta = bal - prev;
        if (delta > 1e-9) {
          const sigs = await newSignatures(a, db.lastSig[a]).catch(() => []);
          if (sigs[0]) db.lastSig[a] = sigs[0].signature;
          onFees(delta, { source: "creator fees", txCount: sigs.length || null, sig: sigs[0]?.signature || null });
        }
      } catch (err) {
        console.warn("[fees] RPC error:", err.message);
      }
    }
    save();
  };
  tick();
  setInterval(tick, COIN.pollSeconds * 1000);
}
