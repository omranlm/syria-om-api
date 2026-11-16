# Syria maps pipeline

Turns the Geofabrik OpenStreetMap extract of Syria into the `.mwm` files the app downloads on first
launch, and publishes them in the layout Organic Maps expects:

```
out/
  data_version.json            -> [{"0": 261116}]   (app checks this for new versions)
  countries.json               (copy of the current version's list)
  maps/261116/
    World.mwm  WorldCoasts.mwm  Syria.mwm  countries.json
```

The `maps` service in `docker-compose.yml` serves `out/` on port 8080; the app's `private.h`
(`DEFAULT_URLS_JSON`) points at `http://<server>:8080/`.

## Build the generator image (once per app release)

The generator must be built from the same Organic Maps commit as the app, otherwise the data
format may not match. Takes 30–60 minutes and ~16 GB RAM.

```bash
cd maps-pipeline
docker build -t syria-om-generator --build-arg OM_REF=<commit of the app build> .
```

## Produce a map set

```bash
mkdir -p work out
docker run --rm -v "$PWD/work:/om/work" -v "$PWD/out:/om/out" syria-om-generator
```

Environment variables (`-e NAME=value`):

| Variable | Default | Meaning |
|---|---|---|
| `PLANET_URL` | Geofabrik `asia/syria-latest.osm.pbf` | OSM extract to build from (a Syrian mirror later) |
| `WORLD_SOURCE` | `upstream` | `upstream`: reuse the World/WorldCoasts files from the Organic Maps CDN (downloaded once, cached in `work/`); `build`: generate them from the extract (no sea rendering) |
| `UPSTREAM_VERSION` | `261110` | CDN data version the World files are taken from |
| `COUNTRIES` | `Syria` | Comma separated list of regions from `data/borders/*.poly` |

Each run creates a new version folder named after the build date (`YYMMDD`); the app offers the
update in its Downloader. Old folders can be deleted once no device still refers to them.

Coastlines are skipped (`--skip=Coastline`) because a country extract does not contain closed
coastline rings; with `WORLD_SOURCE=upstream` the sea still renders from the upstream WorldCoasts.
