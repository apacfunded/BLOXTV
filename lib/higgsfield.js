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
// Env: HF_CREDENTIALS (the API key, "id:secret") or HF_API_KEY_ID + HF_API_KEY_SECRET, optional HF_BASE_URL, HF_IMAGE_MODEL, HF_VIDEO_MODEL,
//      HF_RESOLUTION (480p|720p|1080p, default 480p), HF_DURATION (seconds per clip, default 4)
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { scenePrompt, CHARACTER, WORLD } from "./script.js";

const BASE = () => (process.env.HF_BASE_URL || "https://api.higgsfield.ai").replace(/\/$/, "");
const IMAGE_MODEL = () => process.env.HF_IMAGE_MODEL || "marketing-studio/image/sunburst";
const VIDEO_MODEL = () => process.env.HF_VIDEO_MODEL || "bytedance/seedance-2.5/reference-to-video";
// One key "id:secret" in HF_CREDENTIALS (as the console gives it), or the two halves separately.
const creds = () => process.env.HF_CREDENTIALS || (process.env.HF_API_KEY_ID && process.env.HF_API_KEY_SECRET ? `${process.env.HF_API_KEY_ID}:${process.env.HF_API_KEY_SECRET}` : "");
const auth = () => `Key ${creds()}`;
export const higgsfieldReady = () => creds().includes(":");

class HiggsfieldHttpError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 5xx, 429 and network errors are temporary; 4xx (bad input, auth, credits) are not.
const retryable = (e) => !e.status || e.status >= 500 || e.status === 429;

async function api(url, init = {}) {
  let res;
  try {
    res = await fetch(url, { ...init, headers: { authorization: auth(), ...(init.headers || {}) } });
  } catch (e) {
    throw new HiggsfieldHttpError(`Higgsfield network error ${url.replace(BASE(), "")}: ${e.cause?.code || e.message}`, 0);
  }
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok) throw new HiggsfieldHttpError(`Higgsfield ${res.status} ${url.replace(BASE(), "")}: ${(body.detail || body.error || body.message || text).toString().slice(0, 300)}`, res.status);
  return body;
}

// Submit with up to 3 tries on temporary errors. The same Idempotency-Key is reused on every try,
// so a retry after an ambiguous failure returns the original request instead of paying twice.
export async function submit(endpoint, input) {
  const key = randomUUID();
  for (let attempt = 1; ; attempt++) {
    try {
      return await api(`${BASE()}/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key },
        body: JSON.stringify(input),
      });
    } catch (e) {
      if (attempt >= 3 || !retryable(e)) throw e;
      console.warn(`[higgsfield] ${e.message} (try ${attempt}/3, retrying)`);
      await sleep(3000 * attempt);
    }
  }
}

// Poll with the documented backoff: 2s growing to 10s, stop on a terminal state.
export async function waitFor(handle, { timeoutMs = 20 * 60_000, onTick } = {}) {
  const started = Date.now();
  let delay = Number(process.env.HF_POLL_MS || 2000);
  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, delay + Math.random() * 500));
    delay = Math.min(delay * 1.5, 10_000);
    let st;
    try {
      st = await api(handle.status_url || `${BASE()}/requests/${handle.request_id}/status`);
    } catch (e) {
      if (retryable(e)) continue; // a hiccup while checking status: keep polling, the job is still running
      throw e;
    }
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

// Image models to try in order for a keyframe. The backup (Grok Image 2.0) also takes reference images.
const IMAGE_MODELS = () => [
  { endpoint: IMAGE_MODEL(), input: (prompt, refs) => ({ prompt, image_urls: refs, aspect_ratio: "9:16", resolution: "1k", quality: "high", enhance_prompt: false }) },
  { endpoint: process.env.HF_IMAGE_FALLBACK || "xai/grok-imagine-image-2.0", input: (prompt, refs) => ({ prompt, image_urls: refs.slice(0, 10), aspect_ratio: "9:16", resolution: "1k", quality: "medium" }) },
];

async function once(endpoint, input, timeoutMs) {
  const h = await submit(endpoint, input);
  return waitFor(h, { timeoutMs });
}

// Main image model twice, then the backup once. Moderation rejections (nsfw) are not retried.
export async function generateKeyframe(prompt, refUrls) {
  const refs = refUrls.filter(Boolean);
  const plan = [IMAGE_MODELS()[0], IMAGE_MODELS()[0], IMAGE_MODELS()[1]];
  let last;
  for (const [i, m] of plan.entries()) {
    try {
      const st = await once(m.endpoint, m.input(prompt, refs), 10 * 60_000);
      const url = st.images?.[0]?.url; if (!url) throw new Error("no image in response");
      if (i > 0) console.warn(`[higgsfield] keyframe succeeded on try ${i + 1} (${m.endpoint})`);
      return url;
    } catch (e) {
      last = e;
      if (/nsfw/.test(e.message) || (e.status && e.status < 500 && e.status !== 429)) throw e;
      console.warn(`[higgsfield] keyframe try ${i + 1}/${plan.length} failed: ${e.message}`);
      await sleep(2000);
    }
  }
  throw last;
}

// One video clip from a keyframe, with one more try if the generation fails or Higgsfield hiccups.
export async function generateClip(keyframeUrl, refUrls, prompt, seconds) {
  const input = {
    prompt, image_urls: [keyframeUrl, ...refUrls.filter(Boolean)], duration: Math.max(4, Math.min(30, Math.round(seconds))),
    aspect_ratio: "9:16", resolution: process.env.HF_RESOLUTION || "480p", generate_audio: true, bitrate_mode: "standard",
  };
  let last;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const st = await once(VIDEO_MODEL(), input, 20 * 60_000);
      const url = st.video?.url; if (!url) throw new Error("no video in response");
      return url;
    } catch (e) {
      last = e;
      if (/nsfw/.test(e.message) || (e.status && e.status < 500 && e.status !== 429)) throw e;
      console.warn(`[higgsfield] clip try ${attempt}/2 failed: ${e.message}`);
      await sleep(3000);
    }
  }
  throw last;
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
  if (!higgsfieldReady()) throw new Error("Set HF_CREDENTIALS (your Higgsfield API key) to use Higgsfield.");
  const refs = await referenceUrls();
  const refList = [refs.cast, refs.thumb];
  const n = episode.scenes.length;
  let done = 0;
  const limit = Number(process.env.HF_PARALLEL || 2);
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
