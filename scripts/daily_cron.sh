#!/bin/bash
# Daily spot price ingest — runs via cron at 14:00 CET
# Fetches yesterday's spot prices, merges into monthly canonical, rebuilds NDJSON
#
# Crontab entry (CET = UTC+1 winter, UTC+2 summer):
#   0 13 * * * /var/www/elekto-eu/scripts/daily_cron.sh >> /var/log/elekto-ingest.log 2>&1
#
# Note: cron uses UTC. 13:00 UTC = 14:00 CET (winter) / 15:00 CEST (summer)

set -euo pipefail

cd /var/www/elekto-eu

export PATH="/home/ubuntu/.nvm/versions/node/v20.20.0/bin:/home/ubuntu/.npm-global/bin:$PATH"

echo "═══════════════════════════════════════════════"
echo "  DAILY SPOT INGEST — $(date -u '+%Y-%m-%d %H:%M UTC')"
echo "═══════════════════════════════════════════════"

# Run the TypeScript ingest script
npx tsx scripts/daily_spot_ingest.ts --zones SE

echo ""
echo "═══════════════════════════════════════════════"
echo "  COMPLETED — $(date -u '+%Y-%m-%d %H:%M UTC')"
echo "═══════════════════════════════════════════════"
