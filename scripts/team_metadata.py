"""Offline TMO 2.323 matching and conservative structured team-stat metadata.

The public helper snapshot is data, never evaluated JavaScript. Its raw Warcraft
codes are stored backwards; matching requires the exact decoded object identity.
Personal layouts, unspecific stun flags and aggregate multi-effect values do not
establish targeting, stacking, base availability or a recommended composition.
"""
from copy import deepcopy
import hashlib
import json
import math
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
TMO_SNAPSHOT = ROOT / "scripts/data/tmo-2.323.json"
ARMOR_SNAPSHOT = ROOT / "scripts/data/armor-stacking-2.323.json"
SUPPORT_SNAPSHOT = ROOT / "scripts/data/support-numeric-2.323.json"
# Compound tooltip links the selected values to separate native aura objects.
# The buff identity establishes duplicate exclusion; it does not establish a
# winner against unequal values or a verified additive relationship to others.
SUPPORT_CONTEXT = {
    ("legendary_dragon", "speedb"): ("A09M", "Increases attack speed and damage of allies within an 800 range by 5% and 25%, respectively.",
        "A09L", 5, "allies"),
    ("legendary_dragon", "slow"): ("A09M", "Reduces enemy armor and movement speed by 10 and 10% within an 800 range.",
        "A09N", -10, "area"),
}
FIELDS = ("capabilities", "abilityDetails", "note")
# Units are supplied only when the public label/context establishes them.
TMO_FIELDS = {
    "방어력 감소": ("shield", -1, "armor", "unknown", "unknown"),
    "발동방어력 감소": ("shield", -1, "armor", "unknown", "proc"),
    "단일방어력 감소": ("shield", -1, "armor", "single", "unknown"),
    "이동속도 감소": ("slow", -1, "%", "unknown", "unknown"),
    "발동이동속도 감소": ("slow", -1, "%", "unknown", "proc"),
    "공격력 증가": ("damageb", 1, None, "unknown", "unknown"),
    "발동공격력 증가": ("damageb", 1, None, "unknown", "proc"),
    "공격속도 증가": ("speedb", 1, None, "unknown", "unknown"),
    "마나 재생": ("regen", 1, None, "unknown", "unknown"),
    "체력 재생": ("life", 1, None, "unknown", "unknown"),
    "마법방어력 감소": ("mshield", -1, None, "unknown", "unknown"),
    "폭발형 데미지 증폭": ("bombup", 1, None, "unknown", "unknown"),
    "마법데미지 증폭": ("docking", 1, None, "unknown", "unknown"),
}


def extract_snapshot(html_path, output=TMO_SNAPSHOT):
    html = Path(html_path).read_text(encoding="utf8")
    title = re.search(r"<title>(.*?)</title>", html)
    if not title or title[1] != "2.323":
        raise ValueError("Expected the reviewed 2.323 helper title")
    canonical = "https://tmo.gg/g/ord/build-helper/53979"
    if canonical not in html:
        raise ValueError("Unexpected helper identity")
    chunks = []
    for match in re.finditer(r"self\.__next_f\.push\((\[.*?\])\)</script>", html, re.S):
        value = json.loads(match[1])
        if value[0] == 1:
            chunks.append(value[1])
    stream = "".join(chunks)
    offset = stream.find('{"groups":')
    if offset < 0:
        raise ValueError("No plain helper data was present; protected payloads are not decoded")
    payload, _ = json.JSONDecoder().raw_decode(stream[offset:])
    snapshot = {"version": "2.323", "url": canonical, "title": title[1],
                "htmlSha256": hashlib.sha256(html.encode()).hexdigest(),
                "groups": payload["groups"], "guideStatus": "Personal helper layout; no verified build composition."}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes((json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n").encode("utf8"))
    return snapshot


def apply_tmo(data, map_audit, snapshot):
    if snapshot["version"] != data["version"] or snapshot["title"] != data["version"]:
        raise ValueError("TMO snapshot version mismatch")
    identities = {}
    for uid, record in map_audit["units"].items():
        for obj in record["objects"]:
            identities.setdefault(obj["rawId"], set()).add(uid)
    matched, evidence = {}, {}
    for group in snapshot["groups"]:
        for entry in group["units"]:
            raw_ids = [code[::-1] for code in entry.get("codes", [])]
            ids = set().union(*(identities.get(raw_id, set()) for raw_id in raw_ids))
            if len(ids) == 1:
                uid = next(iter(ids))
                matched.setdefault(uid, []).append(entry)
    for unit in data["units"]:
        entries = matched.get(unit["id"], [])
        if len(entries) != 1 or unit["rarity"] == "Common":
            continue  # Explicit forms/variants are not merged into one base claim.
        entry = entries[0]
        candidates = {}
        for key, (category, sign, scalar_unit, target, activation) in TMO_FIELDS.items():
            value = entry.get("abilities", {}).get(key)
            if type(value) not in (int, float) or not math.isfinite(value) or value <= 0:
                continue  # Empty, zero and boolean flags are not numeric evidence.
            detail = f"{'-' if sign < 0 else '+'}{value:g}" + ("%" if scalar_unit == "%" else "")
            if target != "unknown" or activation != "unknown":
                detail += " · " + " · ".join(x for x in (target.title(), activation.title()) if x != "Unknown")
            effect = {"category": category, "detail": detail, "source": "tmo"}
            if scalar_unit:
                effect["numeric"] = {"value": sign * value, "unit": scalar_unit, "target": target,
                                     "activation": activation, "stacking": "unknown"}
            candidates.setdefault(category, []).append((effect, key))
        for category, candidates_for_category in candidates.items():
            existing = [c for c in unit.get("capabilities", []) if c["category"] == category and not c.get("condition")]
            # A personal layout can include upgrades in its summary. Preserve
            # explicit gates and avoid losing distinct target/timing mechanisms.
            if not existing or any(c["source"] == "warcraft-map" for c in existing) or len(existing) > 1:
                continue
            if len(candidates_for_category) > 1:
                continue
            if re.search(r"Upgrade|special upgrade|특강|특성", entry.get("desc", ""), re.I):
                continue
            previous = deepcopy(existing)
            replacement = [c for c, _ in candidates_for_category]
            unit["capabilities"] = [c for c in unit["capabilities"] if c not in existing] + replacement
            evidence.setdefault(unit["id"], []).append({"category": category, "previous": previous,
                "replacement": deepcopy(replacement), "tmoUnitId": entry["id"],
                "rawUnitIds": [code[::-1] for code in entry.get("codes", [])],
                "fields": [{"name": key, "value": entry["abilities"][key]} for _, key in candidates_for_category]})
    return evidence


def extract_armor_snapshot(map_path, output=ARMOR_SNAPSHOT):
    """Reviewable level-1 native armor-aura evidence, not tooltip guesses.

    AHad is Devotion Aura with a negative armor bonus and enemy targeting.
    Shared buff IDs exclude one another; distinct buffs coexist. A shared buff
    with unequal negative values has no verified winner: only identical values
    can be deduplicated. Require matching targets, flat mode, native ability on
    every matched form and exact agreement with selected text.
    """
    raw = json.loads(Path(map_path).read_text(encoding="utf8"))
    data = json.loads((ROOT / "public/data/2.323.json").read_text(encoding="utf8"))
    audit = json.loads((ROOT / "docs/capability-map-audit-2.323.json").read_text(encoding="utf8"))
    if raw["sha256"] != audit["sha256"]:
        raise ValueError("Map hash does not match the reviewed unit identities")
    if not {"war3map.w3h", "war3mapMisc.txt"}.issubset(raw["files"]):
        raise ValueError("Re-extract the map with buff objects and gameplay constants")
    abilities = {a["id"]: a for a in raw["files"]["war3map.w3a"]["objects"]}
    buffs = {b["id"]: b for b in raw["files"].get("war3map.w3h", {}).get("objects", [])}
    rules = []
    for unit in data["units"]:
        objects = audit["units"].get(unit["id"], {}).get("objects", [])
        if not objects:
            continue
        shared = set.intersection(*(set(obj["abilityIds"]) for obj in objects))
        for effect in unit.get("capabilities", []):
            n = effect.get("numeric", {})
            if (effect.get("source") != "warcraft-map" or effect["category"] != "shield" or
                    effect.get("condition") or n.get("activation") != "aura"):
                continue
            matches = []
            for aid in sorted(shared):
                ability = abilities.get(aid, {})
                if ability.get("baseId") != "AHad":
                    continue
                fields = {m["field"]: m["value"] for m in ability["modifications"] if m["level"] in (0, 1)}
                radius = re.search(r"range (\d+)", effect.get("detail", ""))
                if (fields.get("Had1") != n.get("value") or not fields.get("abuf") or
                        buffs.get(fields.get("abuf"), {}).get("baseId") != "BHad" or
                        fields.get("atar") != "air,enemies,ground" or fields.get("Had2", 0) != 0 or
                        (radius and fields.get("aare") != int(radius[1]))):
                    continue
                matches.append({"abilityId": aid, "baseId": "AHad",
                                "fields": {k: fields.get(k) for k in ("Had1", "abuf", "aare", "atar")}})
            if matches and len({m["fields"]["abuf"] for m in matches}) == 1:
                rules.append({"unitId": unit["id"], "rawUnitIds": [o["rawId"] for o in objects],
                    "detail": effect["detail"], "value": n["value"], "abilities": matches,
                    "stackGroup": "armor-aura:" + matches[0]["fields"]["abuf"],
                    "additiveGroup": "enemy-armor-aura", "stacking": "once"})
    groups = {}
    for rule in rules:
        groups.setdefault(rule["stackGroup"], []).append({"unitId": rule["unitId"], "value": rule["value"]})
    conflicts = [{"stackGroup": key, "members": members, "status": "Unequal negative values: winner unverified; omit group from subtotal."}
                 for key, members in groups.items() if len({m["value"] for m in members}) > 1]
    categories = {}
    for unit in data["units"]:
        for effect in unit.get("capabilities", []):
            if effect["category"] not in {"shield", "slow", "mshield", "damageb", "speedb", "regen", "life", "docking", "bombup"}:
                continue
            record = categories.setdefault(effect["category"], {"effects": 0, "numeric": 0})
            record["effects"] += 1
            record["numeric"] += int("numeric" in effect)
    constants = dict(re.findall(r"^(\w+)=([^\r\n]+)", raw["files"].get("war3mapMisc.txt", {}).get("text", ""), re.M))
    snapshot = {"version": data["version"], "mapSha256": raw["sha256"],
        "engineReferences": ["https://classic.battle.net/war3/basics/spellbasics.shtml",
                             "https://www.hiveworkshop.com/threads/do-auras-with-same-base-id-stack.252555/",
                             "https://www.hiveworkshop.com/threads/negative-aura-overriding.370373/"],
        "scope": "Native level-1 flat enemy AHad armor auras only; identical values sharing a buff count once, different buffs add. Unequal same-buff values and trigger effects remain unverified.",
        "review": {"unavailable": raw["unavailable"], "sameBuffConflicts": conflicts,
                   "categories": categories,
                   "movementSpeedBounds": {k: float(constants[k]) for k in ("MinUnitSpeed", "MaxUnitSpeed") if k in constants},
                   "slowStatus": "Movement-speed bounds are absolute speeds, not a verified percentage cap. Slow, regeneration, buffs and amplification have no verified cross-effect aggregation rules.",
                   "buffObjects": [{"id": b["id"], "baseId": b["baseId"], "fields": {
                       m["field"]: m["value"] for m in b["modifications"] if m["field"] in {"fnam", "ftip", "fube"}}}
                       for bid, b in sorted(buffs.items()) if "armor-aura:" + bid in groups]},
        "rules": rules}
    output.write_bytes((json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n").encode("utf8"))
    return snapshot


def extract_support_snapshot(map_path, output=SUPPORT_SNAPSHOT):
    """Annotate selected values offline; never parse Custom free text at runtime.

    Native field matching establishes units/context, not uptime. Unspecified
    scalar units stay points, and unrelated numbers in compound text are ignored.
    """
    raw = json.loads(Path(map_path).read_text(encoding="utf8"))
    data = json.loads((ROOT / "public/data/2.323.json").read_text(encoding="utf8"))
    audit = json.loads((ROOT / "docs/capability-map-audit-2.323.json").read_text(encoding="utf8"))
    if raw["sha256"] != audit["sha256"]:
        raise ValueError("Map hash does not match reviewed identities")
    abilities = {a["id"]: a for a in raw["files"]["war3map.w3a"]["objects"]}
    fields_by_category = {
        "damageb": [("ACac", "Cac1", 100, "%", "aura"), ("AEar", "Ear1", 100, "%", "aura"),
                    ("Aroa", "Roa1", 100, "%", "skill"), ("Ainf", "Inf1", 100, "%", "skill"),
                    ("AItn", "Iatt", 1, "points", "passive")],
        "speedb": [("AOae", "Oae2", 100, "%", "aura"), ("Ablo", "Blo1", 100, "%", "skill")],
        "regen": [("AHab", "Hab1", 1, "mana/s", "aura")],
        "life": [("AUau", "Uau2", 1, "HP/s", "aura"), ("Ainf", "Inf4", 1, "HP/s", "skill")],
        "slow": [("AOae", "Oae1", 100, "%", "aura")],
    }
    patterns = {
        "damageb": r"(?:attack(?: power| damage)?)\s*\+([\d,.]+)\s*(%)?",
        "speedb": r"attack speed\s*\+([\d,.]+)\s*(%)?",
        "regen": r"mana regen(?:eration)?\s*\+([\d,.]+)\s*(%)?",
        "life": r"(?:HP|health) regen(?:eration)?\s*\+([\d,.]+)\s*(%)?",
        "mshield": r"magic resistance reduction\s+([\d,.]+)\s*(%)?",
        "slow": r"movement slow\s+([\d,.]+)\s*(%)?",
    }
    categories = set(fields_by_category) | {"mshield", "docking", "bombup"}
    rules = []
    for unit in data["units"]:
        objects = audit["units"].get(unit["id"], {}).get("objects", [])
        shared = set.intersection(*(set(o["abilityIds"]) for o in objects)) if objects else set()
        for effect in unit.get("capabilities", []):
            category, detail = effect["category"], effect.get("detail", "")
            if category not in categories:
                continue
            match = re.match(r"^([-+]?\d[\d,]*(?:\.\d+)?)(%)?(?:\s*·|$)", detail)
            if not match and category in patterns:
                match = re.search(patterns[category], detail, re.I)
            if not match:
                continue
            value = float(match[1].replace(",", ""))
            if category in {"slow", "mshield"}:
                value = -abs(value)
            target = ("self" if re.search(r"\bself\b", detail, re.I) else "single" if "single-target" in detail.lower() else
                      "lane" if re.search(r"your lane|story / lane", detail, re.I) else "boss" if "Boss" in detail else
                      "allies" if "global" in detail.lower() else "area" if re.search(r"\barea\b|\baura\b|range", detail, re.I) else "unknown")
            activation = ("aura" if "aura" in detail.lower() else "proc" if re.search(r"\bproc\b|Every \d|triggered", detail, re.I) else
                          "skill" if re.search(r"\bskill\b|^[QWEB]:", detail, re.I) else
                          "attack" if "on attack" in detail.lower() else "unknown")
            fallback = {"value": value, "unit": "%" if match[2] else "points", "target": target,
                        "activation": activation, "stacking": "unknown"}
            duration_match = re.search(r"for ([\d.]+)\s*s\b", detail, re.I)
            if duration_match:
                fallback["duration"] = float(duration_match[1])
            numeric = deepcopy(effect.get("numeric", fallback))
            # Reset annotations from a previous extraction to keep regeneration
            # dependent on selected text plus native evidence, not prior rules.
            if effect.get("source") != "warcraft-map":
                numeric = fallback
            candidates = []
            if not effect.get("condition") and numeric["target"] != "self":
                for aid in sorted(shared):
                    ability = abilities.get(aid, {})
                    fields = {m["field"]: m["value"] for m in ability.get("modifications", []) if m["level"] in (0, 1)}
                    for base, field, scale, scalar, activation in fields_by_category.get(category, []):
                        native = fields.get(field)
                        if ability.get("baseId") != base or not isinstance(native, (int, float)) or abs(native * scale - value) > 0.001:
                            continue
                        if numeric["activation"] in {"skill", "proc", "attack"} and numeric["activation"] != activation:
                            continue
                        text = " ".join(m.get("text", "") for m in ability["modifications"] if m["field"] == "aub1" and m["level"] == 1)
                        targets = fields.get("atar", "")
                        inherited_targets = not targets and bool(re.search(r"allies|allied|friendly|nearby units|surrounding units", text, re.I))
                        if inherited_targets:
                            targets = "friend (explicit tooltip; native target field inherited)"
                        if category == "slow" and targets != "air,enemies,ground":
                            continue
                        if category != "slow" and "friend" not in targets and base != "AItn":
                            continue
                        if scalar.endswith("/s") and not re.search(r"per second|/\s*s", text, re.I):
                            continue
                        buff = fields.get("abuf", "")
                        if (not buff and base != "AItn") or "," in buff:
                            continue
                        context = "self" if base == "AItn" else "area" if category == "slow" else "single" if base in {"Ainf", "Ablo"} else "allies"
                        metric = {"value": value, "unit": scalar, "target": context, "activation": activation,
                                  "stacking": "once", "stackGroup": f"support:{category}:{buff}"}
                        if base == "AItn":
                            metric.update(stacking="unknown")
                            del metric["stackGroup"]
                        duration = fields.get("adur")
                        if activation == "skill" and isinstance(duration, (int, float)) and duration > 0:
                            metric["duration"] = duration
                        candidates.append((metric, {"abilityId": aid, "baseId": base, "field": field, "value": native,
                            "buffId": buff, "targets": targets, "targetFromTooltip": inherited_targets, "text": text}))
            distinct = {json.dumps(n, sort_keys=True) for n, _ in candidates}
            evidence = []
            if len(distinct) == 1:
                numeric = candidates[0][0]
                evidence = [e for _, e in candidates]
            contextual = SUPPORT_CONTEXT.get((unit["id"], category))
            context_basis = False
            if contextual and not effect.get("condition") and contextual[3] == value:
                text_id, quote, aura_id, _, target = contextual
                text = " ".join(m.get("text", "") for m in abilities[text_id]["modifications"] if m["field"] == "aub1" and m["level"] == 1)
                aura_fields = {m["field"]: m["value"] for m in abilities[aura_id]["modifications"] if m["level"] in (0, 1)}
                if text_id not in shared or aura_id not in shared or quote not in text or not aura_fields.get("abuf"):
                    raise ValueError("Reviewed Dragon tooltip/aura context no longer matches")
                numeric = {"value": value, "unit": "%", "target": target, "activation": "aura", "stacking": "once",
                           "stackGroup": f"support:{category}:{aura_fields['abuf']}"}
                evidence = [{"abilityId": text_id, "field": "aub1", "quote": quote, "auraAbilityId": aura_id,
                             "auraBaseId": abilities[aura_id]["baseId"], "buffId": aura_fields["abuf"]}]
                context_basis = True
            rules.append({"unitId": unit["id"], "category": category, "detail": detail,
                **({"condition": effect["condition"]} if effect.get("condition") else {}), "numeric": numeric,
                "evidence": evidence, "basis": "Reviewed compound map tooltip and native aura identity" if context_basis else
                    "Native field agrees with selected value" if evidence else
                    "Selected value; unspecified units remain points and stacking remains unverified"})
    result = {"version": data["version"], "mapSha256": raw["sha256"], "rules": rules}
    output.write_bytes((json.dumps(result, ensure_ascii=False, indent=2) + "\n").encode("utf8"))
    return result


def enrich_team_data(data, map_audit, source_audit, snapshot):
    before = {u["id"]: {key: deepcopy(u[key]) for key in FIELDS if key in u} for u in data["units"]}
    tmo_evidence = apply_tmo(data, map_audit, snapshot)
    source_audit["priority"] = ["warcraft-map", "tmo", "ordsearch", "sions"]
    source_audit["tmoSnapshot"] = {key: snapshot[key] for key in ("url", "version", "htmlSha256", "guideStatus")}
    armor = json.loads(ARMOR_SNAPSHOT.read_text(encoding="utf8"))
    if armor["version"] != data["version"]:
        raise ValueError("Armor snapshot version mismatch")
    source_audit["armorStackingSnapshot"] = {k: v for k, v in armor.items() if k != "rules"}
    support = json.loads(SUPPORT_SNAPSHOT.read_text(encoding="utf8"))
    if support["version"] != data["version"]:
        raise ValueError("Support snapshot version mismatch")
    source_audit["supportNumericSnapshot"] = {k: v for k, v in support.items() if k != "rules"}
    for unit in data["units"]:
        for effect in unit.get("capabilities", []):
            condition = effect.get("condition", "")
            if unit["id"] == "distortion_blackmaria" and condition == "the corresponding Black Maria skill choice":
                name, detail = {
                    "stun": ("Area stun", "Area stun · cooldown 5 s"),
                    "slow": ("Movement slow", "Movement slow 40"),
                    "rangellpd": ("Missing-HP damage", "Missing-HP damage 3 · cooldown 5 s"),
                }[effect["category"]]
                effect.update(condition="Black Maria: " + name, detail=detail, exclusiveGroup="black-maria-skill")
            if condition.startswith("Punk Records: Lilith"):
                effect["condition"] = "Punk Records: Lilith (2 special upgrade points and 7 wood)"
            if condition.startswith("Punk Records:"):
                effect["exclusiveGroup"] = "punk-records"
            elif condition in ("Human form", "Phoenix form"):
                effect["exclusiveGroup"] = "marco-form"
            if effect.get("source") != "warcraft-map":
                continue
            detail = effect.get("detail", "")
            match = re.match(r"([-+]?\d+(?:\.\d+)?)(%| s)?(?: ·|$)", detail)
            if not match or effect["category"] not in {"shield", "slow", "mshield", "docking", "bombup", "sstun", "stun", "armorbreak"}:
                continue
            category = effect["category"]
            scalar_unit = "s" if category in {"sstun", "stun"} else "armor" if category == "shield" else "%" if match[2] == "%" else "points"
            target = ("boss" if "· Boss" in detail else "lane" if re.search(r"Story / lane|Your lane", detail) else
                      "single" if "Single-target" in detail or category == "sstun" else
                      "area" if re.search(r"Aura|Area|range", detail) or category == "stun" else "unknown")
            activation = ("aura" if "Aura" in detail else "skill" if re.search(r"mana|skill|Aftershock", detail, re.I) else
                          "attack" if "on attack" in detail or "Basic attack" in detail else "unknown")
            numeric = {"value": float(match[1]), "unit": scalar_unit, "target": target,
                       "activation": activation, "stacking": "unknown"}
            duration = re.search(r"· ([\d.]+) s(?: ·|$)", detail)
            if duration:
                numeric["duration"] = float(duration[1])
            maximum = re.search(r"max ([\d.]+)%?", detail)
            if maximum:
                numeric["cap"] = float(maximum[1])
            for rule in armor["rules"]:
                if (unit["id"] == rule["unitId"] and category == "shield" and not effect.get("condition") and
                        detail == rule["detail"] and numeric["value"] == rule["value"]):
                    numeric.update({k: rule[k] for k in ("stacking", "stackGroup", "additiveGroup")})
            effect["numeric"] = numeric
        record = source_audit["units"][unit["id"]]
        selections = []
        for effect in unit.get("capabilities", []):
            rule = next((r for r in support["rules"] if r["unitId"] == unit["id"] and r["category"] == effect["category"] and
                r["detail"] == effect.get("detail", "") and r.get("condition") == effect.get("condition")), None)
            if rule:
                effect["numeric"] = deepcopy(rule["numeric"])
                selections.append(deepcopy(rule))
        if selections:
            record["numericSelections"] = selections
        if unit["id"] in tmo_evidence:
            # Preserve discarded source values while refreshing the exact
            # selected fields, including conservatively unknown context.
            selections = record.setdefault("tmoSelections", [])
            for selection in tmo_evidence[unit["id"]]:
                selection["replacement"] = deepcopy([c for c in unit["capabilities"] if
                    c["category"] == selection["category"] and not c.get("condition")])
                prior = next((s for s in selections if s["category"] == selection["category"]), None)
                if prior:
                    selection["previous"] = prior["previous"]
                    prior.update(selection)
                else:
                    selections.append(selection)
        selected = {}
        for c in unit.get("capabilities", []):
            selected[(c["category"], c.get("condition"))] = c.get("source")
        record["selected"] = [{"category": cat, **({"condition": condition} if condition else {}), "source": source}
                              for (cat, condition), source in selected.items()]
        after = {key: deepcopy(unit[key]) for key in FIELDS if key in unit}
        if after != before[unit["id"]] or "previous" in record:
            record.setdefault("previous", before[unit["id"]])
            record["replacement"] = after
    return source_audit


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--extract-html", type=Path)
    parser.add_argument("--extract-armor", type=Path)
    parser.add_argument("--extract-support", type=Path)
    args = parser.parse_args()
    if args.extract_html:
        extract_snapshot(args.extract_html)
        return
    if args.extract_armor:
        result = extract_armor_snapshot(args.extract_armor)
        print("Native armor aura rules:", len(result["rules"]))
        return
    if args.extract_support:
        result = extract_support_snapshot(args.extract_support)
        print("Numeric support records:", len(result["rules"]))
        return
    data_path = ROOT / "public/data/2.323.json"
    audit_path = ROOT / "docs/capability-source-audit-2.323.json"
    data = json.loads(data_path.read_text(encoding="utf8"))
    audit = enrich_team_data(data,
        json.loads((ROOT / "docs/capability-map-audit-2.323.json").read_text(encoding="utf8")),
        json.loads(audit_path.read_text(encoding="utf8")), json.loads(TMO_SNAPSHOT.read_text(encoding="utf8")))
    for path, value in ((data_path, data), (audit_path, audit)):
        newline = "\r\n" if b"\r\n" in path.read_bytes() else "\n"
        path.write_bytes((json.dumps(value, ensure_ascii=False, indent=2) + "\n").replace("\n", newline).encode("utf8"))
    print("Numeric effects:", sum("numeric" in c for u in data["units"] for c in u.get("capabilities", [])))
    print("TMO reviewed selections:", sum(len(r.get("tmoSelections", [])) for r in audit["units"].values()))


if __name__ == "__main__":
    main()
