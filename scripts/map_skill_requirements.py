"""Restore explicit resource requirements and swimming from local map objects.

Run after extracting ref/map-2.323.json. No network or map script execution.
Existing numerical corrections, notes, recipes and subgroup ordering are preserved.
"""
import json
import re

from map_capabilities import ROOT, SNAPSHOT, audit_map, fields

SKILL_AUDIT = ROOT / "docs/capability-map-skills-2.323.json"
MAP_SHA256 = "6de87277d89edccb359b442f1498f69a5e675c0c3d7479bb37c91dabd30ab8ca"
# Reviewed playable starting objects. Other matched objects include permanent
# upgrades, transformed models and Aloc-only visual shells. These selections
# apply only to the resource/mobility supplement, not existing numeric effects.
BASE_FORMS = {
    "distortion_perona": "h048", "transcendence_usopp": "H09B",
    "transcendence_chopper": "H091", "transcendence_yamato": "H0BD",
    "transcendence_franky": "H08Y", "limited_marco": "h08O",
    "immortal_kaido": "h07M", "eternal_cavendish": "h05B",
    "eternal_ryuma": "h0CJ",
}
# Explicit acquisition/transform descriptions, not conditions inferred from IDs.
ACQUIRED_SKILLS = {
    "transcendence_franky": {"A188": ("Upgrade 4", "A12D", "Requires 4 Attribute Points")},
    "limited_marco": {"A17K": ("Phoenix form", "A172", "Phoenix Form")},
}
RESOURCE = re.compile(r"\b(?:HP|Health|Mana)\s+(?:is\s+)?\d|\d+(?:\.\d+)?\s+(?:HP|Health|Mana)\b|\bmana reaches \d", re.I)


def extract_skill_requirements(ability):
    """Read activation clauses, never HP damage, regeneration or mana capacity."""
    results = []
    title = next((f["text"] for f in ability["textFields"]
                  if f["field"] == "atp1" and f["level"] == 1), "")
    for field in ability["textFields"]:
        if field["field"] != "aub1" or field["level"] != 1:
            continue
        text = field["text"]
        if re.search(r"◎Cost\s*:|Choose (?:one|a)|select (?:one|a)", text, re.I):
            continue
        lines = text.splitlines()
        for index, line in enumerate(lines):
            trigger = re.search(r"◎Activation Conditions?(?: \d+)?\s*:\s*(.+)", line, re.I)
            continuation = re.search(r"▶\s*(Activates when .+)", line, re.I)
            clause = (trigger or continuation)
            if not clause or not RESOURCE.search(clause[1]):
                continue
            # Clauses explicitly tied to the enemy are not the caster's resource.
            value = clause[1].strip()
            if re.search(r"enemy(?:'s)? (?:HP|Health|Mana)", value, re.I):
                continue
            for category, resource in [("hp-skill", r"HP|Health"), ("mana-skill", "Mana")]:
                if not re.search(rf"\b(?:{resource})\b", value, re.I):
                    continue
                detail = re.sub(r"\bHealth\b", "HP", value, flags=re.I)
                if continuation and index and "◎Activation Condition" in lines[index - 1]:
                    detail += " · " + lines[index - 1].split(":", 1)[1].strip()
                # Keep directly adjacent activation qualifications (e.g. Law's
                # one activation per Room), without borrowing later subsections.
                following = []
                for extra in lines[index + 1:]:
                    if "◎Activation" in extra:
                        break
                    if re.search(r"▶\s*Activates only once", extra, re.I):
                        following.append(extra.split("▶", 1)[1].strip())
                detail = " · ".join([detail, title] + following).strip(" ·")
                effect = {"category": category, "detail": detail, "source": "warcraft-map"}
                # This is an acquired skill, rather than a normal resource trigger.
                if "while Vegapunk's Knowledge is active" in value:
                    effect["condition"] = "Vegapunk's Knowledge"
                evidence = {"file": "war3map.w3a", "rawAbilityId": ability["rawId"],
                            "field": "aub1", "level": 1, "quote": line.strip(),
                            "originalText": field["value"]}
                results.append((effect, evidence))
    return results


def supplement_skills(data, snapshot, map_audit=None, previous_audit=None, original_notes=None):
    """Enrich existing data without reapplying/destructively replacing effects."""
    map_audit = map_audit or audit_map(data)
    if map_audit["sha256"] != snapshot["sha256"]:
        raise ValueError("Skill evidence and map identity audit must use the same map")
    objects = {o["id"]: o for o in snapshot["files"]["war3map.w3u"]["objects"]}
    result = {"map": snapshot["map"], "sha256": snapshot["sha256"],
              "unavailable": snapshot["unavailable"], "units": {}}
    for unit in data["units"]:
        uid = unit["id"]
        matched = map_audit["units"][uid]
        ids = [o["rawId"] for o in matched["objects"] if o["rawId"] in objects]
        base_id = BASE_FORMS.get(uid)
        if base_id and base_id not in ids:
            raise ValueError(f"Reviewed base object no longer matches {uid}: {base_id}")
        base_ids = [base_id] if base_id else ids
        base_abilities = (set.intersection(*(set(fields(objects[rid]).get("uabi", "").split(","))
                                            for rid in base_ids)) if base_ids else set())
        record = {"rawUnitIds": ids, "baseUnitIds": base_ids, "additions": [], "unverified": []}
        result["units"][uid] = record
        candidates = []
        for ability in matched["abilities"]:
            effects = extract_skill_requirements(ability)
            if ability["rawId"] in base_abilities:
                candidates.extend(effects)
            elif ability["rawId"] in ACQUIRED_SKILLS.get(uid, {}):
                condition, acquisition_id, quote = ACQUIRED_SKILLS[uid][ability["rawId"]]
                acquisition = next(a for a in matched["abilities"] if a["rawId"] == acquisition_id)
                field = next(f for f in acquisition["textFields"] if quote in f["text"])
                for effect, evidence in effects:
                    effect["condition"] = condition
                    evidence["acquisition"] = {"rawAbilityId": acquisition_id, "field": field["field"],
                                               "level": field["level"], "quote": quote, "originalText": field["value"]}
                    candidates.append((effect, evidence))
            elif effects:
                record["unverified"].append({"rawAbilityId": ability["rawId"],
                    "reason": "Non-base form; acquisition route is not verified.",
                    "requirements": [evidence for _, evidence in effects]})
        # Amphibious movement explicitly covers land and water. Do not infer
        # swimming from a character's name, flying, or a water-themed attack.
        if base_ids and all(fields(objects[rid]).get("umvt") == "amph" for rid in base_ids):
            candidates.append(({"category": "swimming", "source": "warcraft-map"}, {
                "file": "war3map.w3u", "rawUnitIds": base_ids, "field": "umvt",
                "value": "amph", "originalValues": [next(c for c in objects[rid]["modifications"]
                    if c["field"] == "umvt")["value"] for rid in base_ids]}))
        # User-confirmed Flying corresponds to Tiger's explicitly described
        # terrain-ignoring traversal; this does not classify other terrain skills.
        if uid == "hidden_tiger":
            ability = next(a for a in matched["abilities"] if a["rawId"] == "A0DZ")
            field = next(f for f in ability["textFields"] if f["field"] == "aub1" and f["level"] == 1)
            quote = "Move ignoring terrain"
            if quote not in field["text"] or ability["rawId"] not in base_abilities:
                raise ValueError("Fisher Tiger traversal evidence changed")
            candidates.append(({"category": "sky", "detail": "Ignores terrain", "source": "warcraft-map"}, {
                "file": "war3map.w3a", "rawAbilityId": ability["rawId"], "field": "aub1",
                "level": 1, "quote": quote, "originalText": field["value"],
                "classification": "Flying classification confirmed by user; map verifies terrain-ignoring movement"}))
        caps = unit.setdefault("capabilities", [])
        for effect, evidence in candidates:
            # Re-running must leave both data and the provenance stable.
            previous = [c for c in caps if c["category"] == effect["category"]]
            prior = (previous_audit or {}).get("units", {}).get(uid, {}).get("additions", [])
            prior_effect = next((p for p in prior if p["replacement"] == effect), None)
            if prior_effect:
                previous = prior_effect["previous"]
            if not any({k: v for k, v in existing.items() if k not in {"numeric", "exclusiveGroup"}} == effect for existing in caps):
                # A bare Flying tag carries no additional context to retain.
                if uid == "hidden_tiger" and effect["category"] == "sky":
                    caps[:] = [c for c in caps if c["category"] != "sky"]
                caps.append(effect)
            entry = next((p for p in record["additions"] if p["replacement"] == effect), None)
            if entry:
                entry["evidence"].append(evidence)
            else:
                record["additions"].append({"previous": previous, "replacement": effect, "evidence": [evidence]})
        if not caps:
            unit.pop("capabilities")
        original = (original_notes or {}).get(uid, {}).get("originalNote", "")
        for category, expression in [("hp-skill", r"HP skill|HP and mana skills|HP/mana skill"),
                                     ("mana-skill", r"mana skill|HP and mana skills|HP/mana skill")]:
            if re.search(expression, original, re.I) and not any(c["category"] == category for c in caps):
                record["unverified"].append({"category": category, "originalNote": original,
                    "reason": "Previous annotation has no explicit resource activation requirement in readable map object data; war3map.j is unavailable. No filter category or value is guessed."})
    return result


def main():
    data_path = ROOT / "public/data/2.323.json"
    data = json.loads(data_path.read_text(encoding="utf8"))
    snapshot = json.loads(SNAPSHOT.read_text(encoding="utf8"))
    if snapshot["sha256"] != MAP_SHA256:
        raise ValueError("Review form identities against the new map before applying this 2.323 supplement")
    previous = json.loads(SKILL_AUDIT.read_text(encoding="utf8")) if SKILL_AUDIT.exists() else None
    original = json.loads((ROOT / "docs/capability-audit-2.323.json").read_text(encoding="utf8"))["units"]
    audit = supplement_skills(data, snapshot, previous_audit=previous, original_notes=original)
    for path, value in [(data_path, data), (SKILL_AUDIT, audit)]:
        newline = "\r\n" if path.exists() and b"\r\n" in path.read_bytes() else "\n"
        content = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").replace("\n", newline)
        path.write_bytes(content.encode("utf8"))
    for category in ["hp-skill", "mana-skill", "swimming"]:
        print(category, sum(any(c["category"] == category and not c.get("condition")
              for c in u.get("capabilities", [])) for u in data["units"]))


if __name__ == "__main__":
    main()
