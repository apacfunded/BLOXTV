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
