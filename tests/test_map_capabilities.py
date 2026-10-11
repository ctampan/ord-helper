"""Offline map-reader and conservative extraction regression cases."""
import importlib.util
import struct
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from map_capabilities import apply_map, extract_effects  # noqa: E402
from map_skill_requirements import extract_skill_requirements, supplement_skills  # noqa: E402

spec = importlib.util.spec_from_file_location("map_reader", ROOT / "scripts/extract-warcraft-map.py")
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


def ability(text, level=1):
    return {"rawId": "A001", "shared": True, "textFields": [
        {"field": "aub1", "level": level, "value": text, "text": text}]}


class MapTests(unittest.TestCase):
    def test_resource_triggers_keep_threshold_cost_and_alternative_activation(self):
        texts = [
            ("◎Activation Condition : When HP is 35 or higher, 15% chance to consume 17 HP on attack (base healing 1.5)", "hp-skill", "35", "17"),
            ("◎Activation Condition : 8.8% chance on attack or 35 Health (+1 on attack)", "hp-skill", "8.8%", "35 HP"),
            ("◎Activation Condition 2 : Consumes 50 mana if mana is 75 or higher", "mana-skill", "50", "75"),
            ("◎Activation Condition : Enemy Armor Break 50 or more + Mana 35 or more", "mana-skill", "Armor Break 50", "Mana 35"),
        ]
        for text, category, first, second in texts:
            records = extract_skill_requirements(ability(text))
            self.assertEqual(len(records), 1)
            effect, evidence = records[0]
            self.assertEqual(effect["category"], category)
            self.assertIn(first, effect["detail"])
            self.assertIn(second, effect["detail"])
            self.assertNotIn("condition", effect)
            self.assertEqual(evidence["quote"], text)

    def test_resource_damage_regeneration_capacity_and_higher_levels_are_not_triggers(self):
        for text in ["◎Damage : 35% of current HP", "◎Basic Effect : Mana regeneration 2.5",
                     "◎Basic Effect : Maximum Mana 150", "◎Activation Condition : Enemy HP 35 or less",
                     "◎Activation Condition : 150 Mana\n◎Cost : Requires 4 Attribute Points"]:
            self.assertEqual(extract_skill_requirements(ability(text)), [])
        self.assertEqual(extract_skill_requirements(ability("◎Activation Condition : 150 Mana", level=2)), [])

    def test_resource_subsections_and_acquired_skill_are_kept_separate(self):
        text = "◎Activation Condition : 135 Mana\n◎Activation Condition : HP 250 (Recovers 50 when Room is activated)\n▶ Activates only once during the room duration."
        records = extract_skill_requirements(ability(text))
        self.assertEqual([e["category"] for e, _ in records], ["mana-skill", "hp-skill"])
        self.assertNotIn("only once", records[0][0]["detail"])
        self.assertIn("only once", records[1][0]["detail"])
        record = extract_skill_requirements(ability("◎Activation Condition : 100 Mana while Vegapunk's Knowledge is active"))[0][0]
        self.assertEqual(record["condition"], "Vegapunk's Knowledge")
        records = extract_skill_requirements(ability("◎Activation Condition : Automatically activates every 14.25 seconds\n▶ Activates when 35 mana is filled (Base healing 1.35)"))
        self.assertIn("14.25 seconds", records[0][0]["detail"])

    def test_resource_supplement_ignores_non_base_objects_and_is_idempotent(self):
        from copy import deepcopy
        data = {"units": [{"id": "fixture", "note": "Command: keep", "recipe": {"u": 2}}]}
        snapshot = {"sha256": "fixture", "map": "fixture", "unavailable": {}, "files": {"war3map.w3u": {"objects": [
            {"id": "u001", "modifications": [{"field": "uabi", "value": "A001"}, {"field": "umvt", "value": "amph"}]},
            {"id": "u002", "modifications": [{"field": "uabi", "value": "A002"}]},
        ]}}}
        mana = ability("◎Activation Condition : 100 Mana")
        mana["shared"] = False
        audit = {"sha256": "fixture", "units": {"fixture": {"objects": [{"rawId": "u001"}, {"rawId": "u002"}], "abilities": [mana]}}}
        first = supplement_skills(data, snapshot, audit)
        self.assertNotIn("capabilities", data["units"][0])
        self.assertEqual(len(first["units"]["fixture"]["unverified"]), 1)
        audit["units"]["fixture"]["objects"].pop()
        first = supplement_skills(data, snapshot, audit)
        saved = deepcopy(data)
        second = supplement_skills(data, snapshot, audit, first)
        self.assertEqual(data, saved)
        self.assertEqual(second, first)
        self.assertEqual(data["units"][0]["note"], "Command: keep")
        self.assertEqual(data["units"][0]["recipe"], {"u": 2})
        self.assertEqual([c["category"] for c in data["units"][0]["capabilities"]], ["mana-skill", "swimming"])

    def test_object_reader_preserves_levels_and_original_text(self):
        packed = struct.pack("<iii", 2, 0, 1) + b"AHtbA001" + struct.pack("<i", 1)
        packed += b"aub1" + struct.pack("<iii", 3, 2, 0) + b"|cffff0000Stun|r\0A001"
        obj = reader.parse_objects(packed, extended=True)[0]
        self.assertEqual(obj["id"], "A001")
        self.assertEqual(obj["baseId"], "AHtb")
        self.assertEqual(obj["modifications"][0]["level"], 2)
        self.assertEqual(obj["modifications"][0]["value"], "|cffff0000Stun|r")
        self.assertEqual(reader.clean_text("|CFFFF0000Stun|r |n−4"), "Stun \n-4")
        with self.assertRaises(ValueError):
            reader.parse_objects(struct.pack("<i", 3))

    def test_stun_targets_and_higher_levels_are_not_guessed(self):
        self.assertEqual(extract_effects(ability("◎Additional Effect : 3-second stun")), [])
        self.assertEqual(extract_effects(ability("Stuns a single enemy for 3 seconds", level=2)), [])
        self.assertEqual(extract_effects(ability("Stuns a single enemy for 3 seconds\n◎Cost : Requires 4 Attribute Points")), [])
        effects = extract_effects(ability("◎Additional Effect : 1.65 second stun in the affected area"))
        self.assertEqual(effects[0][0], {"category": "stun", "detail": "1.65 s", "source": "warcraft-map"})
        self.assertEqual(effects[0][1]["field"], "aub1")

    def test_amplification_cap_and_armor_break_damage_are_not_extra_effects(self):
        records = extract_effects(ability("Enemies within the target range Explosive damage amplified by 3%\nExplosive damage amplification is increased by up to 25%."))
        self.assertEqual([c["detail"] for c, _ in records], ["+3% · Area"])
        self.assertEqual(extract_effects(ability("Skill damage increases by 1% for every 1 Armor Break")), [])

    def test_a_later_trigger_is_not_attached_to_an_earlier_effect(self):
        records = extract_effects(ability("Reduces enemy movement speed within an 800 range by 20%\n◎Activation Condition : 90% chance on attack\n◎range : 500"))
        self.assertEqual(len(records), 1)
        self.assertNotIn("90%", records[0][0]["detail"])
        self.assertNotIn("500", records[0][0]["detail"])

    def test_conditions_and_incomplete_multi_effects_survive(self):
        old = {"category": "stun", "detail": "0.5 s", "source": "sions", "condition": "Upgrade 4"}
        data = {"units": [{"id": "fixture", "capabilities": [old]}]}
        audit = {"units": {"fixture": {"abilities": [ability("Stuns the area for 3 seconds")], "unverified": [], "corrections": []}}}
        apply_map(data, audit)
        self.assertEqual(data["units"][0]["capabilities"][0]["condition"], "Upgrade 4")
        previous = [{"category": "slow", "detail": "-20% · Aura"}, {"category": "slow", "detail": "-99% · Single-target"}]
        data = {"units": [{"id": "fixture", "capabilities": previous.copy()}]}
        audit["units"]["fixture"] = {"abilities": [ability("Reduces enemy movement speed within an 800 range by 20%")], "unverified": [], "corrections": []}
        apply_map(data, audit)
        self.assertEqual(data["units"][0]["capabilities"], previous)
        self.assertTrue(audit["units"]["fixture"]["unverified"])


if __name__ == "__main__":
    unittest.main()
