"""Auditable map matching and reviewed capability corrections (no trigger execution)."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "ref/map-2.323.json"
MAP_AUDIT = ROOT / "docs/capability-map-audit-2.323.json"
RARITIES = {
    "Common": "Common", "Uncommon": "Uncommon", "Random": "Random Only", "Special": "Special",
    "Rare": "Rare", "Legendary": "Legend(?:ary)?", "Hidden": "Hidden", "Distortion": "Distortion",
    "Alternate": "Change", "Seraphim": "Seraphim", "Transcendence": "Transcendence",
    "Limited": "Limit(?:ed)?|Restriction|Restricted", "Immortal": "Immortal",
    "Eternal": "Eternal|Eternity", "Mystic": "Mystery|Mystic",
}
NAMES = {
    "Hacchan": "Hachi", "Bonkurei": "Bon Clay", "Kiku": "Kikunojo", "Wyper": "Wiper",
    "Kinemon": "Kin'emon", "Kid": "Eustass Kid", "Kuma": "Bartholomew Kumar?", "Koby": "Koby|Coby",
    "Nightmare Luffy": "Luffy Nightmare", "Kujo Jotaro": "Jotaro Kujo", "Ryogi Shiki": "Ryougi Shiki",
    "Namikaze Minato": "Minato Namikaze", "Kuchiki Byakuya": "Byakuya Kuchiki",
    "Anya Forger": "Anya Poser", "Yujiro Hanma": "Hanma Yujiro", "Kamijou Touma": "Kamijo Touma",
    "Yagami Light": "Light Yagami", "Yan": "Yen", "Bronya": "Bronya|Burungnya|Herrscher of Reason",
    "Z": "Zephyr|Jet", "X Drake": "X-Drake",
}
# Reviewed identity aliases, not cross-site numeric IDs. Multi-object entries
# permit only shared abilities until the form/upgrade route is established.
EXPLICIT = {
    "common_wisp": ["e018"], "common_gunman": ["h009"],
    "uncommon_sogeking": ["h00N"], "uncommon_chopper": ["h00G"],
    "special_chopperbrain": ["h01E"], "special_capone": ["h01C"], "special_docking": ["h01G"],
    "item_nika": ["I000"], "item_uta": ["I001"], "item_marco": ["I002"],
    "other_rayleigh": ["h05X"], "other_pirateship": ["h060"], "other_kuma": ["h04S"],
    "other_ancientship": ["h05Y"], "other_greenblood": ["h0A4"], "other_seraphim": ["h0AN"],
    "rare_usopp": ["h02C"], "rare_chopper": ["h02K"], "rare_sugar": ["h027"],
    "legendary_marco": ["h02T", "h0BQ"], "legendary_koby": ["h03E"],
    "legendary_shinobu": ["h042", "h0A8"], "distortion_perona": ["h000", "h048", "h08F"],
    "transcendence_sabo": ["H092"], "transcendence_bonney": ["H0BX", "H0BY"],
    "transcendence_doflamingo": ["H09E"],
    "transcendence_snakeman": ["H0B2"], "transcendence_luffy": ["H099", "H0C9"],
    "transcendence_vegapunk_ssnake": ["H0AA"], "transcendence_vegapunk_shawk": ["H0AA"],
    "transcendence_vegapunk_sshark": ["H0AA"], "transcendence_vegapunk_sbear": ["H0AA"],
    "eternal_nikaluffy": ["H0BK"], "eternal_nikasnakeman": ["H0BK"],
    "mystic_gojo": ["h09M"],
}


def fields(obj):
    return {change["field"]: change.get("text", change["value"]) for change in obj["modifications"]}


def match_units(data, snapshot):
    objects = snapshot["files"]["war3map.w3u"]["objects"] + snapshot["files"]["war3map.w3t"]["objects"]
    by_id = {obj["id"]: obj for obj in objects}
    rows = [(obj, fields(obj)) for obj in objects]
    matches = {}
    for unit in data["units"]:
        if unit["id"] in EXPLICIT:
            candidates = [by_id[raw_id] for raw_id in EXPLICIT[unit["id"]]]
            method = "reviewed identity/form alias"
        else:
            name = NAMES.get(unit["name"], re.escape(unit["name"]))
            rarity = RARITIES.get(unit["rarity"], r"(?!)")
            candidates = []
            for obj, values in rows:
                label = values.get("upro") or values.get("unam", "")
                if (re.search(rf" - (?:{rarity})\b", label, re.I)
                        and re.search(rf"\b(?:{name})\b", label, re.I)
                        and not re.search(r"clone|dummy|summon|Level \d|\[Boss\]", label, re.I)):
                    candidates.append(obj)
            method = "character name and rarity; excludes enemies, summons and dummies"
        matches[unit["id"]] = (candidates, method)
    return matches


def audit_map(data):
    snapshot = json.loads(SNAPSHOT.read_text(encoding="utf8"))
    abilities = {obj["id"]: obj for obj in snapshot["files"]["war3map.w3a"]["objects"]}
    upgrades = {obj["id"]: obj for obj in snapshot["files"]["war3map.w3q"]["objects"]}
    matched = match_units(data, snapshot)
    audit = {"map": snapshot["map"], "sha256": snapshot["sha256"],
             "unavailable": snapshot["unavailable"], "upgradeObjects": upgrades, "units": {}}
    for unit in data["units"]:
        candidates, method = matched[unit["id"]]
        sets = [set(fields(obj).get("uabi", "").split(",")) for obj in candidates]
        shared = set.intersection(*sets) if sets else set()
        record = {"name": unit["name"], "rarity": unit["rarity"], "matchMethod": method,
                  "status": "matched" if len(candidates) == 1 else "shared abilities only" if candidates else "unresolved",
                  "objects": [], "abilities": [], "corrections": [], "unverified": []}
        for obj in candidates:
            values = fields(obj)
            record["objects"].append({"rawId": obj["id"], "file": "war3map.w3t" if obj["id"].startswith("I") else "war3map.w3u",
                                      "name": values.get("unam"), "properName": values.get("upro"),
                                      "abilityIds": values.get("uabi", "").split(","),
                                      "upgradeIds": values.get("upgr", "").split(",")})
        for aid in sorted(set.union(*sets) if sets else set()):
            if aid not in abilities:
                continue
            obj = abilities[aid]
            texts = [c for c in obj["modifications"] if c["field"] in ("anam", "atp1", "aub1")]
            record["abilities"].append({"rawId": aid, "shared": aid in shared, "baseId": obj["baseId"],
                                        "file": "war3map.w3a", "textFields": texts})
        upgrade_ids = set(rid for obj in candidates for rid in fields(obj).get("upgr", "").split(","))
        record["upgradeIds"] = [rid for rid in sorted(upgrade_ids) if rid in upgrades]
        if len(candidates) != 1:
            record["unverified"].append("Form-specific abilities are not applied without a verified selection/upgrade route.")
        record["unverified"].append("Trigger-computed mechanics cannot be verified because war3map.j could not be read.")
        audit["units"][unit["id"]] = record
    return audit


def context_for(text):
    """Only a directly stated trigger/range; never infer a stacking total."""
    parts = []
    triggers = list(re.finditer(r"◎Activation Condition\s*:\s*([^\n]+)", text, re.I))
    trigger = triggers[-1] if triggers else None
    if trigger:
        value = trigger[1].strip()
        chance = re.fullmatch(r"([\d.]+)% chance on (?:basic )?attack", value, re.I)
        mana = re.fullmatch(r"(?:Mana ([\d.]+)|([\d.]+) Mana)", value, re.I)
        if chance:
            parts.append(chance[1] + "% on attack")
        elif mana:
            parts.append((mana[1] or mana[2]) + " mana")
    radii = list(re.finditer(r"◎range\s*:\s*(\d+)\s*(?:\n|$)", text, re.I))
    radius = radii[-1] if radii else None
    if radius:
        parts.append("range " + radius[1])
    return parts


def extract_effects(ability):
    """Narrow grammar for explicit effect statements in level-1 tooltips.

    Damage formulas, maxima, self-stuns and trigger-derived fields do not match.
    Every emitted value retains the exact object field and quotation as evidence.
    """
    effects = []
    for field in ability["textFields"]:
        if field["field"] != "aub1" or field["level"] != 1:
            continue
        text = field["text"]
        # Selection/cost tooltips describe acquired abilities, not base effects.
        if re.search(r"◎Cost\s*:|Choose (?:one|a)|select (?:one|a)", text, re.I):
            continue
        for line_number, line in enumerate(text.splitlines()):
            found = []
            aura = re.search(r"Reduces (?:enemy )?(?:defense|armor) by (\d+(?:\.\d+)?) (?:within|in) (?:an? )?(\d+) (?:range|radius)", line, re.I)
            if aura:
                found.append(("shield", "-" + aura[1] + " · Aura · range " + aura[2]))
            single_armor = re.search(r"Reduces single enemy's defense by (\d+(?:\.\d+)?)", line, re.I)
            if single_armor:
                found.append(("shield", "-" + single_armor[1] + " · Single-target"))
            slow = re.search(r"(?:Reduces? (?:enemy )?movement speed|Reduces? the movement speed of [^\n]+?) (?:[^\n]*? )?by ([\d.]+)%", line, re.I)
            if slow and not re.search(r"attack speed|up to|gradually", line, re.I):
                detail = "-" + slow[1] + "%"
                duration = re.search(r"for ([\d.]+) seconds?", line, re.I)
                radius = re.search(r"(?:within|in) (?:an? )?(\d+) (?:range|radius)", line, re.I)
                if re.search(r"single enemy", line, re.I):
                    detail += " · Single-target"
                elif radius:
                    detail += " · Area · range " + radius[1]
                elif re.search(r"within|enemies|affected area|hit by", line, re.I):
                    detail += " · Area"
                if duration:
                    detail += " · " + duration[1] + " s"
                found.append(("slow", detail))
            armor_break = (re.search(r"(\d+)(?:'s)? Armor Break", line, re.I) or
                           re.search(r"Armor Break (?:of the corresponding range|on a single enemy) (\d+)", line, re.I))
            if armor_break and not re.search(r"for every|damage increases|activation condition", line, re.I):
                detail = armor_break[1] + " · " + ("Single-target" if "single enemy" in line.lower() else "Area")
                maximum = re.search(r"(?:stacks up to|reduces up to|decrease up to) (\d+)", line, re.I)
                if maximum:
                    detail += " · max " + maximum[1]
                # No inferred target for an otherwise unqualified break.
                if re.search(r"single enemy|corresponding range|affected area|nearby enemies|within range", line, re.I):
                    found.append(("armorbreak", detail))
            # Only explicitly targeted stuns. A bare 'stun' is retained as an
            # unverified candidate rather than guessing area from an AoE damage.
            target = ("sstun" if re.search(r"single (?:enemy|target)|single stun", line, re.I) else
                      "stun" if re.search(r"affected area|targeted area|stuns? the area|stun.*radius|stun.*within range", line, re.I) else None)
            if target:
                duration = re.search(r"(\d+(?:\.\d+)?)\s*[- ]?seconds?\s+(?:single )?stun", line, re.I)
                if not duration:
                    duration = re.search(r"stuns?[^\n]*?for (\d+(?:\.\d+)?) seconds?", line, re.I)
                if duration:
                    detail = duration[1] + " s"
                    # Retain boss exceptions and ignore-resistance clauses.
                    suffix = re.search(r"\(([^()]*(?:resistance|boss)[^()]*)\)", line, re.I)
                    if suffix:
                        detail += " · " + suffix[1]
                    if re.search(r"per punch|first and last|first hit|last hit", line, re.I):
                        detail += " · " + re.search(r"per punch|first and last hits?|first hit|last hit", line, re.I)[0]
                    found.append((target, detail))
            # Named damage amplification, never generic 'all damage' or an
            # ability that removes/reset debuffs. The target line is preserved.
            for category, expression in [
                ("bombup", r"(?:Explosive damage (?:amplified|amplification)(?: by)?|Amplify Explosive Damage by)\s*([\d.]+)%"),
                ("docking", r"Magic (?:damage )?(?:amplified|amplification)(?: by)?\s*([\d.]+)%"),
                ("mshield", r"Magic (?:Defense|Resistance) (?:reduced|reduction)(?: by)?\s*([\d.]+)%"),
            ]:
                match = re.search(expression, line, re.I)
                if not match:
                    # A percentage before the label, e.g. 10% Explosive Damage Amplification.
                    name = {"bombup": "Explosive Damage Amplification", "docking": "Magic Damage Amplification",
                            "mshield": "Magic Defense Reduction"}[category]
                    match = re.search(r"([\d.]+)% " + name, line, re.I)
                if match and not re.search(r"up to|increase.*up|reset|remove", line, re.I):
                    detail = ("-" if category == "mshield" else "+") + match[1] + "%"
                    if re.search(r"your lane zone|your lane monsters", line, re.I):
                        detail += " · Your lane"
                    elif re.search(r"single enemy|single target|target's", line, re.I):
                        detail += " · Single-target"
                    elif re.search(r"target range|affected area|within range", line, re.I):
                        detail += " · Area"
                    if "(Stacks)" in line:
                        detail += " · Stacks"
                    found.append((category, detail))
            for category, detail in found:
                # Supplemental context is separate from the signed effect value.
                # Never borrow a trigger from a later skill subsection.
                context = context_for("\n".join(text.splitlines()[:line_number + 1]))
                if context and not aura:
                    detail += " · " + " · ".join(context)
                evidence = {"file": "war3map.w3a", "rawAbilityId": ability["rawId"],
                            "field": field["field"], "level": field["level"],
                            "line": line_number, "quote": line.strip(), "originalText": field["value"]}
                effects.append(({"category": category, "detail": detail, "source": "warcraft-map"}, evidence))
    return effects


# Statements needing explicit context across lines rather than generic parsing.
REVIEWED = {
    "transcendence_doflamingo": [
        ("A0BM", "shield", "-60 · Mana skill: 150 mana · 7.5 s · range 850", "Reduces enemy armor by 60 in an 850 radius for 7.5 seconds"),
        ("A0CJ", "slow", "-250% · Skill · 4.5 s · 18% on attack · range 525", "Reduces the movement speed of enemies hit by the skill by 250% for 4.5 seconds."),
        ("A0CJ", "slow", "-75% · Aftershock · 2 s · Area", "Reduces movement speed by 75% for 2 seconds within the affected area"),
    ],
    "legendary_kalgara": [
        ("A060", "shield", "-20 · Aura · range 825", "Reduces enemy defense by 20 in an 825 range"),
        ("A060", "shield", "-20 · Story / lane · Basic attack · 20 s", "Line Monster, Story: Reduces Defense by an additional 20 for 20 seconds"),
        ("A060", "shield", "-40 · Boss · Basic attack · 20 s", "Boss: Reduces armor by an additional 40 for 20 seconds"),
    ],
    "seraphim_ssnake": [
        ("A13S", "bombup", "+3% · Area · max 25% · Pistol Kiss hits 6 times", "Explosive damage amplified by 3%"),
    ],
    "alternate_carrot": [
        ("A0RF", "bombup", "+1% · Area · max 25%", "Explosive damage amplified by 1%"),
    ],
}


def apply_map(data, audit):
    for unit in data["units"]:
        record = audit["units"][unit["id"]]
        current = unit.get("capabilities", [])
        candidates = []
        for ability in record["abilities"]:
            if ability["shared"]:
                candidates.extend(extract_effects(ability))
        reviewed_categories = {r[1] for r in REVIEWED.get(unit["id"], [])}
        candidates = [(c, e) for c, e in candidates if c["category"] not in reviewed_categories]
        for aid, category, detail, quote in REVIEWED.get(unit["id"], []):
            ability = next(a for a in record["abilities"] if a["rawId"] == aid and a["shared"])
            field = next(f for f in ability["textFields"] if f["field"] == "aub1" and f["level"] == 1 and quote in f["text"])
            candidates.append(({"category": category, "detail": detail, "source": "warcraft-map"},
                               {"file": "war3map.w3a", "rawAbilityId": aid, "field": "aub1", "level": 1,
                                "quote": quote, "originalText": field["value"]}))
        for category in dict.fromkeys(c["category"] for c, _ in candidates):
            old = [c for c in current if c["category"] == category]
            replacements = [(c, e) for c, e in candidates if c["category"] == category]
            conditions = {c["condition"] for c in old if c.get("condition")}
            if old and all(c.get("condition") for c in old):
                if len(conditions) != 1:
                    record["unverified"].append(f"{category}: multiple existing selection conditions; no automatic correction.")
                    continue
                for effect, _ in replacements:
                    effect["condition"] = next(iter(conditions))
            # Multi-effect armor categories require complete target coverage;
            # an aura alone cannot replace an additional boss/skill reduction.
            if len(old) > 1 and category not in reviewed_categories:
                record["unverified"].append(category + ": multiple previous effects; retained pending a complete comparison.")
                continue
            new = []
            for effect, _ in replacements:
                if effect not in new:
                    new.append(effect)
            current = [c for c in current if c["category"] != category or (c.get("condition") and not all(o.get("condition") for o in old))]
            current.extend(new)
            record["corrections"].append({"category": category, "previous": old, "replacement": new,
                                          "evidence": [e for _, e in replacements]})
        if current:
            unit["capabilities"] = current
    return audit


if __name__ == "__main__":
    data = json.loads((ROOT / "public/data/2.323.json").read_text(encoding="utf8"))
    audit = audit_map(data)
    MAP_AUDIT.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print({status: sum(record["status"] == status for record in audit["units"].values())
           for status in ["matched", "shared abilities only", "unresolved"]})
