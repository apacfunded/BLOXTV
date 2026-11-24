// Wipes episodes, votes, the fee log and the fund for a clean start. Run on the server:
//   docker compose exec web node tools/reset.mjs
for (let i = 0; i < 60; i++) { try { await fetch("http://localhost:3000/api/state"); break; } catch { if (i === 0) console.log("Waiting for the server to start…"); await new Promise((r) => setTimeout(r, 1000)); } }
const res = await fetch("http://localhost:3000/api/admin/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: "RESET" }) });
const out = await res.json();
console.log(out.ok ? `Reset done: removed ${out.removedEpisodes} episode(s), fund and votes cleared.` : `Reset failed: ${out.error}`);
