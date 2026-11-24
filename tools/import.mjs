// Imports an episode made outside the server (clips as URLs) and publishes it as the next episode.
// Run on the server:  docker compose exec web node tools/import.mjs episodes/pilot.json
import fs from "node:fs";

const file = process.argv[2];
const hold = process.argv.includes("--hold");
if (!file) { console.log("Usage: node tools/import.mjs <episode.json>"); process.exit(1); }
const body = JSON.parse(fs.readFileSync(file, "utf8"));
if (hold) body.schedule = true;
// The server may still be starting after a rebuild: wait for it.
for (let i = 0; i < 60; i++) { try { await fetch("http://localhost:3000/api/state"); break; } catch { if (i === 0) console.log("Waiting for the server to start…"); await new Promise((r) => setTimeout(r, 1000)); } }
console.log(`Importing "${body.title}" (${body.scenes.length} scenes)… adding narration, captions and music. This takes a minute or two.`);
const res = await fetch("http://localhost:3000/api/admin/import-episode", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const out = await res.json();
console.log(!out.ok ? `Failed: ${out.error}` : out.scheduled ? `Done: episode ${out.number} is loaded and hidden until its release slot.` : `Done: episode ${out.number} is live at ${out.videoUrl}. The vote for the next episode is open.`);
