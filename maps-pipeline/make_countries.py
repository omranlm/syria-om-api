"""Writes a countries.json that lists only the .mwm files present in a published map folder.

Usage: make_countries.py <organicmaps repo> <folder with mwm files> <data version>

The entries keep the same shape as the upstream data/countries.json (id, affiliations, s, h) so the
app's downloader and search-by-region keep working; size and hash are taken from the actual files.
"""
import json
import os
import sys

from post_generation.hierarchy_to_countries import get_mwm_hash, get_mwm_size

om_path, mwm_dir, version = sys.argv[1], sys.argv[2], int(sys.argv[3])

with open(os.path.join(om_path, "data", "countries.json"), encoding="utf-8") as f:
    upstream = json.load(f)

present = {name[:-4] for name in os.listdir(mwm_dir) if name.endswith(".mwm")}


def prune(node):
    """Returns a copy of node keeping only leaves whose .mwm exists; groups keep their children."""
    if "g" in node:
        children = [c for c in (prune(child) for child in node["g"]) if c is not None]
        if not children:
            return None
        return {**{k: v for k, v in node.items() if k != "g"}, "g": children}
    if node["id"] not in present:
        return None
    return {**node, "s": get_mwm_size(mwm_dir, node["id"]), "h": get_mwm_hash(mwm_dir, node["id"])}


root = prune(upstream)
if root is None:
    sys.exit("no known .mwm files found in " + mwm_dir)
root["v"] = version
json.dump(root, sys.stdout, ensure_ascii=False, indent=1)
