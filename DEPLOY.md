# Deploying to DigitalOcean (bloxtv.lol)

## 1. Droplet
Ubuntu 24.04, Basic, Regular, **2 vCPU / 4 GB** (about $24/month). Any region close to your viewers.

## 2. DNS at Porkbun (bloxtv.lol → DNS)
Delete the default parked records, then add:

| Type | Host | Answer |
|---|---|---|
| A | (blank) | the droplet's IP |
| CNAME | www | bloxtv.lol |

## 3. On the droplet (DigitalOcean → droplet → Console)
```bash
curl -fsSL https://get.docker.com | sh
git clone https://github.com/apacfunded/bloxtv.git
cd bloxtv
cp .env.example .env
cp coin.config.example.json coin.config.json
nano .env                 # fill in the keys, RTMP_URL and STREAM_KEY
nano coin.config.json     # mint, creatorWallet, town and facts
docker compose up -d --build
```

Open https://bloxtv.lol. The first load can take a minute while the certificate is issued.

## Everyday commands (run inside `bloxtv/`)
```bash
docker compose logs -f web         # show logic, fees, votes, episode pipeline
docker compose logs -f streamer    # the pump.fun stream
git pull && docker compose up -d --build   # update to the latest code
docker compose restart streamer    # restart just the stream
```

## Firewall
Allow ports 22, 80 and 443 only. In DigitalOcean: Networking → Firewalls → inbound SSH, HTTP, HTTPS.

## Launch day checklist (run inside `bloxtv/`)

Before launch, with nothing rendering:

1. **Test the stream picture and sound** (records 20 s of the stream overlay to a file, no stream key needed):
   ```bash
   docker compose run --rm -e SELFTEST_SECONDS=20 streamer
   ```
   Then open `https://bloxtv.lol/episodes/stream-test.mp4`. You should see the overlay with the vote card and hear sound if an episode is playing.
2. **Wipe the test episodes** so the story starts at chapter 1:
   ```bash
   docker compose exec web node -e 'fetch("http://localhost:3000/api/admin/reset",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({confirm:"RESET"})}).then(r=>r.json()).then(console.log)'
   ```

Launch:

3. **Create the coin on pump.fun.** Copy the coin's mint address (from the coin page URL) and the wallet you created it with.
4. **Put them in `coin.config.json`:**
   ```bash
   nano coin.config.json
   ```
   Set `"mint"` and `"creatorWallet"`, save (Ctrl+O, Enter, Ctrl+X). Then restart the site:
   ```bash
   docker compose up -d --build web && docker compose logs web --since 1m
   ```
   The log should say the fee watcher is on and `[chat] joined <mint>`.
5. **Get the stream key.** On the coin's pump.fun page: Start Livestream → Generate RTMP credentials. Put both in `.env`:
   ```bash
   nano .env
   ```
   Set `RTMP_URL=` and `STREAM_KEY=`, save, then start the stream:
   ```bash
   docker compose up -d --build streamer && docker compose logs -f streamer
   ```
   Within a minute the pump.fun page shows the stream. Press Ctrl+C to stop watching the log (the stream keeps running).
6. **Check the loop.** Make a trade; the fee shows on the Live page within a minute. Type `A` in the pump.fun chat; the vote count moves on the stream and the site.

If something breaks: `docker compose logs web --since 10m` shows the site, `docker compose logs streamer --since 10m` the stream. `docker compose restart streamer` restarts just the stream.
