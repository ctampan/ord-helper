"""Offline source precedence and migration regression cases."""
from copy import deepcopy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from capability_sources import resolve_sources  # noqa: E402


class SourceTests(unittest.TestCase):
    def test_priority_keeps_distinct_effects_and_conditions(self):
        data = {"units": [{"id": "fixture", "capabilities": [
            {"category": "shield", "detail": "-5", "source": "sions"},
            {"category": "shield", "detail": "-10", "source": "ordsearch"},
            {"category": "shield", "detail": "-20 · Aura", "source": "warcraft-map"},
            {"category": "shield", "detail": "-40 · Boss", "source": "warcraft-map"},
            {"category": "shield", "detail": "-7", "source": "sions", "condition": "Upgrade 4"},
            {"category": "slow", "detail": "-15%", "source": "sions"},
            {"category": "slow", "detail": "-25%", "source": "ordsearch"},
            {"category": "ignore", "source": "sions"},
        ]}]}
        audit = resolve_sources(data)
        self.assertEqual([c["detail"] for c in data["units"][0]["capabilities"] if "detail" in c],
                         ["-20 · Aura", "-40 · Boss", "-7", "-25%"])
        self.assertEqual(len(audit["units"]["fixture"]["previous"]["capabilities"]), 8)

    def test_alternative_text_is_archived_and_repeated_runs_are_stable(self):
        data = {"units": [{"id": "fixture", "capabilities": [
            {"category": "shield", "detail": "-15 · Skill · Mana skill (Sions) · 4.5 s (Sions)", "source": "ordsearch"}],
            "abilityDetails": "Cooldown 1.5s. Sions — Armor reduction: -20. Keep unrelated context.",
            "note": "Command: keep. Armor reduction: ORDSearch values are shown in the tags; Sions values/context are retained in ability details."}]}
        audit = resolve_sources(data)
        self.assertEqual(data["units"][0]["capabilities"][0]["detail"], "-15 · Skill")
        self.assertEqual(data["units"][0]["abilityDetails"], "Cooldown 1.5s. Keep unrelated context.")
        self.assertEqual(data["units"][0]["note"], "Command: keep.")
        saved = deepcopy(data)
        self.assertEqual(resolve_sources(data, audit), audit)
        self.assertEqual(data, saved)
        self.assertIn("Sions — Armor reduction: -20", audit["units"]["fixture"]["previous"]["abilityDetails"])


if __name__ == "__main__":
    unittest.main()
