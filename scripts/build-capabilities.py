"""Rebuild 2.323 capabilities from saved source snapshots (requires beautifulsoup4).

Inputs: ref/ref.html (ORDSearch), ref/sions.json (#wr_content_json).
The audit retains the original translated notes, so repeated runs are deterministic.
Source JavaScript is parsed as data and never executed.
"""
import collections
import hashlib
import json
import re
from pathlib import Path

from bs4 import BeautifulSoup
from map_capabilities import MAP_AUDIT, SNAPSHOT, apply_map, audit_map
from map_skill_requirements import SKILL_AUDIT, supplement_skills

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public/data/2.323.json"
AUDIT = ROOT / "docs/capability-audit-2.323.json"
GROUPS = {0: "Common", 1: "Uncommon", 30: "Random", 3: "Special", 26: "Combination Item",
          4: "Other", 7: "Rare", 8: "Legendary", 10: "Hidden", 22: "Distortion",
          13: "Alternate", 23: "Seraphim", 12: "Transcendence", 17: "Limited",
          15: "Immortal", 16: "Eternal", 28: "Mystic"}
LEVELS = {"2": "Uncommon", "3": "Special", "4": "Rare", "5": "Legendary", "6": "Hidden",
          "7": "Distortion", "16": "Random", "8": "Alternate", "23": "Seraphim",
          "9": "Limited", "10": "Transcendence", "18": "Mystic", "11": "Immortal", "12": "Eternal", "14": "Other"}

# Reviewed aliases/forms. IDs are ORDSearch IDs, never Sions IDs. Automatic
# matches also require rarity and a unique Korean name prefix, below.
ALIASES = {
    "30": "uncommon_chopper", "47": "special_capone", "49": "special_moria",
    "33": "special_enel", "59": "special_ace", "36": "special_usopp", "55": "special_inazuma",
    "63": "rare_luffy", "95": "rare_marco", "82": "rare_hawkins", "88": "rare_brook",
    "64": "rare_sanji", "114": "rare_usopp", "65": "rare_zoro", "68": "rare_crocodile",
    "137": "legendary_marco", "358": "legendary_brulee", "118": "legendary_zoro", "128": "legendary_kuma",
    "156": "hidden_mihawk", "154": "hidden_shiryu", "150": "hidden_kiku", "254": "alternate_carrot",
    "363": "seraphim_sbear", "364": "seraphim_sshark", "365": "seraphim_ssnake", "362": "seraphim_shawk",
    "369": "transcendence_vegapunk_sbear", "370": "transcendence_vegapunk_sshark",
    "368": "transcendence_vegapunk_ssnake", "371": "transcendence_vegapunk_shawk",
    "283": "mystic_minato", "298": "mystic_byakuya", "386": "mystic_yujiro", "288": "mystic_higuma",
    "305": "eternal_nikaluffy", "306": "eternal_nikasnakeman", "220": "eternal_cavendish",
    "188": "other_kuma", "168": "other_pirateship", "144": "other_ancientship", "124": "other_rayleigh",
    "325": "item_marco", "307": "item_uta", "304": "item_nika",
}


def normalize(text):
    return re.sub(r"[^\w]", "", text).lower()


def signed(value):
    return ("-" if value < 0 else "+") + str(abs(value))


def categories(text, flags):
    """Only explicit ability statements; shared references never reach here."""
    t = text.lower()
    found = set()
    rules = {
        "shield": r"armor reduction", "slow": r"movement slow|single-target slow|\bslow \d",
        "mshield": r"magic resistance reduction", "armorbreak": r"armor break",
        "damageb": r"\battack \+|attack buff", "speedb": r"attack speed \+|attack speed buff",
        "regen": r"mana regeneration", "life": r"hp regeneration",
        "docking": r"magic (?:damage )?amplification", "bombup": r"explosion (?:damage )?amplification",
        "sky": r"flying|can fly", "blink": r"blink|teleport",
        "splash": r"splash", "udelete": r"deletion|deletes? an enemy|executes?|execution",
        "ignore": r"armor-ignoring damage",
        "berserk": r"effective against berserk|damage against berserk|berserk damage|berserk enemies/bosses",
        "boss": r"effective against bosses|against berserk enemies and bosses|boss damage|berserk enemies/bosses",
    }
    for key, pattern in rules.items():
        if re.search(pattern, t):
            found.add(key)
    if re.search(r"single-target.*\bstun", t):
        found.add("sstun")
    # An unqualified stun is not automatically an area stun; require the primary
    # source's area flag or an explicit area statement in the secondary source.
    if "area stun" in t or ("stun" in flags and re.search(r"(?<!target )\bstun [\d]", t)):
        found.add("stun")
    for hp, single, area in [("missing", "singlelost", "rangellpd"),
                              ("total", "last", "rangetlpd"), ("current", "single", "rangenlpd")]:
        if re.search(rf"{hp}[- ]hp", t) or f"{hp} hp" in t:
            if "area" in t:
                found.add(area)
            elif "single-target" in t or "boss damage" in t or "berserk damage" in t:
                found.add(single)
            elif single in flags and area not in flags:
                found.add(single)
            elif area in flags and single not in flags:
                found.add(area)
    # The primary flag establishes the damage category, but an unspecified
    # finisher value retains its original wording (never an invented percent).
    if "last" in flags and re.search(r"\bfinisher\b", t):
        found.add("last")
    # Other unspecified single-target values remain verbatim details.
    return found


def condition_for(text):
    # A trailing '; Upgrade 4' only says an upgrade exists. It does not gate all
    # abilities earlier in that sentence.
    match = re.match(r"Upgrade (\d+)\b", text, re.I)
    if match:
        return f"Upgrade {match[1]}"
    if re.match(r"special upgrade (?:adds|increases)|special upgrade:", text, re.I):
        return "special upgrade"
    if re.match(r"human form:", text, re.I):
        return "Human form"
    if re.match(r"phoenix form:", text, re.I):
        return "Phoenix form"
    return None


def compact_detail(category, clause):
    """Normalize obvious standalone values without inventing units or targets."""
    patterns = {
        "shield": r"armor reduction ([\d.]+)(.*)", "slow": r"movement slow ([\d.]+%?)(.*)",
        "mshield": r"magic resistance reduction ([\d.]+%?)(.*)",
        "damageb": r"attack \+([\d.]+%?)(.*)", "speedb": r"attack speed \+([\d.]+%?)(.*)",
        "regen": r"mana regeneration \+?([\d.]+)(.*)", "life": r"hp regeneration \+?([\d.]+)(.*)",
        "stun": r"(?:area )?stun ([\d.]+)s(.*)", "sstun": r"single-target stun ([\d.]+)s(.*)",
        "docking": r"magic damage amplification \+?([\d.]+%?)(.*)",
        "bombup": r"explosion damage amplification \+?([\d.]+%?)(.*)",
        "armorbreak": r"armor break ([\d.]+)(.*)",
    }
    match = re.fullmatch(patterns.get(category, r"(?!)"), clause.rstrip("."), re.I)
    if not match:
        return clause.rstrip(".")
    value, rest = match.groups()
    prefix = "-" if category in {"shield", "slow", "mshield"} else "+"
    if category in {"stun", "sstun"}:
        return f"{value} s{rest}"
    return f"{prefix}{value}{rest}"


def migrate(data, soup, sions, previous):
    units = {u["id"]: u for u in data["units"]}
    sions_items, sions_ids = {}, {}
    for group in sions["groups"]:
        if group["id"] not in GROUPS:
            continue
        items = [item for item in group["items"] if item["id"] not in [224, 225, 305]
                 and not item["name"].startswith("●●")]
        group_units = [u for u in data["units"] if u["rarity"] == GROUPS[group["id"]]]
        assert len(items) == len(group_units), (group["id"], len(items), len(group_units))
        for item, unit in zip(items, group_units):
            sions_items[unit["id"]] = item
            sions_ids[item["id"]] = unit["id"]
    # Verify the positional match against every original recipe, not just names.
    for uid, item in sions_items.items():
        recipe = collections.Counter({sions_ids[int(key)]: count for key, count in item["recipes"] if int(key) in sions_ids})
        expected = collections.Counter({r["unitId"]: r["count"] for r in units[uid].get("recipe", [])})
        if units[uid]["rarity"] != "Common":
            assert recipe == expected, (uid, recipe, expected)

    filter_ids = [i["value"] for i in soup.select("#unitSkillBox input") if i["value"] != "all"]
    assert len(filter_ids) == 25
    mappings = {}
    for row in soup.select("tr[data-unit-id]"):
        button = row.select_one(".deck-add-button")
        if not button:
            continue
        oid = row["data-unit-id"]
        uid = ALIASES.get(oid)
        if not uid and row.get("data-level") in LEVELS:
            name = normalize(button.get("data-origin-name", ""))
            candidates = [u["id"] for u in data["units"] if u["rarity"] == LEVELS[row["data-level"]]
                          and name and normalize(sions_items[u["id"]]["name"]).startswith(name)]
            if len(candidates) == 1:
                uid = candidates[0]
        if uid:
            assert uid not in mappings, (uid, oid)
            mappings[uid] = {"id": oid, "name": button.get("data-origin-name"),
                             "flags": [k for k in filter_ids if row.get("data-" + k) == "Y"]}
    unmatched = [u["id"] for u in data["units"] if u["rarity"] != "Common" and u["id"] not in mappings]
    assert unmatched == ["other_seraphim"], unmatched

    effects = {}
    for script in soup.find_all("script"):
        match = re.search(r"deckEffects\s*:\s*JSON\.parse\('\s*(.*?)'\)", script.string or script.get_text(), re.S)
        if match:
            effects = json.loads(json.loads('"' + match.group(1) + '"'))
            break
    assert len(effects) == 157
    audit = {}
    for uid, unit in units.items():
        original = previous.get(uid, {}).get("originalNote", unit.get("note", ""))
        original_subgroup = previous.get(uid, {}).get("subGroup", unit.get("subGroup"))
        assert unit.get("subGroup") == original_subgroup, uid
        primary = mappings.get(uid, {})
        flags = set(primary.get("flags", []))
        numeric = effects.get(primary.get("id"), {})
        caps = [{"category": k, "source": "ordsearch"} for k in filter_ids if k in flags]
        notes, details, secondary, warnings = [], [], [], []
        for sentence in re.split(r"(?<=[.!?])\s+", original):
            sentence = sentence.strip()
            if not sentence:
                continue
            # Shared subgroup summaries are not unit notes or unit abilities.
            # The original wording stays in the audit only.
            if re.match(r"Group reference:", sentence, re.I):
                continue
            # Keep restrictions and source disagreement intact, including numbers.
            important = re.search(r"Command:|Group reference:|crafting|Requires |does not stack|do not stack|source title|source description|source's|Can defeat|Can sell|Easter egg|Upgrade material|Transformation costs|without the upgrade|at armor reduction|requires Docking|additional .*wood", sentence, re.I)
            if important:
                notes.append(sentence)
                # Shared references and disagreement must not become capabilities.
                if re.search(r"Group reference:|source title|source description|Command:", sentence, re.I):
                    continue
            inherited_condition = condition_for(sentence)
            for clause in sentence.rstrip(".").split(";"):
                clause = clause.strip()
                if not clause:
                    continue
                if uid.startswith("transcendence_vegapunk_") and ("Punk Records" in clause or "Lilith" in clause or "Atlas" in clause):
                    # Reviewed below; the choice affects several independent skills.
                    details.append(clause)
                    continue
                cats = categories(clause, flags)
                if not cats:
                    if not important:
                        details.append(clause)
                    continue
                condition = condition_for(clause) or inherited_condition
                if uid == "distortion_blackmaria" and clause.startswith("Choose "):
                    condition = "the corresponding Black Maria skill choice"
                for category in sorted(cats, key=filter_ids.index):
                    effect = {"category": category, "detail": compact_detail(category, clause), "source": "sions"}
                    if condition:
                        effect["condition"] = condition
                    secondary.append(effect)
        if uid.startswith("transcendence_vegapunk_"):
            secondary.extend([
                {"category": "shield", "detail": "-40", "source": "sions", "condition": "Punk Records: Lilith (2 special upgrade points and 7 wood)"},
                {"category": "boss", "source": "sions", "condition": "Punk Records: Lilith"},
                {"category": "berserk", "source": "sions", "condition": "Punk Records: Lilith"},
                {"category": "ignore", "source": "sions", "condition": "Punk Records: Atlas (2 special upgrade points and 7 wood)"},
            ])

        # If the only secondary evidence is an upgrade/form, the primary category
        # flag must not incorrectly advertise that ability as a base ability.
        for category in {c["category"] for c in secondary}:
            matching = [c for c in secondary if c["category"] == category]
            caps = [c for c in caps if c["category"] != category]
            caps.extend(matching)

        # Primary numeric effects replace secondary numeric claims; they are
        # independent values, never totals. Identical exported effects are deduped.
        for category, key in [("shield", "shield"), ("slow", "slow")]:
            # ORDSearch calculateShieldEffects uses type 3 as an Armor Break
            # indicator, not a scalar armor reduction. Its raw value is ignored.
            if key == "shield" and any(e["type"] == 3 for e in numeric.get(key, [])):
                if not any(c["category"] == "armorbreak" for c in caps):
                    caps.append({"category": "armorbreak", "source": "ordsearch"})
            raw = [e for e in numeric.get(key, []) if key != "shield" or e["type"] != 3]
            if not raw:
                continue
            previous_caps = [c for c in caps if c["category"] == category]
            base = [c for c in previous_caps if not c.get("condition")]
            conditional = [c for c in previous_caps if c.get("condition")]
            if conditional and not base:
                # An aggregate source value cannot override an explicit form gate.
                continue
            caps = [c for c in caps if c["category"] != category]
            caps.extend(conditional)
            primary_effects = []
            seen_effects = set()
            for effect in raw:
                fingerprint = json.dumps(effect, sort_keys=True)
                if fingerprint in seen_effects:
                    continue
                seen_effects.add(fingerprint)
                for field, target in [("value", ""), ("boss", "Boss")]:
                    value = effect.get(field, 0)
                    if value:
                        # These labels are grounded in the helper's calculation:
                        # shield 1=aura, 2=single addition, 4=skill; slow 5=single.
                        # Shield 6 is story/lane in both matching Sions entries.
                        label = ({1: "Aura", 2: "Single-target", 4: "Skill", 6: "Story / lane"}
                                 if key == "shield" else {1: "Aura", 3: "Skill", 4: "Additional effect", 5: "Single-target", 6: "Additional effect"}).get(effect["type"], "")
                        detail = signed(value) + ("%" if key == "slow" else "")
                        if target or label:
                            detail += " · " + (target or label)
                        record_condition = None
                        for c in previous_caps:
                            # Preserve explicit upgrade gates on individual values.
                            if c.get("condition") and re.search(rf"(?:armor reduction|slow) {abs(value):g}(?![\d.])", c.get("detail", ""), re.I):
                                record_condition = c["condition"]
                        if key == "shield" and effect["type"] == 4:
                            for c in base:
                                context = c.get("detail", "")
                                if re.search(rf"armor reduction {abs(value):g}(?![\d.])", context, re.I):
                                    if "mana skill" in context.lower():
                                        detail += " · Mana skill (Sions)"
                                    duration = re.search(r"for ([\d.]+)s", context)
                                    if duration:
                                        detail += f" · {duration[1]} s (Sions)"
                        record = {"category": category, "detail": detail, "source": "ordsearch"}
                        if record_condition:
                            record["condition"] = record_condition
                        if record not in primary_effects:
                            primary_effects.append(record)
            caps.extend(primary_effects)
            primary_values = {abs(e.get("value", 0)) for e in raw if e.get("value")}
            # Secondary target, timing and stacking context stays explicitly sourced.
            for c in base:
                if c.get("detail"):
                    scalar = re.fullmatch(r"[-+]([\d.]+)%?", c["detail"])
                    if scalar and float(scalar[1]) in primary_values:
                        continue  # Same value and no extra context; the tag already shows it.
                    details.append("Sions — " + ("Armor reduction" if category == "shield" else "Movement slow") + ": " + c["detail"])
            local_values = set()
            for c in base:
                # Only standalone signed scalar values can be safely crosschecked.
                m = re.search(r"(?:^[-+]|(?:armor reduction|movement slow) )([\d.]+)(?![\d.%])(?:$| )", c.get("detail", ""), re.I)
                if m:
                    local_values.add(float(m[1]))
            if local_values and not local_values.issubset(primary_values):
                warning = f"{('Armor reduction' if category == 'shield' else 'Movement slow')}: ORDSearch values are shown in the tags; Sions values/context are retained in ability details."
                notes.append(warning)
                warnings.append(category + " values differ")
        if numeric.get("armorIncrease"):
            details.append(f"ORDSearch — Enemy armor increase: {signed(numeric['armorIncrease'])}; separate from armor reductions")
        # Structured values are base effects according to the source snapshot;
        # flags for unrelated conditional skills were handled independently above.
        unique = []
        for capability in caps:
            if capability not in unique:
                unique.append(capability)
        unique.sort(key=lambda c: (filter_ids.index(c["category"]), bool(c.get("condition"))))
        for key in ["capabilities", "abilityDetails", "note"]:
            unit.pop(key, None)
        if unique:
            unit["capabilities"] = unique
        if details:
            unit["abilityDetails"] = ". ".join(dict.fromkeys(details)).rstrip(".") + "."
        if notes:
            unit["note"] = " ".join(dict.fromkeys(notes))
        audit[uid] = {"sionsId": sions_items[uid]["id"], "ordsearchId": primary.get("id"),
                      "ordsearchFlags": primary.get("flags", []), "originalNote": original,
                      "subGroup": original_subgroup, "warnings": warnings}
    return audit


def main():
    data = json.loads(DATA.read_text(encoding="utf8"))
    previous = json.loads(AUDIT.read_text(encoding="utf8"))["units"] if AUDIT.exists() else {}
    html = (ROOT / "ref/ref.html").read_bytes()
    sions_bytes = (ROOT / "ref/sions.json").read_bytes()
    soup = BeautifulSoup(html.decode("utf8"), "html.parser")
    audit = migrate(data, soup, json.loads(sions_bytes), previous)
    if SNAPSHOT.exists():
        map_audit = apply_map(data, audit_map(data))
        skill_audit = supplement_skills(data, json.loads(SNAPSHOT.read_text(encoding="utf8")), map_audit, original_notes=audit)
        SKILL_AUDIT.write_text(json.dumps(skill_audit, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
        MAP_AUDIT.write_text(json.dumps(map_audit, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    else:
        raise FileNotFoundError("Extract ref/map-2.323.json first; do not silently remove verified map corrections.")
    for unit in data["units"]:
        for key in ("note", "abilityDetails"):
            if key in unit:
                unit[key] = unit[key].replace("−", "-")
        for capability in unit.get("capabilities", []):
            for key in ("detail", "condition"):
                if key in capability:
                    capability[key] = capability[key].replace("−", "-")
    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    AUDIT.write_text(json.dumps({
        "sources": {"ordsearch": "https://ordsearch.net/mix/helper",
                    "sions": "https://sions.kr/bbs/board.php?bo_table=mk_helper&wr_id=13347"},
        "snapshotSha256": {"ordsearch": hashlib.sha256(html).hexdigest(),
                           "sions": hashlib.sha256(sions_bytes).hexdigest()},
        "units": audit,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(f"Audited {len(audit)} units; {sum(bool(u.get('capabilities')) for u in data['units'])} have capabilities.")


if __name__ == "__main__":
    main()
