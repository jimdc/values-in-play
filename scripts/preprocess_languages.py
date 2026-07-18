#!/usr/bin/env python3
"""Compile the curated language/model/WVS CSVs into browser-ready static JSON."""

from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CURATED_DIR = ROOT / "data" / "curated"
OUT_DIR = ROOT / "site" / "data"

AXIS_ORDER = ["deference_caution", "warmth_rigor", "depth_brevity", "candor_execution"]
EXPECTED_LANGUAGES = 20


def read_csv(name: str) -> list[dict[str, str]]:
    with (CURATED_DIR / name).open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def parse_axes(row: dict[str, str]) -> dict[str, float]:
    return {axis: float(row[axis]) for axis in AXIS_ORDER}


def parse_behaviors(row: dict[str, str]) -> list[str]:
    return [item.strip() for item in row["distinctive_behaviors"].split(";") if item.strip()]


def main() -> None:
    axis_rows = read_csv("value_axis_definitions.csv")
    axes = [
        {
            "id": row["axis_id"],
            "negativePole": row["negative_pole"],
            "positivePole": row["positive_pole"],
            "negativeTopValues": row["negative_top_values"].split(";"),
            "positiveTopValues": row["positive_top_values"].split(";"),
            "description": row["description"],
        }
        for row in axis_rows
    ]
    if [axis["id"] for axis in axes] != AXIS_ORDER:
        raise ValueError("value_axis_definitions.csv axis order does not match AXIS_ORDER")

    language_rows = read_csv("language_value_axes.csv")
    if len(language_rows) != EXPECTED_LANGUAGES:
        raise ValueError(f"Expected {EXPECTED_LANGUAGES} languages, found {len(language_rows)}")

    languages = []
    for row in language_rows:
        axes_values = parse_axes(row)
        for axis, value in axes_values.items():
            if not -1.0 <= value <= 1.0:
                raise ValueError(f"{row['language']} axis {axis}={value} out of expected [-1, 1] range")
        languages.append(
            {
                "language": row["language"],
                "isoCode": row["iso_code"],
                "nConversations": int(row["n_conversations"]),
                "axes": axes_values,
                "distinctiveBehaviors": parse_behaviors(row),
            }
        )
    languages.sort(key=lambda item: item["language"])

    model_rows = read_csv("model_value_axes.csv")
    if len(model_rows) != 3:
        raise ValueError(f"Expected 3 models, found {len(model_rows)}")
    models = []
    for row in model_rows:
        axes_values = parse_axes(row)
        for axis, value in axes_values.items():
            if not -1.0 <= value <= 1.0:
                raise ValueError(f"{row['model']} axis {axis}={value} out of expected [-1, 1] range")
        models.append(
            {
                "model": row["model"],
                "nConversations": int(row["n_conversations"]),
                "axes": axes_values,
                "distinctiveBehaviors": parse_behaviors(row),
            }
        )

    wvs_rows = read_csv("wvs_country_scores.csv")
    wvs_by_country = {}
    for row in wvs_rows:
        traditional_secular = float(row["traditional_secular"])
        survival_self_expression = float(row["survival_selfexpression"])
        for axis_name, value in (
            ("traditional_secular", traditional_secular),
            ("survival_selfexpression", survival_self_expression),
        ):
            if not -3.0 <= value <= 3.0:
                raise ValueError(f"{row['country']} {axis_name}={value} out of expected [-3, 3] range")
        wvs_by_country[row["country"]] = {
            "country": row["country"],
            "traditionalSecular": traditional_secular,
            "survivalSelfExpression": survival_self_expression,
            "culturalZone": row["cultural_zone"],
        }

    mapping_rows = read_csv("language_country_mapping.csv")
    if len(mapping_rows) != EXPECTED_LANGUAGES:
        raise ValueError(f"Expected {EXPECTED_LANGUAGES} language-country mappings, found {len(mapping_rows)}")

    language_country_map = []
    for row in mapping_rows:
        anchor_names = [item.strip() for item in row["anchor_countries"].split(";") if item.strip()]
        anchors = []
        for name in anchor_names:
            if name not in wvs_by_country:
                raise ValueError(f"No WVS score for anchor country {name!r} (language {row['language']!r})")
            anchors.append(wvs_by_country[name])
        centroid_traditional = sum(a["traditionalSecular"] for a in anchors) / len(anchors)
        centroid_survival = sum(a["survivalSelfExpression"] for a in anchors) / len(anchors)
        language_country_map.append(
            {
                "language": row["language"],
                "anchorCountries": anchor_names,
                "wvs": {
                    "traditionalSecular": round(centroid_traditional, 3),
                    "survivalSelfExpression": round(centroid_survival, 3),
                },
            }
        )

    language_names = {item["language"] for item in languages}
    mapping_names = {item["language"] for item in language_country_map}
    if language_names != mapping_names:
        raise ValueError(f"Language set mismatch between axes and country mapping: {language_names ^ mapping_names}")

    payload = {
        "meta": {
            "primarySource": "Anthropic, \"Claude's values across models and languages\" (2026-07-13)",
            "primarySourceUrl": "https://www.anthropic.com/research/claude-values-models-languages",
            "anchorSource": "Inglehart-Welzel cultural map of the world (World Values Survey), visually estimated",
            "axisOrder": AXIS_ORDER,
            "languageCount": len(languages),
        },
        "axes": axes,
        "languages": languages,
        "models": models,
        "wvsCountries": sorted(wvs_by_country.values(), key=lambda item: item["country"]),
        "languageCountryMap": sorted(language_country_map, key=lambda item: item["language"]),
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    output = OUT_DIR / "languages.json"
    output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(languages)} languages and {len(models)} models to {output.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
