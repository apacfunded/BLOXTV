// Narration with ElevenLabs. One mp3 per scene line, in the show's narrator voice.
//
// Env: ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID (the narrator voice: clone it once in ElevenLabs
//      from reference/reference-clip.mp4's voice track, see README), optional ELEVENLABS_MODEL
//      (default eleven_multilingual_v2) and ELEVENLABS_BASE_URL.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const narrationReady = () => !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID);

export async function speak(text, outPath) {
  const base = (process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io").replace(/\/$/, "");
  const res = await fetch(`${base}/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2",
      // Calm narrator with some life in it: a little less stability and more style than a flat read.
      voice_settings: { stability: Number(process.env.ELEVENLABS_STABILITY || 0.55), similarity_boost: 0.85, style: Number(process.env.ELEVENLABS_STYLE || 0.4), use_speaker_boost: false },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
  return outPath;
}

// Seconds of audio in a file (ffprobe), or null if it can't be read.
export function audioSeconds(file) {
  try {
    const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim();
    return Number(out) || null;
  } catch { return null; }
}

// Narrate every line of an episode into dir/vo{n}.mp3. Returns the file paths in order.
export async function narrateEpisode(episode, dir) {
  if (!narrationReady()) throw new Error("Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID for narration.");
  const out = [];
  for (const [i, s] of episode.scenes.entries()) {
    const file = path.join(dir, `vo${i + 1}.mp3`);
    if (!fs.existsSync(file)) await speak(s.line, file);
    out.push(file);
  }
  return out;
}
