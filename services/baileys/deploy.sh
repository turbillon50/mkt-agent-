#!/usr/bin/env bash
#
# Idempotent deploy of the Goossip Baileys bridge on a fresh Hetzner Ubuntu VPS.
# Usage (as the target user, e.g. root or a non-root with sudo):
#   curl -fsSL https://raw.githubusercontent.com/<repo>/services/baileys/deploy.sh | bash
# Or, after cloning:
#   bash services/baileys/deploy.sh
#
# Requires: a non-empty .env in services/baileys/ (use .env.example as template).

set -euo pipefail

REPO_URL="${REPO_URL:-}"
APP_USER="${APP_USER:-$(id -un)}"
APP_DIR="${APP_DIR:-$HOME/goossip}"
SERVICE_DIR="$APP_DIR/services/baileys"
NODE_MAJOR="${NODE_MAJOR:-20}"

bold() { printf "\033[1m%s\033[0m\n" "$*"; }

bold "==> 1/6 OS packages (curl, git, build-essential, ca-certificates)"
sudo apt-get update -y
sudo apt-get install -y curl git build-essential ca-certificates gnupg

if ! command -v node >/dev/null 2>&1 || ! node -v | grep -qE "^v${NODE_MAJOR}\."; then
  bold "==> 2/6 Installing Node.js ${NODE_MAJOR} LTS"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
else
  bold "==> 2/6 Node.js $(node -v) already installed"
fi

if ! command -v pm2 >/dev/null 2>&1; then
  bold "==> 3/6 Installing pm2 globally"
  sudo npm install -g pm2
else
  bold "==> 3/6 pm2 $(pm2 -v) already installed"
fi

if [ ! -d "$APP_DIR/.git" ]; then
  if [ -z "$REPO_URL" ]; then
    bold "==> 4/6 No REPO_URL set and $APP_DIR is not a git repo."
    echo "    Either:"
    echo "      A) export REPO_URL=git@github.com:turbillon50/mkt-agent-.git && rerun"
    echo "      B) git clone <repo> $APP_DIR manually, then rerun this script."
    exit 1
  fi
  bold "==> 4/6 Cloning $REPO_URL into $APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
else
  bold "==> 4/6 Updating $APP_DIR"
  git -C "$APP_DIR" fetch --all
  git -C "$APP_DIR" pull --ff-only || echo "    (skipping ff pull; manual merge required)"
fi

cd "$SERVICE_DIR"

if [ ! -f .env ]; then
  bold "!! Missing $SERVICE_DIR/.env — copy .env.example and fill in WHATSAPP_BRIDGE_SECRET + GOOSSIP_INBOUND_WEBHOOK"
  cp -n .env.example .env
  echo "    Created $SERVICE_DIR/.env from template. Edit it and rerun."
  exit 1
fi

bold "==> 5/6 Installing deps and building"
npm ci
npm run build

mkdir -p logs sessions

bold "==> 6/6 (Re)starting pm2 process"
if pm2 describe baileys-goossip >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

if ! pm2 startup | tail -1 | grep -q "already"; then
  bold "==> Run the line printed above as root to enable pm2 on boot."
fi

bold "==> Done."
echo ""
echo "Bridge listening on port $(grep -E '^PORT=' .env | cut -d= -f2 || echo 3001)"
echo "Health (public, no auth):  curl http://127.0.0.1:3001/health"
echo "Status (auth required):    curl -H 'Authorization: Bearer <SECRET>' http://127.0.0.1:3001/status"
echo ""
echo "pm2 status:"
pm2 status
