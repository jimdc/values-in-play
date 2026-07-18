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


if __name__ == "__main__":
    unittest.main()
