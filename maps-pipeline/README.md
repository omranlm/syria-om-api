# Syria maps pipeline

Turns the Geofabrik OpenStreetMap extract of Syria into the `.mwm` file the app downloads on first
launch, and publishes it in the layout Organic Maps expects:

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
