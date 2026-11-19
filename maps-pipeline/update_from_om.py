#!/usr/bin/env python3
"""Publishes the newest Organic Maps map data for Syria on our map server, if there is a newer one.

Run monthly (see update-maps.sh and systemd/). Steps:
  1. The newest data version is the "v" of data/countries.json on the Organic Maps master branch (the CDN's own
     data_version.json is not maintained).
  2. If it is newer than what we publish, World.mwm, WorldCoasts.mwm and Syria.mwm of that version are downloaded
     from the Organic Maps CDN and checked against the size and blake3 hash in its countries.json.
  3. They are published as out/maps/<v>/ with a countries.json that lists only them. data_version.json is then
     bumped, and the app offers "Update all" on its next start.
  4. Old version folders are deleted, except the newest KEEP_VERSIONS and those in pinned-versions.txt (the
     versions bundled in shipped APKs: a fresh install downloads its bundled version on the first start).

Safety: a map stores its feature types as positions in data/types.txt. If the Organic Maps list differs from the
one our app was built with (app-types.txt next to this script), the new version is downloaded but not published,
and the script exits with code 3: publish it after an app update (copy the app's data/types.txt here) or with
--publish-anyway.

Requires Python 3.9+ and the blake3 package (pip install blake3).
Exit codes: 0 published or already up to date, 1 error, 3 downloaded but not published (types differ).
"""
import argparse
import base64
import json
import os
import shutil
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
WORLD_IDS = ["World", "WorldCoasts"]
USER_AGENT = "syria-om-maps-updater/1.0"


def log(*parts):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), *parts, flush=True)


def fetch(url, timeout=60):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def download(url, path, retries=3):
    """Streams url to path (via path.part), retrying from scratch on errors."""
    for attempt in range(1, retries + 1):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=120) as response, open(path + ".part", "wb") as out:
                shutil.copyfileobj(response, out, 1 << 20)
            os.replace(path + ".part", path)
            return
        except OSError as e:
            log(f"download failed ({attempt}/{retries}): {url}: {e}")
            if attempt == retries:
                raise
            time.sleep(30 * attempt)


def blake3_base64(path, num_bytes):
    from blake3 import blake3  # imported here so --help works without it

    h = blake3()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return base64.b64encode(h.digest(length=num_bytes)).decode("ascii")


def published_version(out_dir):
    """Highest data version in out/data_version.json ([{"<min app version>": <data version>}, ...]), or 0."""
    try:
        with open(os.path.join(out_dir, "data_version.json"), encoding="utf-8") as f:
            return max(int(v) for item in json.load(f) for v in item.values())
    except (OSError, ValueError):
        return 0


def prune(node, wanted):
    """Copy of the countries tree keeping only the wanted leaves (groups keep affiliations etc.)."""
    if "g" in node:
        children = [c for c in (prune(child, wanted) for child in node["g"]) if c is not None]
        return {**{k: v for k, v in node.items() if k != "g"}, "g": children} if children else None
    return dict(node) if node["id"] in wanted else None


def leaves(node):
    if "g" in node:
        for child in node["g"]:
            yield from leaves(child)
    else:
        yield node


def write_atomically(path, text):
    with open(path + ".tmp", "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(path + ".tmp", path)


def types_match(types_url):
    """Whether the Organic Maps type list equals the one our app was built with (None: cannot tell)."""
    app_types = os.path.join(HERE, "app-types.txt")
    if not os.path.exists(app_types):
        log("WARNING: app-types.txt missing, the map/app type compatibility is not checked")
        return None
    with open(app_types, "rb") as f:
        ours = f.read().replace(b"\r\n", b"\n")
    return fetch(types_url).replace(b"\r\n", b"\n") == ours


def cleanup(out_dir, keep, current):
    pinned = set()
    pinned_file = os.path.join(HERE, "pinned-versions.txt")
    if os.path.exists(pinned_file):
        with open(pinned_file, encoding="utf-8") as f:
            pinned = {line.split("#")[0].strip() for line in f} - {""}
    maps_dir = os.path.join(out_dir, "maps")
    versions = sorted((d for d in os.listdir(maps_dir) if d.isdigit()), key=int, reverse=True)
    for version in versions[keep:]:
        if version in pinned or int(version) == current:
            continue
        log(f"removing old version {version}")
        shutil.rmtree(os.path.join(maps_dir, version))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", default=os.environ.get("OUT_DIR", os.path.join(HERE, "out")),
                        help="folder served by the map server (default: out/ next to this script)")
    parser.add_argument("--countries", default=os.environ.get("COUNTRIES", "Syria"),
                        help="comma separated map ids besides World/WorldCoasts (default: Syria)")
    parser.add_argument("--cdn", default=os.environ.get("OM_CDN", "https://cdn.organicmaps.app"))
    parser.add_argument("--repo-raw", default=os.environ.get(
        "OM_REPO_RAW", "https://raw.githubusercontent.com/organicmaps/organicmaps/master"))
    parser.add_argument("--version", type=int, help="publish this data version instead of the newest one")
    parser.add_argument("--keep", type=int, default=int(os.environ.get("KEEP_VERSIONS", "4")),
                        help="newest version folders to keep (default: 4)")
    parser.add_argument("--publish-anyway", action="store_true", help="publish even if the type lists differ")
    parser.add_argument("--dry-run", action="store_true", help="only report what would be done")
    args = parser.parse_args()

    out_dir = os.path.abspath(args.out)
    os.makedirs(os.path.join(out_dir, "maps"), exist_ok=True)
    current = published_version(out_dir)
    latest = args.version or int(json.loads(fetch(f"{args.repo_raw}/data/countries.json"))["v"])
    log(f"published version {current}, Organic Maps version {latest}")
    if latest <= current and not args.version:
        log("up to date")
        return 0
    if args.dry_run:
        log(f"would publish {latest}")
        return 0

    wanted = set(WORLD_IDS) | {c.strip() for c in args.countries.split(",") if c.strip()}
    tree = prune(json.loads(fetch(f"{args.cdn}/maps/{latest}/countries.json")), wanted)
    found = {leaf["id"] for leaf in leaves(tree)} if tree else set()
    if found != wanted:
        log(f"ERROR: version {latest} has no {sorted(wanted - found)}")
        return 1

    # Downloaded next to the final folder, so publishing is a rename on the same file system.
    staging = os.path.join(out_dir, "maps", f".staging-{latest}")
    final = os.path.join(out_dir, "maps", str(latest))
    if not os.path.exists(staging) and os.path.isdir(final) and latest != current:
        # Stored by an earlier run that did not publish it (type lists differed): its files are checked, not
        # downloaded again. The version being served is never moved away.
        os.replace(final, staging)
    os.makedirs(staging, exist_ok=True)
    for leaf in leaves(tree):
        path = os.path.join(staging, leaf["id"] + ".mwm")
        expected_hash = leaf["h"]
        num_bytes = len(base64.b64decode(expected_hash))
        if not (os.path.exists(path) and os.path.getsize(path) == leaf["s"]
                and blake3_base64(path, num_bytes) == expected_hash):
            log(f"downloading {leaf['id']}.mwm ({leaf['s'] / 1e6:.0f} MB)")
            download(f"{args.cdn}/maps/{latest}/{leaf['id']}.mwm", path)
        size = os.path.getsize(path)
        actual_hash = blake3_base64(path, num_bytes)
        if size != leaf["s"] or actual_hash != expected_hash:
            log(f"ERROR: {leaf['id']}.mwm does not match: size {size}/{leaf['s']}, hash {actual_hash}/{expected_hash}")
            os.remove(path)
            return 1
        log(f"{leaf['id']}.mwm verified")

    tree["v"] = latest
    countries_json = json.dumps(tree, ensure_ascii=False, indent=1)
    write_atomically(os.path.join(staging, "countries.json"), countries_json)
    if os.path.exists(final):
        shutil.rmtree(final)
    os.replace(staging, final)
    log(f"stored {final}")

    match = types_match(f"{args.repo_raw}/data/types.txt")
    if match is False and not args.publish_anyway:
        log("NOT PUBLISHED: the Organic Maps type list (data/types.txt) differs from app-types.txt. Update the "
            "app first, copy its data/types.txt to app-types.txt, then run again (or use --publish-anyway).")
        return 3

    # The app reads data_version.json first, then maps/<v>/countries.json: bump it last.
    write_atomically(os.path.join(out_dir, "countries.json"), countries_json)
    write_atomically(os.path.join(out_dir, "data_version.json"), json.dumps([{"0": latest}]))
    log(f"PUBLISHED version {latest}")
    cleanup(out_dir, args.keep, latest)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # noqa: BLE001 - logged for the timer / cron output
        log(f"ERROR: {type(e).__name__}: {e}")
        sys.exit(1)
