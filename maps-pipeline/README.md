# Syria maps pipeline

Publishes the map files the app downloads, in the layout Organic Maps expects. In production they are the
Organic Maps ones, refreshed monthly (see "Monthly update from Organic Maps" below); `run.sh` can instead build
`Syria.mwm` from the Geofabrik OpenStreetMap extract (parked for now):

```
out/
  data_version.json            -> [{"0": 261116}]   (app checks this for new versions)
  countries.json               (copy of the current version's list)
  maps/261116/
    World.mwm  WorldCoasts.mwm  Syria.mwm  countries.json
```

The `maps` service in `docker-compose.yml` serves `out/` on port 8080; the app's `private.h`
(`DEFAULT_URLS_JSON`) points at `http://<server>:8080/` for both maps and terrain.

Terrain (contour lines, altitudes) is optional: the app asks for `terrain/<v>/<tile>.twm` where `v`
and the tile grid come from the app's `data/twm_grid.json`. The seven tiles covering Syria were
mirrored from `https://cdn.organicmaps.app/terrain/261104/` into `out/terrain/261104/`; without
them the app keeps retrying the download, which is harmless but noisy.

An `.mwm` built with a generator from another Organic Maps commit may not load: a Syria.mwm built
elsewhere (80 MB) crashed the app in its `idx` section although it carried the same format number.
Only use files built by this pipeline (same commit as the app) or taken from the Organic Maps CDN.

`World.mwm` (country borders and names at low zoom, so people see where they are and can pan to
Syria) and `WorldCoasts.mwm` (sea) are taken from the Organic Maps CDN and published next to
`Syria.mwm`. The app can also run without them (`WORLD_SOURCE=none`): the storage code skips
World files that are not listed in `countries.json`.

## Monthly update from Organic Maps (production)

The maps we publish are the Organic Maps ones: `update-maps.sh` (→ `update_from_om.py`) checks once a
month whether Organic Maps released newer map data, and if so:

1. reads the newest version from `data/countries.json` on the Organic Maps master branch (the CDN's own
   `data_version.json` is stale);
2. downloads `World.mwm`, `WorldCoasts.mwm` and `Syria.mwm` of that version from `cdn.organicmaps.app` (one
   ~160 MB download per month for the server; phones download from our server only) and checks the size and
   blake3 hash of each against the CDN's `countries.json`;
3. publishes `out/maps/<v>/` with a `countries.json` listing only those files, then bumps `out/countries.json`
   and `out/data_version.json`. Phones see the update the next time the map opens ("Update all", ~160 MB);
4. deletes old version folders, keeping the newest 4 (`KEEP_VERSIONS`) and the versions in
   `pinned-versions.txt`: those bundled in released APKs, which a fresh install downloads on its first start.
   **Add the bundled version (`data/countries.json` "v" in the app repo) of every released APK there.**

Safety check: a map stores its feature types as positions in Organic Maps' `data/types.txt`. If the upstream
list differs from `app-types.txt` (a copy of the app's `data/types.txt`), the new version is downloaded but not
published (exit code 3, "NOT PUBLISHED" in the log). Release an app built from newer Organic Maps code first,
copy its `data/types.txt` to `app-types.txt`, and run the script again (`--publish-anyway` skips the check).

Manual runs: `./update-maps.sh --dry-run` (only report), `./update-maps.sh --version 261110`
(publish a given version). Exit codes: 0 published or up to date, 1 error, 3 not published (types differ).

### Monthly update on the server (Ubuntu VPS)

```bash
# Once: a user that owns the published folder, Python and the repo in /opt/syria-om-api
sudo apt install -y python3-venv
sudo useradd --system --home /opt/syria-om-api syriaom
sudo chown -R syriaom: /opt/syria-om-api/maps-pipeline
sudo timedatectl set-timezone Asia/Damascus

# First run by hand (creates .venv with blake3 and publishes the newest version)
sudo -u syriaom /opt/syria-om-api/maps-pipeline/update-maps.sh

# Monthly timer: first Friday of the month, 03:00 (+ up to 30 min); catches up after downtime
sudo cp /opt/syria-om-api/maps-pipeline/systemd/syria-maps-update.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now syria-maps-update.timer
systemctl list-timers syria-maps-update.timer     # next run
journalctl -u syria-maps-update.service -n 50     # log of the last runs
```

Without systemd, a cron line on the 1st of each month: `0 3 1 * * /opt/syria-om-api/maps-pipeline/update-maps.sh
>> /var/log/syria-maps-update.log 2>&1`.

## Important: the app's bundled files must match

The app ships two files from the Organic Maps repo that must describe the same set of countries as
the server:

- `data/countries.json`: its `v` is the version folder used for the first-launch download.
  After publishing a new version, copy `out/countries.json` over it before building the next APK,
  and keep every `maps/<version>/` folder that a shipped APK still refers to.
- `data/twm_grid.json`: the terrain tile grid. It must only name published countries (a terrain
  tile that also covers a neighbour makes the app abort when it reports that neighbour). Produce it
  with `python make_twm_grid.py out/countries.json > <organicmaps>/data/twm_grid.json`; the tiles
  it lists are the ones to mirror into `out/terrain/<v>/`.
- `data/packed_polygons.bin`: the country borders used to tell which map the user is in. It must
  only contain the published countries (a world-wide file makes the app abort as soon as the map
  is centred outside them). `run.sh` writes `out/packed_polygons.bin`; for a hand-made set:

  ```bash
  MSYS_NO_PATHCONV=1 docker run --rm --name pb --entrypoint sh syria-om-generator -c \
    'mkdir -p /tmp/d/borders && cp /om/organicmaps/data/borders/Syria.poly /tmp/d/borders/ && \
     /om/build/generator_tool --data_path=/tmp/d --user_resource_path=/om/organicmaps/data --generate_packed_borders=true' \
    && docker cp pb:/tmp/d/packed_polygons.bin <organicmaps>/data/packed_polygons.bin
  ```
  (omit `--rm` and add `docker rm pb` after the copy, as `docker cp` needs the stopped container).

## Build the generator image (once per app release)

The generator must be built from the same Organic Maps commit as the app, otherwise the data
format may not match. Takes 30–60 minutes and ~16 GB RAM.

```bash
cd maps-pipeline
docker build -t syria-om-generator --build-arg OM_REPO=<fork url> --build-arg OM_REF=<commit of the app build> .
```

## Produce a map set

```bash
./run.sh                      # Geofabrik -> out/maps/<YYMMDD>/Syria.mwm (about 40 min)
./run.sh -e WORLD_SOURCE=upstream
```

`run.sh` handles the Docker bind-mount path on Windows (Git Bash rewrites `/c/...` paths, which
silently drops the mount; the script passes `C:/...` paths with `MSYS_NO_PATHCONV=1`).

Environment variables (`-e NAME=value`):

| Variable | Default | Meaning |
|---|---|---|
| `PLANET_URL` | Geofabrik `asia/syria-latest.osm.pbf` | OSM extract to build from (a Syrian mirror later) |
| `WORLD_SOURCE` | `upstream` | `upstream`: World/WorldCoasts from the Organic Maps CDN (cached in `work/`); `none`: country maps only; `build`: generate them from the extract (no sea rendering) |
| `UPSTREAM_VERSION` | `261110` | CDN data version the World files are taken from |
| `COUNTRIES` | `Syria` | Comma separated list of regions from `data/borders/*.poly` |

Each run creates a new version folder named after the build date (`YYMMDD`); the app offers the
update in its Downloader. Old folders can be deleted once no device still refers to them.

## Publishing an .mwm built elsewhere

Put `Syria.mwm` (plus `World.mwm` and `WorldCoasts.mwm` from `work/world-<v>/`) in a new
`out/maps/<version>/` folder and regenerate the lists from the host:

```bash
PYTHONUTF8=1 PYTHONPATH=<organicmaps>/tools/python python make_countries.py <organicmaps> out/maps/<version> <version> > out/maps/<version>/countries.json
echo '[{"0": <version>}]' > out/data_version.json
cp out/maps/<version>/countries.json out/countries.json
```

(`pip install blake3` once; `make_countries.py` reads `countries.upstream.json` next to it.)

Coastlines are skipped (`--skip=Coastline`) because a country extract does not contain closed
coastline rings; with `WORLD_SOURCE=upstream` the sea still renders from the upstream WorldCoasts.
