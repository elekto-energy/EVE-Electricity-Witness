# EVE — Deployment

## Architecture

```
[Browser] → [Caddy :443 auto-SSL] → [Next.js :3000 standalone]
                                          ↓
                                    /app/data/canonical (mounted, read-only)
```

## Prerequisites

- VPS: Ubuntu 24.04 with Docker
- Domain: elmonitor.se pointed to VPS IP (A record)
- SSH access

## DNS Setup

Point these A records to your VPS IP (185.20.15.189):

```
elmonitor.se      A    185.20.15.189
www.elmonitor.se  A    185.20.15.189
```

## First Deploy (on VPS)

```bash
# Clone repo
cd /opt
sudo git clone git@github.com:elekto-energy/EVE-Electricity-Witness.git eve
sudo chown -R ubuntu:ubuntu /opt/eve
cd /opt/eve

# Sync canonical data from local machine (run on YOUR machine, not VPS):
# rsync -avz --progress data/canonical/ ubuntu@185.20.15.189:/opt/eve/data/canonical/
# rsync -avz --progress data/xvault/ ubuntu@185.20.15.189:/opt/eve/data/xvault/
# rsync -avz --progress config/ ubuntu@185.20.15.189:/opt/eve/config/
# rsync -avz --progress manifests/ ubuntu@185.20.15.189:/opt/eve/manifests/

# Build and start
docker compose up -d --build

# Check logs
docker compose logs -f
```

## Push Deploy (after first setup)

```bash
# On VPS
cd /opt/eve
git pull
docker compose up -d --build
```

## Data Sync

Data is NOT in git. Sync separately:

```bash
# From local machine → VPS
rsync -avz --progress data/canonical/ ubuntu@185.20.15.189:/opt/eve/data/canonical/
rsync -avz --progress data/xvault/ ubuntu@185.20.15.189:/opt/eve/data/xvault/
```

## GitHub Actions (automated push deploy)

See `.github/workflows/deploy.yml` — triggers on push to main.
Requires GitHub secret: `VPS_SSH_KEY`

## Monitoring

```bash
# Status
docker compose ps

# Logs
docker compose logs -f web

# Restart
docker compose restart web

# Full rebuild
docker compose up -d --build --force-recreate
```
