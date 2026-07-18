#!/usr/bin/env python3
"""Turn the published Values in the Wild CSVs into browser-ready static JSON."""

from __future__ import annotations

import csv
import json
import math
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
OUT_DIR = ROOT / "site" / "data"

DOMAIN_ORDER = ["Practical", "Epistemic", "Social", "Protective", "Personal"]
DOMAIN_RECTS = {
    "Practical": (80, 80, 2200, 1840),
    "Epistemic": (2400, 80, 2100, 1840),
    "Social": (4620, 80, 2200, 1840),
    "Protective": (650, 2140, 2550, 1840),
    "Personal": (3410, 2140, 2550, 1840),
}


def read_csv(name: str) -> list[dict[str, str]]:
    with (RAW_DIR / name).open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def split_rects(
    groups: list[tuple[str, int]],
    rect: tuple[float, float, float, float],
    gutter: float = 22,
):
    """A deterministic binary treemap with small gutters between regions."""
    if not groups:
        return {}
    if len(groups) == 1:
        return {groups[0][0]: rect}

    x, y, width, height = rect
    total = sum(weight for _, weight in groups)
    running = 0
    split_at = 1
    for index, (_, weight) in enumerate(groups[:-1], start=1):
        running += weight
        split_at = index
        if running >= total / 2:
            break

    left, right = groups[:split_at], groups[split_at:]
    left_weight = sum(weight for _, weight in left)
    ratio = left_weight / total
    if width >= height:
        cut = width * ratio
        first = (x, y, max(1, cut - gutter / 2), height)
        second = (x + cut + gutter / 2, y, max(1, width - cut - gutter / 2), height)
    else:
        cut = height * ratio
        first = (x, y, width, max(1, cut - gutter / 2))
        second = (x, y + cut + gutter / 2, width, max(1, height - cut - gutter / 2))
    return {**split_rects(left, first, gutter), **split_rects(right, second, gutter)}


def label_size(name: str, pct_convos: float) -> tuple[float, float, float]:
    # Frequencies span several orders of magnitude; log scaling keeps rare values legible.
    font = 11.5 + min(14.5, max(0, math.log10(pct_convos / 0.005 + 1) * 6.3))
    width = max(38, len(name) * font * 0.54 + 18)
    height = font * 1.62
    return round(width, 2), round(height, 2), round(font, 2)


def place_labels(items: list[dict], rect: tuple[float, float, float, float]) -> None:
    x, y, width, height = rect
    inset_x, inset_top, inset_bottom = 6, 8, 6
    left, right = x + inset_x, x + width - inset_x
    top, bottom = y + inset_top, y + height - inset_bottom
    available_width = max(30, right - left)
    available_height = max(20, bottom - top)
    prepared = []

    for item in sorted(items, key=lambda row: (-row["pctConvos"], row["name"])):
        label_width, label_height, font = label_size(item["name"], item["pctConvos"])
        if label_width > available_width:
            font = max(8, font * available_width / label_width)
            label_width = min(available_width, len(item["name"]) * font * 0.54 + 18)
            label_height = font * 1.62
        prepared.append((item, label_width, label_height, font))

    def make_rows(scale: float):
        rows = []
        current = {"items": [], "width": 0.0, "height": 0.0}
        gap_x = 4.0
        for item, base_width, base_height, base_font in prepared:
            item_width = min(available_width, base_width * scale)
            item_height = base_height * scale
            extra = gap_x if current["items"] else 0
            if current["items"] and current["width"] + extra + item_width > available_width:
                rows.append(current)
                current = {"items": [], "width": 0.0, "height": 0.0}
                extra = 0
            current["items"].append((item, item_width, item_height, base_font * scale))
            current["width"] += extra + item_width
            current["height"] = max(current["height"], item_height)
        if current["items"]:
            rows.append(current)
        total_height = sum(row["height"] for row in rows) + max(0, len(rows) - 1) * 3
        return rows, total_height

    scale = 1.0
    rows, total_height = make_rows(scale)
    while total_height > available_height and scale > 0.28:
        scale *= 0.94
        rows, total_height = make_rows(scale)

    # Very small taxonomy cells are rare; this final vertical compression keeps every label inside.
    if total_height > available_height:
        scale *= available_height / total_height
        rows, total_height = make_rows(scale)

    row_y = top + (available_height - total_height) / 2
    for row_index, row in enumerate(rows):
        row_x = left + (available_width - row["width"]) / 2
        for item_index, (item, item_width, item_height, font) in enumerate(row["items"]):
            if item_index:
                row_x += 4
            item.update(
                x=round(row_x + item_width / 2, 2),
                y=round(row_y + row["height"] / 2, 2),
                width=round(item_width, 2),
                height=round(item_height, 2),
                font=round(font, 2),
            )
            row_x += item_width
        row_y += row["height"] + 3


def main() -> None:
    tree_rows = read_csv("values_tree.csv")
    frequency_rows = read_csv("values_frequencies.csv")
    nodes = {row["cluster_id"]: row for row in tree_rows}
    frequencies = {row["value"]: float(row["pct_convos"]) for row in frequency_rows}

    leaves = [row for row in tree_rows if row["level"] == "0"]
    if len(leaves) != 3307 or len(frequencies) != 3307:
        raise ValueError("Expected 3,307 leaves and 3,307 frequency rows")

    # Cluster ids in the source CSV are long UUID-shaped strings repeated across every
    # leaf that shares an ancestor; recoding them to short, sorted (deterministic) integers
    # keeps the shipped JSON far smaller without changing what the browser can look up.
    cluster_code = {
        cluster_id: index
        for index, cluster_id in enumerate(
            sorted(row["cluster_id"] for row in tree_rows if row["level"] != "0")
        )
    }

    values = []
    by_domain: dict[str, list[dict]] = defaultdict(list)
    by_level_two: dict[str, list[dict]] = defaultdict(list)
    by_parent: dict[str, list[dict]] = defaultdict(list)

    for leaf in leaves:
        chain = []
        parent_id = leaf["parent_cluster_id"]
        while parent_id:
            parent = nodes.get(parent_id)
            if parent is None:
                raise ValueError(f"Missing parent {parent_id!r} for {leaf['name']!r}")
            chain.append(parent)
            parent_id = parent["parent_cluster_id"]
        if [node["level"] for node in chain] != ["1", "2", "3"]:
            raise ValueError(f"Unexpected parent chain for {leaf['name']!r}")

        domain = chain[-1]["name"].removesuffix(" values")
        if domain not in DOMAIN_ORDER:
            raise ValueError(f"Unknown domain {domain!r}")
        if leaf["name"] not in frequencies:
            raise ValueError(f"Missing frequency for {leaf['name']!r}")

        item = {
            "name": leaf["name"],
            "pctConvos": frequencies[leaf["name"]],
            "pctExpressions": float(leaf["pct_total_occurrences"]),
            # Recoded to short cluster_code integers just before serialization, once
            # every rect/placement computation below is done with the original ids.
            "parentId": chain[0]["cluster_id"],
            "level2Id": chain[1]["cluster_id"],
            "domainId": chain[2]["cluster_id"],
            "domain": domain,
            "search": " ".join([leaf["name"], *(node["name"] for node in chain)]).lower(),
        }
        values.append(item)
        by_domain[domain].append(item)
        by_level_two[chain[1]["cluster_id"]].append(item)
        by_parent[chain[0]["cluster_id"]].append(item)

    regions = []
    for domain in DOMAIN_ORDER:
        domain_rect = DOMAIN_RECTS[domain]
        domain_values = by_domain[domain]
        level_two_ids = sorted(
            {item["level2Id"] for item in domain_values},
            key=lambda node_id: (-len(by_level_two[node_id]), nodes[node_id]["name"]),
        )
        inner = (
            domain_rect[0] + 36,
            domain_rect[1] + 76,
            domain_rect[2] - 72,
            domain_rect[3] - 108,
        )
        level_two_rects = split_rects(
            [(node_id, len(by_level_two[node_id])) for node_id in level_two_ids], inner
        )

        for level_two_id in level_two_ids:
            level_two_rect = level_two_rects[level_two_id]
            regions.append(
                {
                    "name": nodes[level_two_id]["name"],
                    "domain": domain,
                    "level": 2,
                    "x": round(level_two_rect[0], 2),
                    "y": round(level_two_rect[1], 2),
                    "width": round(level_two_rect[2], 2),
                    "height": round(level_two_rect[3], 2),
                }
            )
            parent_ids = sorted(
                {item["parentId"] for item in by_level_two[level_two_id]},
                key=lambda node_id: (-len(by_parent[node_id]), nodes[node_id]["name"]),
            )
            l2x, l2y, l2w, l2h = level_two_rect
            parent_inner = (l2x + 10, l2y + 32, max(40, l2w - 20), max(40, l2h - 42))
            parent_rects = split_rects(
                [(node_id, len(by_parent[node_id])) for node_id in parent_ids], parent_inner, gutter=6
            )
            for parent_id in parent_ids:
                parent_rect = parent_rects[parent_id]
                place_labels(by_parent[parent_id], parent_rect)

    values.sort(key=lambda row: (DOMAIN_ORDER.index(row["domain"]), row["name"]))
    for item in values:
        item["parentId"] = cluster_code[item["parentId"]]
        item["level2Id"] = cluster_code[item["level2Id"]]
        item["domainId"] = cluster_code[item["domainId"]]

    clusters = {
        str(cluster_code[row["cluster_id"]]): {
            "name": row["name"],
            "description": row["description"],
            "level": int(row["level"]),
            "parentId": cluster_code[row["parent_cluster_id"]] if row["parent_cluster_id"] else None,
            "pctExpressions": float(row["pct_total_occurrences"]),
        }
        for row in tree_rows
        if row["level"] != "0"
    }
    domains = [
        {
            "name": domain,
            "rect": list(DOMAIN_RECTS[domain]),
            "count": len(by_domain[domain]),
            "description": next(
                cluster["description"]
                for cluster in clusters.values()
                if cluster["level"] == 3 and cluster["name"] == f"{domain} values"
            ),
        }
        for domain in DOMAIN_ORDER
    ]

    payload = {
        "meta": {
            "source": "Anthropic/values-in-the-wild",
            "license": "CC BY 4.0",
            "leafCount": len(values),
            "world": {"width": 6900, "height": 4060},
        },
        "domains": domains,
        "regions": regions,
        "clusters": clusters,
        "values": values,
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    output = OUT_DIR / "values.json"
    output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(values):,} values to {output.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
