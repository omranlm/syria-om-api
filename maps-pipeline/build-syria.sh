#!/usr/bin/env bash
# Builds Syria.mwm from the Geofabrik extract and publishes a complete map set
# (World + WorldCoasts + Syria + countries.json + data_version.json) under /om/out.
#
# Environment:
#   PLANET_URL        OSM extract (default: Geofabrik syria-latest.osm.pbf)
#   WORLD_SOURCE      where World.mwm/WorldCoasts.mwm come from:
#                       "upstream" (default) downloads them once from the Organic Maps CDN,
#                       "build" generates them from the extract (no coastlines: sea is not drawn).
#   UPSTREAM_CDN      base URL used for WORLD_SOURCE=upstream (default: https://cdn.organicmaps.app)
#   UPSTREAM_VERSION  data version folder on the CDN to take the World files from (default: 261110)
#   COUNTRIES         countries to build (default: Syria)
set -euo pipefail

OM=/om/organicmaps
WORK=/om/work
OUT=/om/out
PLANET_URL="${PLANET_URL:-https://download.geofabrik.de/asia/syria-latest.osm.pbf}"
WORLD_SOURCE="${WORLD_SOURCE:-upstream}"
UPSTREAM_CDN="${UPSTREAM_CDN:-https://cdn.organicmaps.app}"
UPSTREAM_VERSION="${UPSTREAM_VERSION:-261110}"
COUNTRIES="${COUNTRIES:-Syria}"

mkdir -p "$WORK" "$OUT/maps"
cd "$OM/tools/python/maps_generator"

cat > var/etc/map_generator.ini <<EOF
[Developer]
OMIM_PATH: $OM
BUILD_PATH: /om/build

[Main]
DEBUG: 0
MAIN_OUT_PATH: $WORK/maps_build

[Generator tool]
USER_RESOURCE_PATH: $OM/data
THREADS_COUNT_FEATURES_STAGE: 0

[Osm tools]
OSM_TOOLS_PATH: /om/osmctools
OSM_TOOLS_SRC_PATH: $OM/tools/osmctools

[Logging]
LOG_FILE_PATH: $WORK/maps_build/generation.log

[External]
PLANET_URL: $PLANET_URL
PLANET_MD5_URL: $PLANET_URL.md5
NEED_BUILD_WORLD_ROADS: false

[Stages]
NEED_PLANET_UPDATE: 0
DATA_ARCHIVE_DIR: $OM/data
DIFF_VERSION_DEPTH: 2

[Common]
THREADS_COUNT: 0

[Stats]
STATS_TYPES_CONFIG: $OM/tools/python/maps_generator/var/etc/stats_types_config.txt
EOF

echo "==> Generating: $COUNTRIES from $PLANET_URL"
cd "$OM/tools/python"
if [ "$WORLD_SOURCE" = "build" ]; then
  /om/venv/bin/python -m maps_generator --countries="World, WorldCoasts, $COUNTRIES" --skip="Coastline"
else
  /om/venv/bin/python -m maps_generator --countries="$COUNTRIES" --skip="Coastline"
fi

# The newest build directory holds <version>/<Country>.mwm.
BUILD_DIR=$(ls -d "$WORK"/maps_build/*/ | grep -v logs | sort | tail -1)
VERSION=$(basename "$(ls -d "$BUILD_DIR"/[0-9]*/ | tail -1)")
MWM_DIR="$BUILD_DIR/$VERSION"
echo "==> Built version $VERSION in $MWM_DIR"

if [ "$WORLD_SOURCE" != "build" ]; then
  CACHE="$WORK/world-$UPSTREAM_VERSION"
  mkdir -p "$CACHE"
  for f in World.mwm WorldCoasts.mwm; do
    if [ ! -s "$CACHE/$f" ]; then
      echo "==> Downloading $f from $UPSTREAM_CDN/maps/$UPSTREAM_VERSION/"
      curl -fL --retry 5 -o "$CACHE/$f.part" "$UPSTREAM_CDN/maps/$UPSTREAM_VERSION/$f" && mv "$CACHE/$f.part" "$CACHE/$f"
    fi
    cp "$CACHE/$f" "$MWM_DIR/$f"
  done
fi

DEST="$OUT/maps/$VERSION"
rm -rf "$DEST" && mkdir -p "$DEST"
for f in World.mwm WorldCoasts.mwm; do cp "$MWM_DIR/$f" "$DEST/"; done
for c in $(echo "$COUNTRIES" | tr ',' ' '); do cp "$MWM_DIR/$c.mwm" "$DEST/"; done

PYTHONPATH="$OM/tools/python" /om/venv/bin/python /om/make_countries.py "$OM" "$DEST" "$VERSION" > "$DEST/countries.json"
# [{"<min app version>": <data version>}]: every app version gets the newest data.
echo "[{\"0\": $VERSION}]" > "$OUT/data_version.json"
cp "$DEST/countries.json" "$OUT/countries.json"

echo "==> Published:"
ls -la "$DEST"
cat "$OUT/data_version.json"
