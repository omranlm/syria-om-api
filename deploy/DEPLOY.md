# Production server (DigitalOcean VPS)

`https://organicmaps.openstreetmap.sy` on a DigitalOcean droplet (Ubuntu 24.04, 1 vCPU, 512 MB RAM + 1 GB swap,
134.209.100.128), without Docker: the droplet is too small for it.

| URL | What | Served by |
|---|---|---|
| `/` | Website and privacy policy (`Syria/website/` of the app repo) | nginx, `/var/www/organicmaps-site` |
| `/api/` | This API (`/api/admin/` = dashboard) | `syria-om-api.service` on 127.0.0.1:3000, nginx strips `/api` |
| `/mapdata/` | Map files for the app (`data_version.json`, `maps/<v>/`, `terrain/<v>/`) | nginx, `/opt/syria-om-api/maps-pipeline/out` |

HTTP redirects to HTTPS (Let's Encrypt, renewed by `certbot.timer`). `ufw` allows only 22, 80 and 443.

## Layout on the server

- `/opt/syria-om-api`: clone of this repository, owned by the system user `syriaom` (folders private except the
  path nginx needs to reach `maps-pipeline/out`). `.env` is mode 600.
- PostgreSQL 16 + PostGIS from Ubuntu, database `syriaom` owned by the role `syriaom`, local connections only.
  Migrations run when the API starts.
- `/root/syria-om-credentials.txt` (root only): database password, JWT secret, dashboard admin phone and password.
- `syria-maps-update.timer`: monthly Organic Maps map update (see `maps-pipeline/README.md`).

## Updating the API

```bash
ssh syria-vps
cd /opt/syria-om-api
sudo -u syriaom git pull --ff-only
sudo -u syriaom npm ci --no-audit --no-fund && sudo -u syriaom npm run build && sudo -u syriaom npm prune --omit=dev
systemctl restart syria-om-api
curl -s http://127.0.0.1:3000/health
journalctl -u syria-om-api -n 30
```

Updating the website: copy `Syria/website/*.html` of the app repo to `/var/www/organicmaps-site/`.

## App downloads (until the app is on Google Play)

`/var/www/organicmaps-site/apps/` holds the two release APKs, served at
`https://organicmaps.openstreetmap.sy/apps/SyriaOrganicMaps-google.apk` and `…-huawei.apk` (the website's
"تنزيل التطبيق" buttons), and `version.json`, which the app reads to show "New version available" on APK installs.
Publish every release from the app repo, after building the public Google and Huawei release APKs:

```bash
python Syria/publish_release.py Syria/dist/<google>.apk Syria/dist/<huawei>.apk   --notes-ar "…" --notes-en "…" [--min-google CODE --min-huawei CODE]
```

It uploads the APKs first and `version.json` last; `--min-*` makes the update required below that version code.
Installs from Google Play use Play's own update prompt instead.

## Setting it up again from scratch

1. Swap (1 GB), Node.js 22 (NodeSource apt repository), `postgresql-16-postgis-3`, `python3-venv`,
   `python3-certbot-nginx`, a system user `syriaom` with home `/opt/syria-om-api`.
2. `CREATE ROLE syriaom LOGIN PASSWORD ...`, `createdb -O syriaom syriaom`, then as the superuser in that database
   `CREATE EXTENSION postgis; CREATE EXTENSION pgcrypto;`.
3. Clone to `/opt/syria-om-api`, build as above, write `.env` from `.env.example` with
   `DATABASE_URL=postgres://syriaom:<password>@127.0.0.1:5432/syriaom`, `ALLOW_FAKE_OTP=false`, strong
   `JWT_SECRET` and `ADMIN_PASSWORD`, the Telegram bot token.
4. `deploy/syria-om-api.service` to `/etc/systemd/system/`, `systemctl enable --now syria-om-api`.
5. Maps: `chmod o+x /opt/syria-om-api /opt/syria-om-api/maps-pipeline`, run
   `sudo -u syriaom maps-pipeline/update-maps.sh` once, mirror the Syria terrain tiles into
   `maps-pipeline/out/terrain/261104/` (names in the app's `data/twm_grid.json`), install the timer.
6. `deploy/nginx-organicmaps.openstreetmap.sy.conf` to `/etc/nginx/sites-available/`, link it in
   `sites-enabled`, then `certbot --nginx -d organicmaps.openstreetmap.sy --redirect`.
7. `ufw allow OpenSSH; ufw allow 80/tcp; ufw allow 443/tcp; ufw enable`.

## Telegram bot

The bot is polled by one API only: the VPS. Remove `TELEGRAM_BOT_TOKEN` from a local development `.env` (or use a
second bot there), otherwise the two compete for the bot's updates.
