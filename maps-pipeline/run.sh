#!/usr/bin/env bash
# Produces a map set in out/ with the syria-om-generator image. Extra arguments go to docker run,
# e.g. ./run.sh -e WORLD_SOURCE=upstream -e COUNTRIES="Syria,Lebanon"
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p work out
HERE="$PWD"
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) HERE="$(cygpath -m "$PWD")"; export MSYS_NO_PATHCONV=1 ;;
esac
docker run --rm -v "$HERE/work:/om/work" -v "$HERE/out:/om/out" "$@" syria-om-generator
