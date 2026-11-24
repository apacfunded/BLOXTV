// Video production adapter.
// VIDEO_PROVIDER=preview (default): the storyboard is the video; the site plays it
//   in the browser with captions + voiceover. No cost, works offline.
// VIDEO_PROVIDER=higgsfield: one Higgsfield text-to-video clip per scene (see lib/higgsfield.js).
//   The site and stream play the clips back to back with captions on top.
// VIDEO_PROVIDER=webhook: POSTs the job to VIDEO_WEBHOOK_URL. Your render worker
//   (any text-to-video service + TTS + editor) calls back
//   POST /api/episodes/:id/complete  { videoUrl }  with header x-callback-secret.
import { scenePrompt } from "./script.js";
import { renderWithHiggsfield } from "./higgsfield.js";
import { assembleEpisode } from "./assemble.js";

export const provider = () => process.env.VIDEO_PROVIDER || "preview";

export async function renderEpisode(coin, episode, onProgress) {
  if (provider() === "higgsfield") {
    try {
      const { clips, keyframes } = await renderWithHiggsfield(coin, episode, (p) => onProgress?.(p * 0.7));
      const videoUrl = await assembleEpisode(episode, clips, (p) => onProgress?.(0.7 + p * 0.3));
      return { status: "ready", clips, keyframes, videoUrl };
    } catch (err) {
      // Don't retry and re-spend credits: air the episode as a preview reel and log why.
      console.error("[higgsfield]", err.message);
      return { status: "ready", videoUrl: null, renderError: "AI render failed, aired as a preview reel." };
    }
  }
  if (provider() === "webhook") {
    const url = process.env.VIDEO_WEBHOOK_URL;
    if (!url) throw new Error("VIDEO_WEBHOOK_URL is not set");
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        episodeId: episode.id,
        coin: { id: coin.id, name: coin.name, ticker: coin.ticker, town: coin.town },
        title: episode.title,
        aspect: "9:16",
        scenes: episode.scenes.map((s) => ({ narration: s.line, prompt: scenePrompt(coin, s), seconds: 3 })),
        callbackUrl: `${process.env.PUBLIC_URL || "http://localhost:3000"}/api/episodes/${episode.id}/complete`,
      }),
    });
    if (!res.ok) throw new Error(`webhook ${res.status}`);
    return { status: "rendering" };
  }
  return { status: "ready", videoUrl: null }; // preview: storyboard plays in-browser
}
