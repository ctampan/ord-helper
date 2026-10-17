"""Offline identity, precedence and reproducibility checks for team metadata."""
from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from team_metadata import apply_tmo, enrich_team_data, extract_armor_snapshot, extract_support_snapshot  # noqa: E402
import tempfile
from map_skill_requirements import supplement_skills  # noqa: E402


class TeamMetadataTests(unittest.TestCase):
    def fixture(self):
        data = {"version": "2.323", "units": [{"id": "u", "rarity": "Rare", "capabilities": [
            {"category": "shield", "source": "ordsearch", "detail": "-5"}]}]}
        audit = {"units": {"u": {"objects": [{"rawId": "h001"}]}}}
        snapshot = {"version": "2.323", "title": "2.323", "url": "fixture", "htmlSha256": "fixture", "guideStatus": "fixture",
                    "groups": [{"units": [{"id": "100h", "codes": ["100h"], "abilities": {"방어력 감소": 10}}]}]}
        return data, audit, snapshot

    def test_exact_identity_and_verified_map_precedence(self):
        data, audit, snapshot = self.fixture()
        evidence = apply_tmo(data, audit, snapshot)
        self.assertEqual(data["units"][0]["capabilities"][0]["source"], "tmo")
        self.assertEqual(data["units"][0]["capabilities"][0]["numeric"]["target"], "unknown")
        self.assertEqual(data["units"][0]["capabilities"][0]["numeric"]["activation"], "unknown")
        self.assertEqual(evidence["u"][0]["rawUnitIds"], ["h001"])
        data["units"][0]["capabilities"][0]["source"] = "warcraft-map"
        apply_tmo(data, audit, snapshot)
        self.assertEqual(data["units"][0]["capabilities"][0]["source"], "warcraft-map")
        snapshot["version"] = "2.324"
        with self.assertRaises(ValueError):
            apply_tmo(data, audit, snapshot)

    def test_ambiguous_variants_unknown_identity_and_conditional_only_are_not_base_evidence(self):
        for variant in ["duplicate", "unknown", "conditional", "upgrade", "zero"]:
            data, audit, snapshot = self.fixture()
            entry = snapshot["groups"][0]["units"][0]
            if variant == "duplicate":
                snapshot["groups"][0]["units"].append(deepcopy(entry))
            elif variant == "unknown":
                entry["codes"] = ["unknown"]
            elif variant == "conditional":
                data["units"][0]["capabilities"][0]["condition"] = "Upgrade 4"
            elif variant == "upgrade":
                entry["desc"] = "Upgrade 4"
            else:
                entry["abilities"]["방어력 감소"] = 0
            before = deepcopy(data)
            apply_tmo(data, audit, snapshot)
            self.assertEqual(data, before, variant)

    def test_complete_bundled_enrichment_is_idempotent_and_retains_audit_history(self):
        read = lambda path: json.loads((ROOT / path).read_text(encoding="utf8"))
        data = read("public/data/2.323.json")
        map_audit = read("docs/capability-map-audit-2.323.json")
        audit = read("docs/capability-source-audit-2.323.json")
        snapshot = read("scripts/data/tmo-2.323.json")
        before = deepcopy((data, audit))
        enrich_team_data(data, map_audit, audit, snapshot)
        self.assertEqual((data, audit), before)

    def test_skill_supplement_does_not_duplicate_conditions_with_team_metadata(self):
        read = lambda path: json.loads((ROOT / path).read_text(encoding="utf8"))
        snapshot_path = ROOT / "ref/map-2.323.json"
        if not snapshot_path.exists():
            self.skipTest("Optional extracted map snapshot is unavailable")
        data = read("public/data/2.323.json")
        before = deepcopy(data)
        supplement_skills(data, json.loads(snapshot_path.read_text(encoding="utf8")),
            map_audit=read("docs/capability-map-audit-2.323.json"),
            previous_audit=read("docs/capability-map-skills-2.323.json"),
            original_notes=read("docs/capability-audit-2.323.json")["units"])
        self.assertEqual(data, before)

    def test_native_armor_rules_match_raw_map_and_regenerate_exactly(self):
        path = ROOT / "ref/map-2.323.json"
        if not path.exists():
            self.skipTest("Optional extracted map snapshot is unavailable")
        expected = json.loads((ROOT / "scripts/data/armor-stacking-2.323.json").read_text(encoding="utf8"))
        with tempfile.TemporaryDirectory() as directory:
            actual = extract_armor_snapshot(path, Path(directory) / "armor.json")
        self.assertEqual(actual, expected)
        self.assertEqual(len(actual["rules"]), 28)
        self.assertTrue(all(r["stacking"] == "once" for r in actual["rules"]))
        self.assertEqual(len(actual["review"]["buffObjects"]), 24)
        self.assertEqual(actual["review"]["movementSpeedBounds"], {"MinUnitSpeed": 89, "MaxUnitSpeed": 490})
        self.assertEqual({r["stackGroup"] for r in actual["review"]["sameBuffConflicts"]},
                         {"armor-aura:B011", "armor-aura:B025", "armor-aura:B02B"})
        rules = {r["unitId"]: r for r in actual["rules"]}
        self.assertNotEqual(rules["rare_sabo"]["stackGroup"], rules["hidden_sabo"]["stackGroup"])
        self.assertEqual(rules["hidden_sabo"]["stackGroup"], rules["transcendence_sabo"]["stackGroup"])
        self.assertNotIn("legendary_rayleigh", rules)

    def test_support_numeric_snapshot_regenerates_and_preserves_explicit_units_and_contexts(self):
        path = ROOT / "ref/map-2.323.json"
        if not path.exists():
            self.skipTest("Optional extracted map snapshot is unavailable")
        expected = json.loads((ROOT / "scripts/data/support-numeric-2.323.json").read_text(encoding="utf8"))
        with tempfile.TemporaryDirectory() as directory:
            actual = extract_support_snapshot(path, Path(directory) / "support.json")
        self.assertEqual(actual, expected)
        records = {(r["unitId"], r["category"]): r for r in actual["rules"]}
        self.assertEqual(records["rare_chopper", "damageb"]["numeric"]["unit"], "%")
        self.assertEqual(records["rare_sugar", "regen"]["numeric"]["unit"], "mana/s")
        self.assertEqual(records["hidden_ivankov", "life"]["numeric"]["value"], 1)
        self.assertEqual(records["hidden_ivankov", "life"]["numeric"]["target"], "single")
        self.assertEqual(records["legendary_dragon", "speedb"]["numeric"]["unit"], "%")
        self.assertEqual(records["legendary_dragon", "slow"]["numeric"]["target"], "area")


if __name__ == "__main__":
    unittest.main()
