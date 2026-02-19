# ─── EVE Elmonitor Deploy Script (PowerShell) ────────────────────────────
# Run from: D:\EVE11\Projects\013_elekto_eu
# Usage: .\deploy.ps1
#
# Steps:
#   1. Syncs app code via scp
#   2. Syncs canonical data via scp
#   3. Builds Next.js on server
#   4. Restarts PM2 process

$SERVER = "ubuntu@185.20.15.189"
$KEY = "$env:USERPROFILE\.ssh\id_ed25519"
$REMOTE = "/opt/elmonitor"
$LOCAL = "D:\EVE11\Projects\013_elekto_eu"

Write-Host "=== EVE Elmonitor Deploy ===" -ForegroundColor Cyan
Write-Host "Target: $SERVER`:$REMOTE"
Write-Host ""

# ─── 1. Prepare server directory structure ────────────────────────────────
Write-Host "[1/5] Preparing server directories..." -ForegroundColor Yellow
ssh -i $KEY $SERVER "mkdir -p $REMOTE/app/apps/web $REMOTE/app/packages $REMOTE/app/config $REMOTE/data/canonical $REMOTE/data/xvault"

# ─── 2. Sync app code ────────────────────────────────────────────────────
Write-Host "[2/5] Syncing app code..." -ForegroundColor Yellow

# apps/web (excluding node_modules, .next)
Write-Host "  apps/web..."
scp -i $KEY -r "$LOCAL\apps\web\app" "${SERVER}:$REMOTE/app/apps/web/"
scp -i $KEY -r "$LOCAL\apps\web\components" "${SERVER}:$REMOTE/app/apps/web/"
scp -i $KEY -r "$LOCAL\apps\web\lib" "${SERVER}:$REMOTE/app/apps/web/"
scp -i $KEY -r "$LOCAL\apps\web\public" "${SERVER}:$REMOTE/app/apps/web/"
scp -i $KEY "$LOCAL\apps\web\package.json" "${SERVER}:$REMOTE/app/apps/web/"
scp -i $KEY "$LOCAL\apps\web\tsconfig.json" "${SERVER}:$REMOTE/app/apps/web/"
scp -i $KEY "$LOCAL\apps\web\next.config.js" "${SERVER}:$REMOTE/app/apps/web/"

# packages/evidence
Write-Host "  packages/evidence..."
scp -i $KEY -r "$LOCAL\packages\evidence" "${SERVER}:$REMOTE/app/packages/"

# root package.json
scp -i $KEY "$LOCAL\package.json" "${SERVER}:$REMOTE/app/"

# config
Write-Host "  config..."
scp -i $KEY -r "$LOCAL\config" "${SERVER}:$REMOTE/app/"

# ─── 3. Sync data ────────────────────────────────────────────────────────
Write-Host "[3/5] Syncing canonical data (first time takes ~10 min)..." -ForegroundColor Yellow

$dataFolders = @(
    "timeseries_v2",
    "system_price",
    "entsoe_flows",
    "news",
    "statements",
    "decisions",
    "registries",
    "fx"
)

foreach ($folder in $dataFolders) {
    $localPath = "$LOCAL\data\canonical\$folder"
    if (Test-Path $localPath) {
        Write-Host "  data/canonical/$folder..."
        ssh -i $KEY $SERVER "mkdir -p $REMOTE/data/canonical/$folder"
        scp -i $KEY -r "$localPath\*" "${SERVER}:$REMOTE/data/canonical/$folder/" 2>$null
    }
}

# xvault
if (Test-Path "$LOCAL\data\xvault") {
    Write-Host "  data/xvault..."
    scp -i $KEY -r "$LOCAL\data\xvault\*" "${SERVER}:$REMOTE/data/xvault/" 2>$null
}

# ─── 4. Build on server ──────────────────────────────────────────────────
Write-Host "[4/5] Building on server..." -ForegroundColor Yellow
ssh -i $KEY $SERVER @"
  cd $REMOTE/app/apps/web
  
  # Symlink data so the app finds it at ../../data
  ln -sfn $REMOTE/data $REMOTE/app/data
  
  npm install 2>&1 | tail -5
  npm run build 2>&1 | tail -10
  echo 'Build complete.'
"@

# ─── 5. Start/Restart PM2 ────────────────────────────────────────────────
Write-Host "[5/5] Starting PM2..." -ForegroundColor Yellow
ssh -i $KEY $SERVER @"
  cd $REMOTE/app/apps/web
  pm2 describe elmonitor > /dev/null 2>&1
  if [ \`$? -eq 0 ]; then
    pm2 restart elmonitor
  else
    PORT=3060 pm2 start npm --name elmonitor -- start -- --port 3060
  fi
  pm2 save
  pm2 list
"@

Write-Host ""
Write-Host "=== Deploy complete ===" -ForegroundColor Green
Write-Host "Next: setup nginx + SSL (one-time)"
