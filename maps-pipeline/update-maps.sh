#!/usr/bin/env bash
# Monthly map update: publishes the newest Organic Maps data for Syria on our map server (see update_from_om.py).
# Run by systemd/syria-maps-update.timer or cron. Creates its Python venv (with blake3) on the first run.
#
#   ./update-maps.sh               # publish the newest version if there is one
#   ./update-maps.sh --dry-run     # only report
#   ./update-maps.sh --version 261110
#
# Environment: OUT_DIR (default ./out, the folder the maps service serves), COUNTRIES (default Syria),
# KEEP_VERSIONS (default 4).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
VENV="${VENV:-$HERE/.venv}"

if [[ ! -x "$VENV/bin/python" ]]; then
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install --quiet --upgrade pip blake3
fi

# One run at a time: a slow download must not overlap the next timer run or a manual one.
exec 9>"$HERE/.update.lock"
if ! flock -n 9; then
  echo "another map update is running" >&2
  exit 1
fi

exec "$VENV/bin/python" "$HERE/update_from_om.py" "$@"
