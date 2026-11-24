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

## Going live on pump.fun

1. Open your coin on pump.fun → **Start Livestream** → **Generate RTMP Credentials**. That gives you an RTMP URL and a stream key. Keep the key private.
2. In OBS: **Settings → Stream → Service: Custom**, then paste the URL and the key.
3. Add the scene:
   - **Browser Source** → `http://localhost:3000/stream`, 1920×1080. This is easiest, but browser voiceover may not reach OBS.
   - With voice: open `http://localhost:3000/stream?voice=1` in Chrome and use **Window Capture** plus **Desktop Audio**.
4. Click **Start Streaming**. The scene loops episodes, shows the fund filling in real time, types each new script out live, then plays a PREMIERE card for the new episode.

If you need the stream running 24/7, run OBS on a cloud VM.

## Higgsfield (real AI video)

```bash
VIDEO_PROVIDER=higgsfield HF_API_KEY_ID=... HF_API_KEY_SECRET=... npm start
```

Get the key pair at console.higgsfield.ai. The API is billed separately from the app subscription, so add a balance there. For each funded episode, every scene becomes one 9:16 text-to-video clip, and all clips are generated in parallel. The site shows render progress live as clips finish. The stream and site play the clips back to back with the captions on top.

| Env | Default | |
|---|---|---|
| `HF_MODEL_PATH` | `bytedance/seedance-2.0/text-to-video` | Model endpoint path |
| `HF_DURATION` | `5` | Seconds per scene clip |
| `HF_EXTRA_BODY` | none | JSON merged into each request, e.g. `{"resolution":"720p"}` |
| `HF_BASE_URL` | `https://api.higgsfield.ai` | |

**Before the first paid run, check `lib/higgsfield.js` against docs.higgsfield.ai.** It follows Higgsfield's published example (`POST /<model>`, `Authorization: Key id:secret`, then poll the request). The status and result fields are read defensively, but not against the live API. Set `episodeCostSol` so that one episode's fees cover about 7 clips.

If a render fails, the episode still airs as a preview reel, and it isn't retried, so a failure doesn't keep spending credits.

## Video quality: preview vs. real renders

- `VIDEO_PROVIDER=preview` (default): episodes render live in the browser as blocky-town reels with captions. It costs nothing and is good enough to start streaming. On the site, **Download video** saves a 9:16 `.webm` you can post to TikTok, Reels or Shorts (no audio, so add a voiceover in CapCut).
- `VIDEO_PROVIDER=webhook`: each funded episode is POSTed to `VIDEO_WEBHOOK_URL` with a text-to-video prompt per scene plus the narration. Your render worker (any AI video model + TTS) calls back:
  `POST /api/episodes/:id/complete` with `{ "videoUrl": "https://…" }` and the header `x-callback-secret: $VIDEO_CALLBACK_SECRET`.
  The stream then plays the real video. While it renders, the worker can report progress with
  `POST /api/episodes/:id/progress` and `{ "progress": 0.42 }` (same header), and the site shows it live.

## Notes

- Episodes use a generic blocky game art style. Don't use a game company's name, logo or assets in the videos or the branding.
- State is stored in `data/db.json`.
