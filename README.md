# Syria Organic Maps API

Backend for the Syria Organic Maps app: phone/OTP login, offline tracking sync, user activity log,
admin dashboard and the static map server. LoopBack 4 + PostgreSQL/PostGIS, packaged with Docker Compose.

## Run locally

```bash
cp .env.example .env            # edit JWT_SECRET and ADMIN_PASSWORD before any real deployment
docker compose up -d --build    # api on :3000, PostGIS on host port :5433, map server on :8080
curl http://localhost:3000/health
```

- OpenAPI explorer: http://localhost:3000/explorer
- Admin dashboard: http://localhost:3000/admin/ (login with `ADMIN_PHONE` / `ADMIN_PASSWORD` from `.env`)
- Fake SMS: with `SMS_PROVIDER=fake` no SMS is sent, the code is printed in the API log and
  `FAKE_OTP_CODE` (default `123456`) is always accepted.

Phones on the same Wi-Fi reach the API at `http://<PC LAN IP>:3000` and maps at `http://<PC LAN IP>:8080/`.

## Development without Docker for the API

```bash
docker compose up -d db
npm install
npm run build && npm start      # applies migrations, seeds the admin, starts on :3000
npm test                        # unit tests + integration tests (skipped when the DB is unreachable)
```

## API overview

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /auth/otp/request` `{phone}` | – | send a code (default country SY, so `0944…` works) |
| `POST /auth/otp/verify` `{phone, code, device}` | – | returns access + refresh tokens and the user |
| `POST /auth/refresh`, `POST /auth/logout` | – | rotate / revoke the refresh token |
| `POST /auth/admin/login` `{phone, password}` | – | admin token for the dashboard |
| `GET /me`, `PATCH /me` | user | profile and totals |
| `POST /sync/batch` | user | offline outbox upload (sessions, segments, points, events); idempotent by UUID |
| `GET /sessions`, `/sessions/{id}`, `/sessions/{id}/geojson`, `/sessions/{id}/points` | user | own history |
| `GET /admin/stats`, `/admin/users`, `/admin/sessions`, `/admin/activity`, `/admin/sync-batches` | admin | dashboard data |
| `PATCH /admin/users/{id}` | admin | block / unblock, role |

Distances are recomputed on the server from the stored points (`ST_Length` on the per-segment lines)
and kept next to the value the app showed the user (`clientDistanceM`).

## Data model

See `migrations/001_init.sql`. `location_points` is partitioned by month; partitions are created ahead
of time and dropped by the nightly retention job after `RETENTION_YEARS` (default 5). Every client row
has a client-generated UUID so uploads can be retried safely.

## Maps

`maps-pipeline/` builds `Syria.mwm` (plus small World files) from the Geofabrik extract and publishes
them under `maps-pipeline/out/maps/<version>/`, which the `maps` service serves. See
`maps-pipeline/README.md`.
