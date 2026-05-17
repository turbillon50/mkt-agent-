# Goossip · Baileys Bridge

Persistent WhatsApp bridge for Goossip. Lives on a Hetzner VPS as a `pm2` service,
talks to WhatsApp via [Baileys](https://github.com/WhiskeySockets/Baileys), and
forwards every inbound message to Goossip on Vercel via authenticated webhook.

## Architecture

```
WhatsApp servers
      │
      ▼ (WebSocket, multi-file auth)
 services/baileys (Hetzner, pm2)
      │
      │  POST /api/whatsapp/inbound   ← inbound messages (Bearer secret)
      ▼
Goossip on Vercel
      │
      │  POST /send                   ← outbound (Bearer secret)
      ▲
```

The bridge holds **only** the WhatsApp socket + the auth state on local disk.
All conversation data lives in Neon — written by Goossip.

## Endpoints

All endpoints except `/health` require `Authorization: Bearer ${WHATSAPP_BRIDGE_SECRET}`.

| Method | Path | Purpose |
|---|---|---|
| GET  | `/health` | Public liveness (no auth). |
| GET  | `/status` | `{connected, jid, hasQR, uptimeSec}` |
| GET  | `/qr` | `{qr}` — base64 data URL, only present before pairing. |
| POST | `/send` | `{to, message}` — sends to `to@s.whatsapp.net`. |
| POST | `/logout` | Logs the session out (forces fresh QR on next start). |

## Deploy on a fresh Hetzner Ubuntu VPS

```bash
# 1. SSH into the VPS
ssh root@<HETZNER_IP>

# 2. Clone the repo
git clone <REPO_URL> ~/goossip
cd ~/goossip/services/baileys

# 3. Create .env
cp .env.example .env
vim .env
# fill:
#   WHATSAPP_BRIDGE_SECRET=<long random string — same value as Goossip env on Vercel>
#   GOOSSIP_INBOUND_WEBHOOK=https://goossip.vercel.app/api/whatsapp/inbound
#   PORT=3001

# 4. Run the idempotent installer
bash deploy.sh

# 5. Grab the QR
curl -s -H "Authorization: Bearer $WHATSAPP_BRIDGE_SECRET" \
  http://127.0.0.1:3001/qr | jq -r .qr | sed 's/data:image\/png;base64,//' | base64 -d > /tmp/qr.png
# scp /tmp/qr.png you@local:/tmp/  ← then open it and scan
#
# OR open https://goossip.vercel.app/whatsapp once the bridge is reachable from
# Vercel — the dashboard polls /qr and renders it.
```

## Exposing it to Vercel

You have three sane options:

1. **Public domain + Caddy reverse proxy (recommended).**
   ```bash
   sudo apt install -y caddy
   sudo tee /etc/caddy/Caddyfile <<'EOF'
   wa.your-domain.com {
     reverse_proxy 127.0.0.1:3001
   }
   EOF
   sudo systemctl reload caddy
   ```
   Then on Vercel: `WHATSAPP_BRIDGE_URL=https://wa.your-domain.com`.

2. **Plain IP:PORT over HTTP** (fine for a quick start, but the Bearer secret travels in cleartext).
   `WHATSAPP_BRIDGE_URL=http://<HETZNER_IP>:3001`
   Open the port: `sudo ufw allow 3001/tcp`.

3. **Tailscale / Cloudflare Tunnel** — zero-trust private mesh, no public port. Best for prod.

## Operations

```bash
pm2 status                   # see if it's running
pm2 logs baileys-goossip     # follow logs
pm2 reload baileys-goossip   # zero-downtime restart after pulling new code
pm2 restart baileys-goossip  # hard restart
pm2 stop baileys-goossip     # stop
pm2 save                     # persist current process list (for boot)
pm2 startup                  # generate the boot snippet (run as root if asked)
```

## Re-pairing the WhatsApp account

```bash
pm2 stop baileys-goossip
rm -rf services/baileys/sessions
pm2 start baileys-goossip
# scan the new QR from the dashboard
```

## Updating the bridge

```bash
cd ~/goossip
git pull
cd services/baileys
npm ci && npm run build
pm2 reload baileys-goossip --update-env
```
