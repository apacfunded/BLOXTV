// Higgsfield API client for the episode pipeline. Matches docs.higgsfield.ai (Nov 2026):
//   auth      Authorization: Key <id>:<secret>
//   submit    POST https://api.higgsfield.ai/<endpoint>  -> { request_id, status_url }
//   poll      GET status_url -> status queued|in_progress|completed|failed|nsfw|canceled
//   outputs   images[0].url (image models), video.url (video models)
//   uploads   POST /files/generate-upload-url {content_type} -> {public_url, upload_url, upload_headers}
//
// Per scene: one keyframe (GPT Image 2.5 Sunburst, with the cast sheet + reference thumbnail as
// references) then one clip (Seedance 2.5 reference-to-video from that keyframe + the cast sheet).
//
// Env: HF_API_KEY_ID, HF_API_KEY_SECRET, optional HF_BASE_URL, HF_IMAGE_MODEL, HF_VIDEO_MODEL,
//      HF_RESOLUTION (480p|720p|1080p, default 480p), HF_DURATION (seconds per clip, default 4)
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { scenePrompt, CHARACTER, WORLD } from "./script.js";

const BASE = () => (process.env.HF_BASE_URL || "https://api.higgsfield.ai").replace(/\/$/, "");
const IMAGE_MODEL = () => process.env.HF_IMAGE_MODEL || "marketing-studio/image/sunburst";
const VIDEO_MODEL = () => process.env.HF_VIDEO_MODEL || "bytedance/seedance-2.5/reference-to-video";
const auth = () => `Key ${process.env.HF_API_KEY_ID}:${process.env.HF_API_KEY_SECRET}`;
export const higgsfieldReady = () => !!(process.env.HF_API_KEY_ID && process.env.HF_API_KEY_SECRET);

async function api(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { authorization: auth(), ...(init.headers || {}) } });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok) throw new Error(`Higgsfield ${res.status} ${url.replace(BASE(), "")}: ${(body.detail || body.error || body.message || text).toString().slice(0, 300)}`);
  return body;
}

export async function submit(endpoint, input) {
  return api(`${BASE()}/${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": randomUUID() },
    body: JSON.stringify(input),
  });
}

// Poll with the documented backoff: 2s growing to 10s, stop on a terminal state.
export async function waitFor(handle, { timeoutMs = 20 * 60_000, onTick } = {}) {
  const started = Date.now();
  let delay = Number(process.env.HF_POLL_MS || 2000);
  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, delay + Math.random() * 500));
    delay = Math.min(delay * 1.5, 10_000);
    const st = await api(handle.status_url || `${BASE()}/requests/${handle.request_id}/status`);
    onTick?.(st);
    if (st.status === "completed") return st;
    if (["failed", "nsfw", "canceled"].includes(st.status)) throw new Error(`Higgsfield request ${handle.request_id} ${st.status}${st.error ? ": " + st.error : ""}`);
  }
  throw new Error(`Higgsfield request ${handle.request_id} timed out`);
}

// Upload a local file and get a public URL the models can read.
export async function uploadFile(localPath, contentType) {
  const u = await api(`${BASE()}/files/generate-upload-url`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content_type: contentType }) });
  const res = await fetch(u.upload_url, { method: "PUT", headers: u.upload_headers || { "content-type": contentType }, body: fs.readFileSync(localPath) });
  if (!res.ok) throw new Error(`upload ${res.status}`);
  return u.public_url;
}

// The standing references (reference/README.md), uploaded once per day per process.
let refs = null, refsAt = 0;
export async function referenceUrls() {
  if (refs && Date.now() - refsAt < 20 * 3600_000) return refs;
  const dir = path.resolve("reference");
  const cast = path.join(dir, "cast-and-towns.png"), thumb = path.join(dir, "reference-thumbnail.jpg");
  refs = {
    cast: fs.existsSync(cast) ? await uploadFile(cast, "image/png") : null,
    thumb: fs.existsSync(thumb) ? await uploadFile(thumb, "image/jpeg") : null,
  };
  refsAt = Date.now();
  return refs;
}

export async function generateKeyframe(prompt, refUrls) {
  const h = await submit(IMAGE_MODEL(), { prompt, image_urls: refUrls.filter(Boolean), aspect_ratio: "9:16", resolution: "1k", quality: "high", enhance_prompt: false });
  const st = await waitFor(h, { timeoutMs: 10 * 60_000 });
  const url = st.images?.[0]?.url; if (!url) throw new Error("no image in response");
  return url;
}

export async function generateClip(keyframeUrl, refUrls, prompt, seconds) {
  const h = await submit(VIDEO_MODEL(), {
    prompt, image_urls: [keyframeUrl, ...refUrls.filter(Boolean)], duration: Math.max(4, Math.min(30, Math.round(seconds))),
    aspect_ratio: "9:16", resolution: process.env.HF_RESOLUTION || "480p", generate_audio: true, bitrate_mode: "standard",
  });
  const st = await waitFor(h);
  const url = st.video?.url; if (!url) throw new Error("no video in response");
  return url;
}

function keyframePrompt(coin, scene) {
  return [
    `Vertical 9:16 in-game screenshot in the EXACT style of the reference images: classic Roblox-style block avatar (cylinder head, block torso and limbs, flat 2D anime-eye face decal, hair mesh, matte plastic, even game lighting).`,
    `Hero: ${CHARACTER}, exactly as on the cast sheet. Setting in the town of ${coin.town}: ${scene.setting}. ${WORLD}.`,
    `Action frozen at its clearest moment: ${scene.action}. Lighting: ${scene.mood}. Character chest-up or medium shot, centred, upper third of the frame clear. No text, no logos.`,
  ].join(" ");
}

// Render every scene of an episode: keyframe -> clip, with progress 0..1. Returns clip and keyframe URLs in order.
export async function renderWithHiggsfield(coin, episode, onProgress) {
  if (!higgsfieldReady()) throw new Error("Set HF_API_KEY_ID and HF_API_KEY_SECRET to use Higgsfield.");
  const refs = await referenceUrls();
  const refList = [refs.cast, refs.thumb];
  const n = episode.scenes.length;
  let done = 0;
  const limit = Number(process.env.HF_PARALLEL || 4);
  const results = new Array(n);
  let next = 0;
  async function worker() {
    while (next < n) {
      const i = next++;
      const scene = episode.scenes[i];
      const keyframe = await generateKeyframe(keyframePrompt(coin, scene), refList);
      onProgress?.((done + 0.4) / n);
      const words = scene.line.split(/\s+/).length;
      const clip = await generateClip(keyframe, [refs.cast], scenePrompt(coin, scene), Number(process.env.HF_DURATION || Math.max(4, Math.ceil(words * 0.4 + 1.5))));
      results[i] = { keyframe, clip };
      onProgress?.(++done / n);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, n) }, worker));
  return { clips: results.map((r) => r.clip), keyframes: results.map((r) => r.keyframe) };
}
