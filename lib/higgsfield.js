// Higgsfield video provider: one text-to-video clip per scene, generated in parallel.
//
// Based on Higgsfield's published example: POST https://api.higgsfield.ai/<model>/text-to-video
// with header  Authorization: Key <HF_API_KEY_ID>:<HF_API_KEY_SECRET>, which returns a request
// record you poll until it completes. Field names for status and the result URL are read
// defensively below. CHECK THEM against docs.higgsfield.ai before the first paid run, and
// adjust HF_* env vars if your model's path or body differs.
//
// Env:
//   HF_API_KEY_ID, HF_API_KEY_SECRET   (from console.higgsfield.ai)
//   HF_BASE_URL     default https://api.higgsfield.ai
//   HF_MODEL_PATH   default bytedance/seedance-2.0/text-to-video
//   HF_DURATION     seconds per scene clip, default 5
//   HF_EXTRA_BODY   optional JSON merged into each request body, e.g. {"resolution":"720p"}
import { scenePrompt } from "./script.js";

const BASE = () => (process.env.HF_BASE_URL || "https://api.higgsfield.ai").replace(/\/$/, "");
const MODEL = () => (process.env.HF_MODEL_PATH || "bytedance/seedance-2.0/text-to-video").replace(/^\//, "");
const headers = () => ({
  "content-type": "application/json",
  authorization: `Key ${process.env.HF_API_KEY_ID}:${process.env.HF_API_KEY_SECRET}`,
});
export const higgsfieldReady = () => !!(process.env.HF_API_KEY_ID && process.env.HF_API_KEY_SECRET);

async function call(url, init = {}) {
  const res = await fetch(url, { ...init, headers: headers() });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok) throw new Error(`Higgsfield ${res.status}: ${(body.detail || body.message || text).toString().slice(0, 200)}`);
  return body;
}

// Find the first value in a response that looks like a video URL.
function findVideoUrl(o) {
  if (!o || typeof o !== "object") return null;
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "string" && /^https:\/\/.+\.(mp4|mov|webm)(\?|$)/i.test(v)) return v;
    if (typeof v === "string" && /^(video_?url|url)$/i.test(k) && v.startsWith("https://")) return v;
    if (typeof v === "object") { const u = findVideoUrl(v); if (u) return u; }
  }
  return null;
}
const statusOf = (o) => String(o.status || o.state || o.data?.status || "").toLowerCase();
const DONE = /complete|succeed|success|done|finished/, FAILED = /fail|error|cancel|nsfw|reject/;

async function generateClip(prompt, onTick) {
  const extra = process.env.HF_EXTRA_BODY ? JSON.parse(process.env.HF_EXTRA_BODY) : {};
  const sub = await call(`${BASE()}/${MODEL()}`, {
    method: "POST",
    body: JSON.stringify({ prompt, aspect_ratio: "9:16", duration: Number(process.env.HF_DURATION || 5), ...extra }),
  });
  let url = findVideoUrl(sub);
  if (url) return url;
  const id = sub.request_id || sub.id || sub.data?.id;
  const statusUrl = sub.status_url || sub.urls?.status || (id && `${BASE()}/requests/${id}/status`);
  if (!statusUrl) throw new Error("Higgsfield response had no request id or status url: " + JSON.stringify(sub).slice(0, 200));
  const started = Date.now();
  while (Date.now() - started < 20 * 60_000) {
    await new Promise((r) => setTimeout(r, Number(process.env.HF_POLL_MS || 6000)));
    const st = await call(statusUrl);
    const s = statusOf(st);
    onTick?.();
    if (FAILED.test(s)) throw new Error(`Higgsfield job ${id} ${s}`);
    url = findVideoUrl(st);
    if (url && (DONE.test(s) || !s)) return url;
  }
  throw new Error(`Higgsfield job ${id} timed out`);
}

// Render every scene; reports progress as clips finish. Returns clip URLs in scene order.
export async function renderWithHiggsfield(coin, episode, onProgress) {
  if (!higgsfieldReady()) throw new Error("Set HF_API_KEY_ID and HF_API_KEY_SECRET to use Higgsfield.");
  let done = 0;
  const clips = await Promise.all(episode.scenes.map(async (s) => {
    const url = await generateClip(scenePrompt(coin, s));
    onProgress?.(++done / episode.scenes.length);
    return url;
  }));
  return clips;
}
