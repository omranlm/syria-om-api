"""Prunes the upstream terrain grid to the countries of a published countries.json.

Usage: make_twm_grid.py <countries.json> > twm_grid.json

The app ships data/twm_grid.json; it must only name map ids that exist in data/countries.json,
otherwise terrain downloads notify unknown regions and the app aborts. The upstream grid lives
next to this script as twm_grid.upstream.json (copied from the Organic Maps repo).
"""
import json
import os
import sys

here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, "twm_grid.upstream.json"), encoding="utf-8") as f:
    grid = json.load(f)
with open(sys.argv[1], encoding="utf-8") as f:
    countries = json.load(f)


def leaves(node):
    return [leaf for child in node["g"] for leaf in leaves(child)] if "g" in node else [node["id"]]


ids = set(leaves(countries))
mwms = {k: v for k, v in grid["mwms"].items() if k in ids}
tiles = {tile for v in mwms.values() for tile in v}
blocks = [b for b in grid["blocks"] if b["id"] in tiles]
json.dump({"v": grid["v"], "blocks": blocks, "mwms": mwms}, sys.stdout, ensure_ascii=False, indent=1)
sys.stdout.write("\n")
