"""Apply reviewed, versioned damage classifications without guessing combat DPS.

The source JSON is deliberately separate from generated game data. Evidence is
checked against bundled map audits, so regeneration needs neither network nor
the ignored original map. Only reviewed base abilities establish base damage.
"""
from copy import deepcopy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scripts/data/damage-profiles-2.323.json"
AUDIT = ROOT / "docs/damage-profile-audit-2.323.json"
TYPES = {"Physical", "Magic", "Explosion"}


def enrich_damage_profiles(data, map_audit, source=None):
    source = source or json.loads(SOURCE.read_text(encoding="utf8"))
    if source["version"] != data["version"] or source["mapSha256"] != map_audit.get("sha256"):
        raise ValueError("Damage profiles require the reviewed dataset and map identity")
    audit = {"version": data["version"], "mapSha256": source["mapSha256"],
             "policy": source["policy"], "units": {}}
    for unit in data["units"]:
        uid = unit["id"]
        record = source["units"].get(uid)
        if record is None:
            raise ValueError(f"Missing reviewed damage profile: {uid}")
        profile = record["profile"]
        types = profile["types"]
        if (not isinstance(types, list) or len(types) != len(set(types)) or not set(types) <= TYPES or
                (profile["dominant"] is not None and profile["dominant"] not in types) or
                type(profile["core"]) is not bool or (profile["core"] and not types) or not record["review"]):
            raise ValueError(f"Invalid reviewed damage profile: {uid}")
        mapped = map_audit["units"][uid]
        objects = [o for o in mapped["objects"] if o["rawId"] in record["baseUnitIds"]]
        if len(objects) != len(record["baseUnitIds"]):
            raise ValueError(f"Base object mismatch: {uid}")
        abilities = set.intersection(*(set(o["abilityIds"]) for o in objects)) if objects else set()
        supported = set()
        for evidence in record["evidence"]:
            ability = next((a for a in mapped["abilities"] if a["rawId"] == evidence["rawAbilityId"]), None)
            if (evidence["rawAbilityId"] not in abilities or not ability or
                    not any(f["field"] == "aub1" and f["level"] == 1 and
                            evidence["quote"] in f["text"] for f in ability["textFields"])):
                raise ValueError(f"Unverified base damage evidence: {uid}")
            supported.add(evidence["type"])
        if set(types) != supported:
            raise ValueError(f"Damage types must match reviewed evidence: {uid}")
        unit["damageProfile"] = deepcopy(profile)
        audit["units"][uid] = deepcopy(record)
    return audit


def write_json(path, value):
    newline = "\r\n" if path.exists() and b"\r\n" in path.read_bytes() else "\n"
    path.write_bytes((json.dumps(value, ensure_ascii=False, indent=2) + "\n").replace("\n", newline).encode("utf8"))


def main():
    path = ROOT / "public/data/2.323.json"
    data = json.loads(path.read_text(encoding="utf8"))
    mapped = json.loads((ROOT / "docs/capability-map-audit-2.323.json").read_text(encoding="utf8"))
    source = json.loads(SOURCE.read_text(encoding="utf8"))
    if set(source["units"]) != {u["id"] for u in data["units"]}:
        raise ValueError("Review every retained unit/item, including unclassified entries")
    audit = enrich_damage_profiles(data, mapped, source)
    write_json(path, data)
    write_json(AUDIT, audit)
    print("Reviewed damage profiles:", len(audit["units"]))


if __name__ == "__main__":
    main()
