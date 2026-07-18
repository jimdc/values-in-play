import csv
import json
import subprocess
import unittest
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class DataIntegrityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run(["python3", "scripts/preprocess.py"], cwd=ROOT, check=True)
        cls.payload = json.loads((ROOT / "site/data/values.json").read_text(encoding="utf-8"))
        with (ROOT / "data/raw/values_tree.csv").open(newline="", encoding="utf-8") as handle:
            cls.tree = list(csv.DictReader(handle))

    def test_output_matches_all_leaf_rows(self):
        leaves = [row for row in self.tree if row["level"] == "0"]
        self.assertEqual(len(leaves), 3307)
        self.assertEqual(len(self.payload["values"]), len(leaves))
        self.assertEqual(len({value["id"] for value in self.payload["values"]}), 3307)
        domain_rects = {domain["name"]: domain["rect"] for domain in self.payload["domains"]}
        for value in self.payload["values"]:
            x, y, width, height = domain_rects[value["domain"]]
            self.assertGreaterEqual(value["x"] - value["width"] / 2, x)
            self.assertLessEqual(value["x"] + value["width"] / 2, x + width)
            self.assertGreaterEqual(value["y"] - value["height"] / 2, y)
            self.assertLessEqual(value["y"] + value["height"] / 2, y + height)
        by_parent = defaultdict(list)
        for value in self.payload["values"]:
            by_parent[value["parentId"]].append(value)
        for siblings in by_parent.values():
            for index, first in enumerate(siblings):
                for second in siblings[index + 1 :]:
                    overlaps = (
                        abs(first["x"] - second["x"]) * 2 < first["width"] + second["width"] - 0.1
                        and abs(first["y"] - second["y"]) * 2 < first["height"] + second["height"] - 0.1
                    )
                    self.assertFalse(overlaps, f"Labels overlap: {first['name']} / {second['name']}")

    def test_every_leaf_reaches_one_of_five_domains(self):
        domains = {domain["name"] for domain in self.payload["domains"]}
        self.assertEqual(domains, {"Practical", "Epistemic", "Social", "Protective", "Personal"})
        for value in self.payload["values"]:
            self.assertEqual(len(value["ancestorNames"]), 3)
            self.assertIn(value["domain"], domains)
            self.assertEqual(value["ancestorNames"][-1], f"{value['domain']} values")

    def test_frequency_totals_are_sane(self):
        # Values can co-occur, so conversation percentages legitimately sum above 100%.
        pct_convos = sum(value["pctConvos"] for value in self.payload["values"])
        pct_expressions = sum(value["pctExpressions"] for value in self.payload["values"])
        self.assertGreater(pct_convos, 100)
        self.assertLess(pct_convos, 500)
        self.assertAlmostEqual(pct_expressions, 100, delta=0.2)
        self.assertTrue(all(value["pctConvos"] > 0 for value in self.payload["values"]))


class LanguageDataIntegrityTests(unittest.TestCase):
    AXES = ["deference_caution", "warmth_rigor", "depth_brevity", "candor_execution"]

    @classmethod
    def setUpClass(cls):
        subprocess.run(["python3", "scripts/preprocess_languages.py"], cwd=ROOT, check=True)
        cls.payload = json.loads((ROOT / "site/data/languages.json").read_text(encoding="utf-8"))
        with (ROOT / "data/curated/language_value_axes.csv").open(newline="", encoding="utf-8") as handle:
            cls.language_rows = list(csv.DictReader(handle))
        with (ROOT / "data/curated/wvs_country_scores.csv").open(newline="", encoding="utf-8") as handle:
            cls.wvs_rows = list(csv.DictReader(handle))

    def test_exactly_twenty_languages_with_unique_names(self):
        self.assertEqual(len(self.language_rows), 20)
        self.assertEqual(len(self.payload["languages"]), 20)
        names = {row["language"] for row in self.payload["languages"]}
        self.assertEqual(len(names), 20)

    def test_axis_order_and_definitions_are_consistent(self):
        self.assertEqual(self.payload["meta"]["axisOrder"], self.AXES)
        axis_ids = [axis["id"] for axis in self.payload["axes"]]
        self.assertEqual(axis_ids, self.AXES)
        for axis in self.payload["axes"]:
            self.assertTrue(axis["negativePole"])
            self.assertTrue(axis["positivePole"])
            self.assertTrue(axis["description"])

    def test_language_axis_values_are_within_plausible_range(self):
        # The published chart's steepest lean (Hindi's warmth) is 0.49σ; a generous
        # ceiling catches transcription slips (e.g. a misplaced decimal) without being brittle.
        for language in self.payload["languages"]:
            self.assertEqual(set(language["axes"].keys()), set(self.AXES))
            for axis_id, value in language["axes"].items():
                self.assertGreaterEqual(value, -1.0, f"{language['language']} {axis_id}")
                self.assertLessEqual(value, 1.0, f"{language['language']} {axis_id}")
            self.assertGreater(language["nConversations"], 0)
            self.assertTrue(language["distinctiveBehaviors"])
            self.assertTrue(language["isoCode"])

    def test_three_models_with_axis_values_in_range(self):
        self.assertEqual(len(self.payload["models"]), 3)
        for model in self.payload["models"]:
            self.assertEqual(set(model["axes"].keys()), set(self.AXES))
            for axis_id, value in model["axes"].items():
                self.assertGreaterEqual(value, -1.0)
                self.assertLessEqual(value, 1.0)
            self.assertGreater(model["nConversations"], 0)
            self.assertTrue(model["distinctiveBehaviors"])

    def test_wvs_country_scores_are_within_chart_bounds(self):
        self.assertGreaterEqual(len(self.wvs_rows), 20)
        for row in self.wvs_rows:
            traditional_secular = float(row["traditional_secular"])
            survival_self_expression = float(row["survival_selfexpression"])
            self.assertGreaterEqual(traditional_secular, -3.0)
            self.assertLessEqual(traditional_secular, 3.0)
            self.assertGreaterEqual(survival_self_expression, -3.0)
            self.assertLessEqual(survival_self_expression, 3.0)
            self.assertTrue(row["cultural_zone"])

    def test_every_language_maps_to_at_least_one_known_wvs_anchor_country(self):
        known_countries = {row["country"] for row in self.wvs_rows}
        self.assertEqual(len(self.payload["languageCountryMap"]), 20)
        for mapping in self.payload["languageCountryMap"]:
            self.assertTrue(mapping["anchorCountries"])
            for country in mapping["anchorCountries"]:
                self.assertIn(country, known_countries)
            self.assertIn("traditionalSecular", mapping["wvs"])
            self.assertIn("survivalSelfExpression", mapping["wvs"])


if __name__ == "__main__":
    unittest.main()
