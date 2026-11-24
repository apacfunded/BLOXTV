// Turns an episode's clips + narration into one finished file: data/episodes/<id>/episode.mp4,
// served at /episodes/<id>.mp4. Uses tools/assemble_episode.py (ffmpeg): one-word captions,
// the music loop from reference/, loudness for TikTok and Reels.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { narrateEpisode, narrationReady } from "./narration.js";

export const episodesDir = () => path.resolve(process.env.EPISODES_DIR || "data/episodes");
const FONT = path.resolve("tools/fonts/Montserrat-ExtraBold.ttf");
const MUSIC = path.resolve("reference/music-loop.mp3");

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status} ${url}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.slice(-400)}`))));
  });
}

// clips: array of URLs in scene order. Returns the public path of the finished episode.
export async function assembleEpisode(episode, clips, onProgress) {
  const dir = path.join(episodesDir(), episode.id);
  fs.mkdirSync(dir, { recursive: true });
  const scenes = [];
  for (const [i, url] of clips.entries()) {
    const file = path.join(dir, `clip${i + 1}.mp4`);
    if (!fs.existsSync(file)) await download(url, file);
    scenes.push({ clip: `clip${i + 1}.mp4`, line: episode.scenes[i].line });
    onProgress?.(0.1 + 0.3 * ((i + 1) / clips.length));
  }
  if (narrationReady()) {
    const vo = await narrateEpisode(episode, dir);
    vo.forEach((f, i) => (scenes[i].vo = path.basename(f)));
  } else console.warn("[assemble] No ElevenLabs key, so the episode has no narration (captions and music only).");
  onProgress?.(0.5);
  const spec = { title: episode.title, scenes, music: fs.existsSync(MUSIC) ? MUSIC : null, music_db: -14 };
  fs.writeFileSync(path.join(dir, "episode.json"), JSON.stringify(spec, null, 2));
  const out = path.join(dir, "episode.mp4");
  await run("python3", [path.resolve("tools/assemble_episode.py"), path.join(dir, "episode.json"), out, ...(fs.existsSync(FONT) ? ["--font", FONT] : [])], dir);
  onProgress?.(1);
  return `/episodes/${episode.id}.mp4`;
}

export function episodeFile(id) {
  const f = path.join(episodesDir(), id.replace(/[^\w-]/g, ""), "episode.mp4");
  return fs.existsSync(f) ? f : null;
}
