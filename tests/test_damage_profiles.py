"""Damage classifications retain exact base-skill evidence and regenerate offline."""
from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from damage_profiles import enrich_damage_profiles  # noqa: E402


class DamageProfileTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        def read(path):
            return json.loads((ROOT / path).read_text(encoding="utf8"))
        cls.data = read("public/data/2.323.json")
        cls.mapped = read("docs/capability-map-audit-2.323.json")
        cls.source = read("scripts/data/damage-profiles-2.323.json")
        cls.audit = read("docs/damage-profile-audit-2.323.json")

    def test_every_entry_is_reviewed_and_generation_is_idempotent_and_damage_only(self):
        self.assertEqual(len(self.source["units"]), 278)
        self.assertEqual(set(self.source["units"]), {u["id"] for u in self.data["units"]})
        data = deepcopy(self.data)
        for unit in data["units"]:
            unit.pop("damageProfile")
        ordinary = deepcopy(data)
        audit = enrich_damage_profiles(data, self.mapped, self.source)
        self.assertEqual(data, self.data)
        self.assertEqual(audit, self.audit)
        self.assertEqual(enrich_damage_profiles(data, self.mapped, self.source), audit)
        for unit in data["units"]:
            unit.pop("damageProfile")
        self.assertEqual(data, ordinary)

    def test_missing_profiles_map_mismatch_and_unsupported_types_are_rejected(self):
        for kind in ["missing", "identity", "unsupported", "dominant"]:
            source = deepcopy(self.source)
            if kind == "missing":
                del source["units"]["immortal_sengoku"]
            elif kind == "identity":
                source["mapSha256"] = "different-map"
            elif kind == "unsupported":
                source["units"]["common_luffy"]["profile"]["types"] = ["Physical"]
            else:
                source["units"]["immortal_sengoku"]["profile"]["dominant"] = "Physical"
            with self.assertRaises(ValueError, msg=kind):
                enrich_damage_profiles(deepcopy(self.data), self.mapped, source)

    def test_acquired_abilities_and_fabricated_quotes_cannot_establish_base_types(self):
        uid = "transcendence_franky"
        self.assertIn("A188", [e["rawAbilityId"] for e in self.source["units"][uid]["excludedAbilities"]])
        for kind in ["quote", "acquired", "base"]:
            source = deepcopy(self.source)
            record = source["units"][uid]
            if kind == "quote":
                record["evidence"][0]["quote"] = "Invented physical damage"
            elif kind == "acquired":
                record["evidence"][0]["rawAbilityId"] = "A188"
            else:
                record["baseUnitIds"] = ["unknown-object"]
            with self.assertRaises(ValueError, msg=kind):
                enrich_damage_profiles(deepcopy(self.data), self.mapped, source)

    def test_resource_buffs_subgroups_and_ordinary_basic_attacks_are_not_damage_evidence(self):
        records = self.source["units"]
        for uid in ["common_luffy", "common_zoro", "special_chopperbrain", "legendary_brulee", "transcendence_chopper"]:
            self.assertEqual(records[uid]["profile"], {"types": [], "dominant": None, "core": False}, uid)
            self.assertEqual(records[uid]["evidence"], [], uid)
        self.assertEqual(records["legendary_sengoku"]["profile"]["dominant"], "Magic")
        self.assertEqual(records["immortal_sengoku"]["profile"]["types"], ["Magic", "Explosion"])
        self.assertEqual(records["mystic_sans"]["profile"]["dominant"], None)
        self.assertEqual(records["hidden_aokiji"]["profile"]["types"], ["Magic"])
        self.assertEqual(records["distortion_perona"]["profile"]["types"], ["Explosion"])


if __name__ == "__main__":
    unittest.main()
