// Release schedule for pre-made episodes. Run on the server:
//   docker compose exec web node tools/release.mjs status          what's queued and when the next one drops
//   docker compose exec web node tools/release.mjs hold 2          hide episodes 2 and up again (queue them)
//   docker compose exec web node tools/release.mjs start 5         release one now, then one every 5 minutes
//   docker compose exec web node tools/release.mjs start 5 later   first one in 5 minutes instead of now
//   docker compose exec web node tools/release.mjs stop            pause the clock (queue stays hidden)
const [action = "status", arg, when] = process.argv.slice(2);
for (let i = 0; i < 60; i++) { try { await fetch("http://localhost:3000/api/state"); break; } catch { if (i === 0) console.log("Waiting for the server to start…"); await new Promise((r) => setTimeout(r, 1000)); } }
const body = action === "hold" ? { action, from: Number(arg) } : action === "start" ? { action, every: Number(arg || 5), firstNow: when !== "later" } : { action };
if (action === "hold" && !(body.from >= 1)) { console.log("Usage: node tools/release.mjs hold <first episode number to hide>"); process.exit(1); }
const res = await fetch("http://localhost:3000/api/admin/release", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const out = await res.json();
if (out.error) { console.log("Failed: " + out.error); process.exit(1); }
if (action === "hold") console.log(`Hidden again: episode(s) ${out.held.join(", ") || "none"}. ${out.queued} episode(s) now queued.`);
else if (action === "start") console.log(`Release clock started: one episode every ${out.everyMinutes} min. ${out.queued} queued.${body.firstNow ? " The first one is out now." : ""}`);
else if (action === "stop") console.log(`Release clock stopped. ${out.queued} episode(s) still queued and hidden.`);
else {
  console.log(out.queued.length ? "Queued (hidden):\n" + out.queued.map((e) => `  ${e.number}. ${e.title}`).join("\n") : "Nothing queued.");
  console.log(out.clock ? `Clock: every ${out.clock.everyMinutes} min, next at ${out.clock.nextAt}` : "Clock: stopped.");
}
