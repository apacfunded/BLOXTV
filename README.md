# In My Town

One coin, one town, one running story. Your pump.fun coin's **creator fees pay for the next "In my town…" episode**, and every episode **premieres on the coin's pump.fun livestream**.

```
trades on pump.fun ─▶ creator fees land in the creator vault
                         │  (fee watcher polls the vault balance)
                         ▼
                  episode fund fills ── at episodeCostSol ──▶ script is written (live on stream)
                                                                   ▼
                                                     episode renders ─▶ PREMIERE on stream
```

## Run it

```bash
npm install
cp coin.config.example.json coin.config.json   # then edit it
npm start
```

- Site: http://localhost:3000. A live production board for the next episode: the fund counting up fee by fee (with Solscan links), pace and estimated time to funded, the script typing out as it's written, storyboard frames appearing scene by scene, render progress, then the premiere. Everything updates over server-sent events, plus a live viewer count.
- Stream scene: http://localhost:3000/stream (1920×1080). Add `?layout=portrait` for 1080×1920, or `?voice=1` to read captions aloud.

To try the loop without real fees, run `DEV_TOOLS=1 npm start` and use the **Add fees** box on the site. Add `DEV_SIM_FEES=1` for a steady trickle of fake trades.

## Hosting

It's one long-running Node process (fee watcher + live updates), so host it somewhere that keeps a server up: Railway, Render, Fly.io, or any VPS. A `Dockerfile` is included. Mount `/app/data` as a volume so episodes survive restarts, and put your `coin.config.json` in the image or mount it. Serverless hosts like Vercel aren't a good fit as-is.

## Interactive episodes: viewers vote

While the fund fills, a poll runs: "What happens in episode N?" with three options.
- **pump.fun chat:** the server reads the coin's livestream chat (`lib/pumpchat.js`) and counts `A`, `B`, `C`, `!vote B` or `vote c`. One vote per wallet; a new vote replaces the old one.
- **Website:** one vote per browser, in the "Vote on the next episode" panel.
- Both are shown live on the site and on the stream overlay with bars and a "fan5 voted A" ticker.
- When the fund fills, the poll locks, the winner becomes the premise of the episode (Claude builds the whole script around it; the template writer puts it in lines 1, 4 and 6), and a new poll opens.

The chat reader talks to pump.fun's undocumented chat service the way the open-source clients do. It needs `mint` in `coin.config.json` and can break if pump.fun changes the service; the site keeps working with website votes. Set `PUMP_CHAT=0` to turn it off. Test it without a stream: `DEV_TOOLS=1 npm start` and `POST /api/dev/chat {"text":"A","wallet":"w1"}`.

Poll options come from a built-in list for now (`lib/votes.js` `IDEAS`); with `ANTHROPIC_API_KEY` set, the next step is to have Claude propose three options that continue the story.

## coin.config.json

| Field | What it is |
|---|---|
| `name`, `ticker`, `mint` | Your pump.fun coin. `mint` is the contract address. |
| `creatorWallet` | The wallet that created the coin. The bonding-curve creator vault is derived from it. |
| `feeVaults` | Optional: exact vault addresses to watch instead. After the coin graduates, add the PumpSwap creator-fee account here. |
| `town`, `facts` | The story bible. Every episode builds on these three facts. |
| `episodeCostSol` | How much in fees buys one episode. |
| `countExistingFees` | `true` to count fees already sitting in the vault when the server first starts. |

**How fees are counted:** the watcher polls the vault's SOL balance. A rise is new fees. A drop is you claiming, and it's ignored. So you can claim your creator fees whenever you want and the show doesn't lose an episode. Check the vault address the server prints at startup against your coin's creator-fee account on Solscan.

Set `SOLANA_RPC_URL` to a private RPC (Helius, Triton, …). The public endpoint rate-limits.

## Scripts (Claude)

Set `ANTHROPIC_API_KEY` and each episode script is written by Claude (`claude-opus-5-5`; override with `SCRIPT_MODEL`). It gets the town facts and earlier episode titles, so the story continues. Without a key, a built-in template writes the scripts.

## Running the whole show, 24/7

```
docker compose up -d
```

Two containers:
- **web**: the site, the live board, the fee watcher, the chat vote reader and the episode pipeline.
- **streamer**: a headless Chromium renders `/stream` at 1920x1080 on a virtual display and ffmpeg pushes it, with sound, to pump.fun over RTMP. It restarts itself if anything dies. No OBS, no PC.

Put your keys in `.env` (copy `.env.example`): Higgsfield, ElevenLabs, Anthropic, a Solana RPC, and the pump.fun RTMP URL and stream key (coin page → Start Livestream → Generate RTMP Credentials). Host it anywhere that runs Docker and stays on: a $10–20/month VPS (Hetzner, DigitalOcean) is enough; the streamer wants about 2 vCPU for 1080p30. The stream needs about 5 Mbit/s up.

The automated episode pipeline, for every funded episode:
1. The winning vote becomes the premise; Claude writes the 7-scene script (template fallback).
2. For each scene, Higgsfield makes one keyframe (GPT Image Sunburst, with the cast sheet and reference thumbnail attached) and one clip (Seedance 2.5 reference-to-video from that keyframe), four scenes at a time.
3. ElevenLabs narrates each line in the show's voice.
4. ffmpeg assembles clips, narration, one-word captions and the music loop into `data/episodes/<id>/episode.mp4`, served at `/episodes/<id>.mp4`.
5. The stream premieres it with sound, the site adds it with a download button, and the next vote opens.

At 480p, an episode costs about 7 × (2 image + 12 video) ≈ 100 Higgsfield credits plus a few cents of ElevenLabs. If a render fails the episode airs as the built-in preview reel and nothing is retried.

**The narrator voice in ElevenLabs:** the show's voice was cloned from `reference/reference-clip.mp4`. Make the same clone in your ElevenLabs account (Voices → Add → Instant Voice Clone, upload the clip's voice track, name it "In My Town narrator") and put its voice ID in `ELEVENLABS_VOICE_ID`. Until then episodes have captions and music but no narration.

## Going live on pump.fun

1. Open your coin on pump.fun → **Start Livestream** → **Generate RTMP Credentials**. That gives you an RTMP URL and a stream key. Keep the key private.
2. In OBS: **Settings → Stream → Service: Custom**, then paste the URL and the key.
3. Add the scene:
   - **Browser Source** → `http://localhost:3000/stream`, 1920×1080. This is easiest, but browser voiceover may not reach OBS.
   - With voice: open `http://localhost:3000/stream?voice=1` in Chrome and use **Window Capture** plus **Desktop Audio**.
4. Click **Start Streaming**. The scene loops episodes, shows the fund filling in real time, types each new script out live, then plays a PREMIERE card for the new episode.

If you need the stream running 24/7, run OBS on a cloud VM.

## Higgsfield (real AI video)

Set `VIDEO_PROVIDER=higgsfield` with `HF_API_KEY_ID` and `HF_API_KEY_SECRET` from console.higgsfield.ai (the API is billed separately from the app subscription). `lib/higgsfield.js` follows the documented API: `Authorization: Key id:secret`, submit then poll `status_url`, uploads through `/files/generate-upload-url`.

| Env | Default | |
|---|---|---|
| `HF_IMAGE_MODEL` | `marketing-studio/image/sunburst` | Keyframes, with reference images |
| `HF_VIDEO_MODEL` | `bytedance/seedance-2.5/reference-to-video` | Clips from keyframe + cast sheet |
| `HF_RESOLUTION` | `480p` | `480p` ≈ 3 credits/s, `720p` ≈ 7, `1080p` ≈ 16 |
| `HF_DURATION` | per line | Seconds per clip (4–30) |
| `HF_PARALLEL` | `2` | Scenes generated at once |

Tested end to end against a stand-in of the documented API, not against the live service yet; the first real episode is the live test.

## Video quality: preview vs. real renders

- `VIDEO_PROVIDER=preview` (default): episodes render live in the browser as blocky-town reels with captions. It costs nothing and is good enough to start streaming. On the site, **Download video** saves a 9:16 `.webm` you can post to TikTok, Reels or Shorts (no audio, so add a voiceover in CapCut).
- `VIDEO_PROVIDER=webhook`: each funded episode is POSTed to `VIDEO_WEBHOOK_URL` with a text-to-video prompt per scene plus the narration. Your render worker (any AI video model + TTS) calls back:
  `POST /api/episodes/:id/complete` with `{ "videoUrl": "https://…" }` and the header `x-callback-secret: $VIDEO_CALLBACK_SECRET`.
  The stream then plays the real video. While it renders, the worker can report progress with
  `POST /api/episodes/:id/progress` and `{ "progress": 0.42 }` (same header), and the site shows it live.

## Notes

- Episodes use a generic blocky game art style. Don't use a game company's name, logo or assets in the videos or the branding.
- State is stored in `data/db.json`.
