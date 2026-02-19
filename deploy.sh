#!/bin/bash
# ─── EVE Elmonitor Deploy Script ─────────────────────────────────────────
# Run from: D:\EVE11\Projects\013_elekto_eu
# Usage (PowerShell): bash deploy.sh   OR   run commands manually
#
# What this does:
#   1. Syncs app code to /opt/elmonitor/app
#   2. Syncs canonical data to /opt/elmonitor/data
#   3. Builds Next.js on server
#   4. Restarts PM2 process
#
# What this does NOT do:
#   - Touch any other app on the server
#   - Modify nginx config (done once manually)
#   - Delete anything outside /opt/elmonitor

SERVER="ubuntu@185.20.15.189"
SSH_KEY="~/.ssh/id_ed25519"
REMOTE_DIR="/opt/elmonitor"

echo "═══ EVE Elmonitor Deploy ═══"
echo "Target: $SERVER:$REMOTE_DIR"
echo ""

# ─── 1. Sync app code ────────────────────────────────────────────────────
echo "[1/4] Syncing app code..."
rsync -avz --delete \
  -e "ssh -i $SSH_KEY" \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.git' \
  --exclude 'data' \
  --exclude 'manifests' \
  --exclude '__pycache__' \
  --exclude '.venv' \
  --exclude '*.pyc' \
  ./ "$SERVER:$REMOTE_DIR/app/"

# ─── 2. Sync canonical data ──────────────────────────────────────────────
echo ""
echo "[2/4] Syncing canonical data (this may take a while first time)..."
rsync -avz \
  -e "ssh -i $SSH_KEY" \
  --exclude '__pycache__' \
  data/canonical/ "$SERVER:$REMOTE_DIR/data/canonical/"

# Also sync config (method_registry.lock.json etc)
rsync -avz \
  -e "ssh -i $SSH_KEY" \
  config/ "$SERVER:$REMOTE_DIR/app/config/"

# Also sync xvault
rsync -avz \
  -e "ssh -i $SSH_KEY" \
  data/xvault/ "$SERVER:$REMOTE_DIR/data/xvault/"

# ─── 3. Build on server ──────────────────────────────────────────────────
echo ""
echo "[3/4] Building on server..."
ssh -i $SSH_KEY $SERVER << 'ENDSSH'
  cd /opt/elmonitor/app/apps/web
  npm install --production=false 2>&1 | tail -5
  npm run build 2>&1 | tail -10
  echo "Build complete."
ENDSSH

# ─── 4. Restart PM2 ──────────────────────────────────────────────────────
echo ""
echo "[4/4] Restarting PM2..."
ssh -i $SSH_KEY $SERVER << 'ENDSSH'
  cd /opt/elmonitor/app/apps/web
  pm2 describe elmonitor > /dev/null 2>&1
  if [ $? -eq 0 ]; then
    pm2 restart elmonitor
  else
    PORT=3060 pm2 start npm --name elmonitor -- start -- --port 3060
  fi
  pm2 save
  echo "PM2 status:"
  pm2 list
ENDSSH

echo ""
echo "═══ Deploy complete ═══"
echo "Check: https://elmonitor.se"
