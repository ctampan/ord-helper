"""Offline map-reader and conservative extraction regression cases."""
import importlib.util
import struct
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from map_capabilities import apply_map, extract_effects  # noqa: E402

spec = importlib.util.spec_from_file_location("map_reader", ROOT / "scripts/extract-warcraft-map.py")
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


def ability(text, level=1):
    return {"rawId": "A001", "shared": True, "textFields": [
        {"field": "aub1", "level": level, "value": text, "text": text}]}


class MapTests(unittest.TestCase):
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
