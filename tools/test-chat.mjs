// Checks that the pump.fun chat reader works from this server: picks a coin that is live right now,
// joins its chat for 45 seconds and prints what comes in. Run on the server:
//   docker compose exec web node tools/test-chat.mjs            (any live coin)
//   docker compose exec web node tools/test-chat.mjs <mint>     (a specific coin)
import { startPumpChat } from "../lib/pumpchat.js";

let mint = process.argv[2];
if (!mint) {
  const res = await fetch("https://frontend-api-v3.pump.fun/coins/currently-live?limit=10&offset=0&includeNsfw=false");
  const coins = await res.json();
  const best = coins.sort((a, b) => (b.num_participants || 0) - (a.num_participants || 0))[0];
  if (!best) { console.log("No live coins found right now; pass a mint address instead."); process.exit(1); }
  mint = best.mint;
  console.log(`Testing against $${best.symbol} (${best.num_participants || 0} viewers) ${mint}`);
}
let n = 0;
startPumpChat(mint, (m) => { n++; if (n <= 15) console.log(`  chat  ${m.username}: ${m.text.slice(0, 80)}`); }, { onStatus: (s, x) => { if (s !== "message") console.log(`  status ${s} ${x ?? ""}`); } });
setTimeout(() => {
  console.log(n ? `OK: chat reader works, ${n} messages in 45s.` : "Connected but saw no messages in 45s. Quiet chat, or try a busier coin.");
  process.exit(0);
}, 45_000);
