"""Select one source per effect/condition and archive superseded display text.

Can also migrate the bundled data offline using its saved provenance, without
requiring the original website snapshots. No map mechanics are inferred here.
"""
from copy import deepcopy
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE_AUDIT = ROOT / "docs/capability-source-audit-2.323.json"
SOURCE_PRIORITY = ("warcraft-map", "tmo", "ordsearch", "sions")
DISPLAY_FIELDS = ("capabilities", "abilityDetails", "note")
SENTENCES = re.compile(r"(?<=[.!?])\s+")
WARNING = re.compile(
    r"(?:(?:Armor reduction|Movement slow): )?ORDSearch values are shown in the tags; "
    r"Sions values/context are retained in ability details\."
    r"|(?:Movement slow|Values) differs? between references\."
    r"|Alternative values/context are retained in ability details\.", re.I)

# Reviewed descriptive effects that previously exposed source comparisons.
# Each replacement is checked against the saved map's exact level-1 text.
TEXT_CORRECTIONS = {
    "legendary_hibari": (
        "Source title lists total-HP damage 7.5% against bosses/berserk enemies and 22.5% against normal enemies; description lists additional boss damage 6% of total HP and 2,000,000 magic damage against story enemies.",
        "Total-HP damage: 7.5% against bosses/berserk enemies and 22.5% against lane enemies; 2,000,000 magic damage against story enemies.",
        "A0HR", ["22.5% of Total Health", "7.5% of total HP", "Story : 2 million magic damage"], None),
    "legendary_zoro": (
        "Source title lists execution of lane enemies below 13% HP; description lists guaranteed execution/deletion of a single enemy at 12% HP or below.",
        "Guaranteed execution of a single lane enemy at 15% HP or below.",
        "A0A9", ["Instantly execute a single lane monster if its health is 15% or less", "100% chance on execution targets"], None),
    "transcendence_doflamingo": (
        "source description lists Upgrade 3 extending awakening from 4.5s to 6s",
        "Upgrade 4 extends awakening by 1.5s",
        "A0CK", ["Increases duration by 1.5 seconds", "Requires 4 Attribute Points"], None),
    "transcendence_franky": (
        "Shipwright can craft 2 Sunny ships; source title lists cost 8 wood, description lists 10 wood.",
        "Shipwright crafts 2 Sunny ships for 8 wood.",
        "A0G7", ["'Thousand Sunny' Craft 2", "8 pieces of wood"], "H08Y"),
    "transcendence_koby": (
        "Summons clones; source title lists explosion damage and description lists armor-ignoring damage.",
        "Summons clones that deal 60% of their attack power as explosion damage within range 400 and 60,000 magic damage to a single enemy per attack.",
        "A1CR", ["60% of clone attack power as explosive damage", "400 range", "60,000 magic damage to a single enemy"], None),
}

# Project compound fallback descriptions onto their own category. Otherwise a
# retained Sions buff tag can repeat a superseded stun/amplification value.
COMPOUND_DETAILS = {
    "legendary_lucci": {"single": "Single-target current-HP damage"},
    "hidden_vergo": {"shield": {
        "Mana skill: armor reduction 30 for 5s and stun 2.5s": "Mana skill: armor reduction 30 for 5s",
        "single-target stun and armor reduction": "Single-target armor reduction"}},
    "hidden_maxim": {"mshield": "Mana skill: magic resistance reduction 6"},
    "hidden_decken": {"rangellpd": "Mana skill: damage equal to 4% of missing HP"},
    **{f"seraphim_{form}": {"sky": "Flying"} for form in ("ssnake", "shawk", "sshark", "sbear")},
    "transcendence_sabo": {"rangenlpd": "Mana skill: physical area damage equal to 1.5% of current HP"},
    "transcendence_aokiji": {"sky": "Flying", "regen": "Self mana regeneration", "slow": "-10"},
    "limited_alvida": {"rangellpd": "Mana skill: missing-HP damage", "armorbreak": "Mana skill: Armor Break 10"},
    "limited_enel": {"rangetlpd": "Mana skill: area damage equal to 2% of total HP", "last": "Single-target total-HP damage"},
}


def rank(source):
    return SOURCE_PRIORITY.index(source) if source in SOURCE_PRIORITY else len(SOURCE_PRIORITY)


def resolve_sources(data, previous_audit=None, map_audit=None):
    audit = {"priority": list(SOURCE_PRIORITY), "scope": "category and condition", "units": {}}
    if previous_audit and "tmoSnapshot" in previous_audit:
        audit["tmoSnapshot"] = deepcopy(previous_audit["tmoSnapshot"])
    if previous_audit and "armorStackingSnapshot" in previous_audit:
        audit["armorStackingSnapshot"] = deepcopy(previous_audit["armorStackingSnapshot"])
    if previous_audit and "supportNumericSnapshot" in previous_audit:
        audit["supportNumericSnapshot"] = deepcopy(previous_audit["supportNumericSnapshot"])
    for unit in data["units"]:
        before = {key: deepcopy(unit[key]) for key in DISPLAY_FIELDS if key in unit}
        prior = (previous_audit or {}).get("units", {}).get(unit["id"], {})
        text_selections = deepcopy(prior.get("textSelections", []))
        correction = TEXT_CORRECTIONS.get(unit["id"])
        if correction and correction[0] in unit.get("note", ""):
            old, new, ability_id, quotes, unit_id = correction
            evidence = (map_audit or {}).get("units", {}).get(unit["id"])
            if evidence is None:
                raise ValueError(f"{unit['id']}: saved map evidence is required for the note correction")
            ability = next(a for a in evidence["abilities"] if a["rawId"] == ability_id)
            field = next(f for f in ability["textFields"] if f["field"] == "aub1" and f["level"] == 1
                         and all(quote in f["text"] for quote in quotes))
            if unit_id:
                # Shipwright belongs to Franky's normal form, not General Franky.
                assert any(o["rawId"] == unit_id and ability_id in o["abilityIds"] for o in evidence["objects"])
            else:
                assert ability["shared"]
            unit["note"] = unit["note"].replace(old, new)
            text_selections = [{"source": "warcraft-map", "field": "note", "replacement": new,
                                "evidence": {"file": "war3map.w3a", "rawAbilityId": ability_id,
                                             "rawUnitIds": [unit_id] if unit_id else [o["rawId"] for o in evidence["objects"]],
                                             "field": "aub1", "level": 1, "quotes": quotes,
                                             "originalText": field["value"]}}]
        groups = {}
        for effect in unit.get("capabilities", []):
            key = (effect["category"], effect.get("condition"))
            groups.setdefault(key, []).append(effect)
        selected = {key: min(effects, key=lambda c: rank(c.get("source"))).get("source")
                    for key, effects in groups.items()}
        caps = []
        for effect in unit.get("capabilities", []):
            if effect.get("source") != selected[(effect["category"], effect.get("condition"))]:
                continue
            effect = deepcopy(effect)
            projection = COMPOUND_DETAILS.get(unit["id"], {}).get(effect["category"])
            if projection and effect.get("source") == "sions":
                if isinstance(projection, dict):
                    projection = projection.get(effect.get("detail"))
                elif not re.search(r"\band\b|,", effect.get("detail", ""), re.I):
                    projection = None
                if projection:
                    effect["detail"] = projection
            # Historical ORDSearch tags embedded duration/activation from Sions.
            # Those clauses must not masquerade as evidence from the chosen source.
            if effect.get("source") == "ordsearch" and "detail" in effect:
                effect["detail"] = " · ".join(
                    clause for clause in effect["detail"].split(" · ") if "(Sions)" not in clause)
            if effect not in caps:
                caps.append(effect)
        if caps:
            unit["capabilities"] = caps
        else:
            unit.pop("capabilities", None)

        details = []
        for sentence in SENTENCES.split(unit.get("abilityDetails", "")):
            alternative = re.match(r"Sions\s*—\s*(Armor reduction|Movement slow):", sentence)
            if alternative:
                category = "shield" if alternative[1] == "Armor reduction" else "slow"
                source = selected.get((category, None))
                if source in ("warcraft-map", "ordsearch"):
                    continue
            details.append(sentence)
        text = " ".join(details).strip().replace("(source does not specify the effect's unit)", "(unit unspecified)")
        text = re.sub(r"(?:ORDSearch|Sions|Warcraft map)\s*—\s*", "", text)
        if text:
            unit["abilityDetails"] = text
        else:
            unit.pop("abilityDetails", None)

        note = WARNING.sub("", unit.get("note", ""))
        # These same-source title/description disagreements have explicit map
        # replacements, so neither outdated Sions claim belongs in the UI.
        if selected.get(("stun", None)) == "warcraft-map":
            note = re.sub(r"Source title lists stun [\d.]+s; description lists [\d.]+s\.", "", note)
            note = re.sub(r"; area stun \(source title: [\d.]+s; description: [\d.]+s\)", "", note)
        if selected.get(("shield", None)) == "warcraft-map":
            note = re.sub(r"Source title lists armor reduction .*?; description lists armor reduction .*?\.(?=\s|$)", "", note)
        note = re.sub(r"\s+", " ", note).strip()
        if note:
            unit["note"] = note
        else:
            unit.pop("note", None)

        after = {key: deepcopy(unit[key]) for key in DISPLAY_FIELDS if key in unit}
        record = {"selected": [{"category": category, **({"condition": condition} if condition else {}),
                                 "source": source} for (category, condition), source in selected.items()]}
        if text_selections:
            record["textSelections"] = text_selections
        if "tmoSelections" in prior:
            record["tmoSelections"] = deepcopy(prior["tmoSelections"])
        if "numericSelections" in prior:
            record["numericSelections"] = deepcopy(prior["numericSelections"])
        if before != after:
            record["previous"] = prior.get("previous", before)
            record["replacement"] = after
        elif "previous" in prior:
            # Re-running the migration preserves the original discarded claims.
            record["previous"] = prior["previous"]
            record["replacement"] = after
        audit["units"][unit["id"]] = record
    return audit


def main():
    data_path = ROOT / "public/data/2.323.json"
    data = json.loads(data_path.read_text(encoding="utf8"))
    previous = json.loads(SOURCE_AUDIT.read_text(encoding="utf8")) if SOURCE_AUDIT.exists() else None
    map_audit = json.loads((ROOT / "docs/capability-map-audit-2.323.json").read_text(encoding="utf8"))
    audit = resolve_sources(data, previous, map_audit)
    for path, value in [(data_path, data), (SOURCE_AUDIT, audit)]:
        newline = "\r\n" if path.exists() and b"\r\n" in path.read_bytes() else "\n"
        path.write_bytes((json.dumps(value, ensure_ascii=False, indent=2) + "\n").replace("\n", newline).encode("utf8"))
    print(f"Audited {len(audit['units'])} units; "
          f"{sum('previous' in record for record in audit['units'].values())} cleaned display records.")


if __name__ == "__main__":
    main()
