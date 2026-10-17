# ORD 2.323 data

Source: [Sions post 13347](https://sions.kr/bbs/board.php?bo_table=mk_helper&wr_id=13347), inspected on 2026-10-10. The HTML-encoded JSON is embedded in `#wr_content_json`; the helper button changes presentation without loading another dataset. Source portraits use `https://sions.kr/data/file/mk_helper_thumb/`.

The 303 source rows become 278 units/items and 17 rarities. Twenty-five reference/separator rows become subgroup labels or shared notes. All 278 retained source recipes were compared with the converted graph. Common units intentionally have no Wisp recipes, so Wisp substitution remains optional.

Names keep the existing English character/form names and stable IDs. HP/Mana activation requirements are restored from map evidence as separate filter categories, rather than name suffixes. Upgrade conditions remain attached to the relevant effects. The original Sions conversion supplied translated notes for 251 entries; these are now split into capabilities, ability details, and important notes as described below. Shared `Group reference:` summaries are removed from unit notes and retained only in the audit. No old gameplay notes were copied without checking the current source.

Where Sions titles and descriptions disagree, explicit map replacements supersede both old claims. The UI shows the selected values and conditions without source names or comparison commentary. Reviewed map text also resolves Hibari's damage, Zoro's 15% execution threshold, Franky's 8-wood Shipwright cost, Doflamingo's Upgrade 4 duration extension, and Koby's clone damage. Exact quotations and object identities remain in the source audit. Single-target values whose precise meaning is not specified are retained without inventing a percentage or duration. Gold, wood, tokens, zombies, and extra random-unit requirements remain informational when they cannot be represented by the existing unit recipe schema.

## New source IDs

| Source ID | App ID |
| --- | --- |
| 341 | `other_greenblood` |
| 347 | `other_seraphim` |
| 342–345 | `seraphim_ssnake`, `seraphim_shawk`, `seraphim_sshark`, `seraphim_sbear` |
| 348 | `distortion_burgess` |
| 349 | `distortion_ace` |
| 340, 351–353 | `transcendence_vegapunk_ssnake`, `transcendence_vegapunk_shawk`, `transcendence_vegapunk_sshark`, `transcendence_vegapunk_sbear` |
| 354 | `mystic_yujiro` |

Four Vegapunk entries preserve the source's alternative recipes without changing the single-recipe schema. They share `images/transcendence_vegapunk.png` and the shared Vegapunk ability description.

The old source ID 192 (`alternate_ace`) is absent. Eternal Ace, Transcendence Sabo, and Mystic Byakuya use the new Distortion units. Bonney no longer includes the extra Transcendent Kuma that was present only in the previous local dataset.

All 203 existing portraits are still referenced, including Uncommon Ace's portrait, formerly shared by Alternate Ace. Ten new PNGs bring the total to 213 unique referenced portraits. None of the old images need deletion.

## Sources, map extraction, and offline regeneration

Capabilities choose one source per category and condition: verified Warcraft map > version-matched TMO > saved ORDSearch > Sions. Source names and comparisons never appear in the application. Unknown targeting, units, stacking or activation are not invented. Shared subgroup summaries remain only in the audits.

The map `ORDR_S2_2.323[R]_english.w3x` has SHA-256 `6de87277d89edccb359b442f1498f69a5e675c0c3d7479bb37c91dabd30ab8ca`. Extraction uses the official [StormLib v9.40](https://github.com/ladislav-zezula/StormLib/releases/tag/v9.40) x64 Unicode DLL. Neither map scripts nor reference JavaScript are executed. Readable objects comprise 1,519 units, 1,680 abilities, 110 upgrades, 15 items, 334 buffs and 11,088 strings. Gameplay constants are also retained. `war3map.j` is unavailable (error 1392), so trigger-computed mechanics remain unverified; the conventional alternate script path and Lua paths are absent.

Matching excludes enemies, clones, summons and visual dummies. Reviewed forms establish shared abilities and explicit base identities. Corrections require clear level-1 text; incomplete multi-effect categories retain their complete fallback. Kalgara's aura/story/boss reductions stay separate. Doflamingo's -60 armor effect lasts 7.5 seconds, independently of the 4.5-second awakening. Bon Clay's area stun is 1.65 seconds. Resource costs require explicit activation text; regeneration, maximum HP/mana and enemy HP damage do not establish caster requirements. Swimming requires `umvt=amph`, not Flying or character identity.

Keep raw inputs in ignored `ref/`: the map, `map-2.323.json`, ORDSearch HTML as `ref.html`, and decoded Sions data as `sions.json`. The complete historical website inputs are not bundled. Python `beautifulsoup4` is required for full conversion.

```powershell
python scripts/extract-warcraft-map.py 'ref/ORDR_S2_2.323[R]_english.w3x' --library 'C:/path/to/StormLib.dll' --output ref/map-2.323.json
python scripts/build-capabilities.py
```

The [public TMO 2.323 helper](https://tmo.gg/g/ord/build-helper/53979) was inspected in a normal browser. Its plain embedded helper data is retained in `scripts/data/tmo-2.323.json`, including the title, canonical URL and normalized HTML hash. Plain HTTP returned 403; no protected payload was decoded. Exact raw Warcraft codes (reversed in TMO) establish unit identity. Ambiguous variants, missing/zero numeric values, conditional-only effects, upgrade descriptions and incomplete multi-effect comparisons do not establish replacement base values. This personal layout is not a verified build composition.

To refresh the offline TMO snapshot, save that helper's rendered public HTML and run:

```powershell
python scripts/team_metadata.py --extract-html ref/tmo-53979.html
python scripts/team_metadata.py
```

The enrichment command requires no network or original website inputs and is deterministic. The full build performs the same enrichment. `python scripts/capability_sources.py` repeats source selection using existing bundled records; `python scripts/map_skill_requirements.py` repeats the map resource/mobility supplement. Run team enrichment after either standalone step to synchronize numeric metadata and the final source audit.

All four JSON audit files remain required by conversion or regression tests:

- `capability-audit-2.323.json`: original translated notes, subgroup identities, ORDSearch/Sions IDs and original discrepancies.
- `capability-map-audit-2.323.json`: raw objects, level/field quotations, previous/replacement map values and unresolved mechanics.
- `capability-map-skills-2.323.json`: explicit HP/Mana activation and mobility evidence, base forms and acquired skills.
- `capability-source-audit-2.323.json`: final selections, discarded display records, reviewed TMO fields and descriptive map corrections.

## Team Stats and recommendations

Team Stats is above ability filters. Its Config visibility, expansion, profile and active conditions persist per dataset. The default profile is Hybrid; the body starts collapsed with an always-visible strip of compact ability summaries. Known numeric totals appear in red before the ability name; summaries with a visible numeric value come first, preserving category order within both groups. Clicking a summary opens its contribution details; collapsing hides the details and recommendations while keeping the summaries visible. It counts positive inventory quantities except Common, including items with capabilities. Dashboard filtering does not affect the team. Bans affect recommendations, not owned-unit contributions.

Each capability may carry `numeric` metadata with finite `value`, `unit`, `target`, `activation`, optional positive `duration`/`cap`, `stacking` (`sum`, `highest`, `once`, `unknown`) and an explicit `stackGroup` for verified rules. Optional `additiveGroup` explicitly permits adding separate exclusion groups and requires known stacking. `exclusiveGroup` ties mutually exclusive condition choices together. Old Custom data remains valid; free-text details are never parsed into runtime numeric totals.

Totals keep different targets, units, activation types and durations separate. Verified totals apply each group's exclusions and cap before adding groups with an explicit shared scope. Support stats also expose nominal cumulative estimates prefixed with `~`: unresolved independent effects are assumed additive, known shared buffs still count once, and unequal values sharing a non-stacking buff produce a range rather than an arbitrary winner. Estimates do not manufacture missing values or percentage units, and self buffs on separate copies are never combined. Durations, damage percentages and HP/Mana costs are not estimated by addition. Exact totals and estimates appear before provider counts; an asterisk means other contexts or unknown-value contributors remain outside that displayed value. Contribution details explain the assumptions. No uptime, combat DPS, resistance formula or difficulty threshold is inferred; slow estimates are nominal effect sums before combat movement-speed bounds.

The offline snapshot `scripts/data/support-numeric-2.323.json` annotates 231 selected support effects. Bare values remain `points` unless an explicit percentage or matching native map field establishes the scalar unit. Native `ACac`/`AEar`/`Aroa`/`Ainf` attack buffs, `AItn` flat self attack, `AOae`/`Ablo` attack speed, `AHab` mana regeneration, `AUau`/`Ainf` HP regeneration, and `AOae` movement slow establish units and context only when their value agrees with the selected effect. Native tooltip targeting can supplement an inherited target field, and regeneration requires explicit per-second text. The source audit retains numeric selections, exact native fields and quotations. Custom free text is still never parsed at runtime.

The offline snapshot `scripts/data/armor-stacking-2.323.json` records 28 matching native level-1 flat enemy-targeted `AHad` armor auras across 24 actual `BHad` buff objects. Map hash, exact value/radius agreement, enemy target flags, flat mode and a shared ability across matched forms are required. Following the native exclusion/addition rules ([Blizzard](https://classic.battle.net/war3/basics/spellbasics.shtml), [first-hand distinct-buff test](https://www.hiveworkshop.com/threads/do-auras-with-same-base-id-stack.252555/)), identical values sharing a buff count once (`once`); distinct buffs add when their affected enemies overlap. The map does not establish a winner for unequal negative values sharing a buff. Selecting the largest absolute value was an incorrect inference: [negative-aura reports](https://www.hiveworkshop.com/threads/negative-aura-overriding.370373/) also demonstrate why that rule cannot be assumed. Those groups now retain both contributions, omit the unresolved group from the subtotal and mark the total incomplete.

Rare Sabo (`B01H`, -10) and Hidden Sabo (`B02B`, -20) combine to -30. Hidden/Transcendence Sabo share `B02B` (-20/-35), so their combined exact value is unresolved; the earlier definite -35 claim is withdrawn. Their displayed estimate is `~-35…-20`; all three yield `~-45…-30`, while the exact known subtotal remains -10 internally. The same conflict applies to Special/Rare Hawkins (`B011`, -3/-10) and Legendary/Transcendence Chopper (`B025`, -18/-50). Bon Clay/Ivankov share `B029` at the same -11, so any number of those copies contributes -11. `highest` remains an explicit magnitude-based rule for Custom data; it is not inferred for native negative auras.

The snapshot's `review` retains collision groups, raw buff identities/descriptions, capability numeric coverage and gameplay constants. `MinUnitSpeed=89` and `MaxUnitSpeed=490` are absolute movement speeds, not percentage slow caps. Slow and the other support categories retain unverified cross-effect aggregation; neither durations, damage percentages nor HP/Mana costs are added. Unmatched tooltip/native discrepancies and trigger effects remain unresolved. Re-extract the map with the current reader (including buffs and constants), then regenerate the native evidence and enrich:

```powershell
python scripts/team_metadata.py --extract-armor ref/map-2.323.json
python scripts/team_metadata.py --extract-support ref/map-2.323.json
python scripts/team_metadata.py
# Refresh numeric coverage counts in the armor audit after adding numeric records:
python scripts/team_metadata.py --extract-armor ref/map-2.323.json
python scripts/team_metadata.py
```

Upgrade/form checkboxes start inactive and apply to one owned copy. Each unit's name appears once with inline choices that wrap on narrow screens. Selecting an exclusive form or skill choice clears its alternatives even if multiple copies are present. Saved positive counts migrate to checked (one copy); unavailable choices are discarded when the last owned copy disappears. Black Maria's three choices are separate; equivalent Lilith conditions are one choice. Ordinary HP/Mana activation costs are descriptive requirements, not proof that the skill is currently firing.

Recommendations show up to five portrait cards per tab in a responsive grid. Complete team prioritizes recipes that fill a missing mandatory slow/stun role. When none is eligible, it falls back to positive net profile coverage: armor reduction/attack buffs/attack speed for Physical, resistance reduction/magic amplification for Magic, and the corresponding support roles for Hybrid and Explosion. The panel keeps the missing slow/stun roles visible during this fallback. It never spends the last existing provider of either required role without replacing that role in the crafted result. Once both mandatory roles are present, it targets the remaining profile roles directly. Within these eligible matches, candidates sort by total recursive base-material cost descending; equal-cost ties use net gain, readiness, missing base cost, Wisp cost and stable ID. Easy to craft retains all eligible recipes sorted by cost, then readiness, missing base cost, material progress and stable ID, and displays support losses. Both tabs use the same recipe engine, effective bans and Wisp option as crafting. Wisp counts use the theme's green status color. Future recipes show missing materials and projected coverage. Opening a card's recipe does not craft it. A genuinely empty result still means no allowed recipe adds net profile coverage; missing special ingredients and bans are never bypassed to fill the list.

Hybrid checks slow, stun, armor/magic reduction, attack/attack-speed buffs, mana regeneration and boss coverage. Physical emphasizes armor reduction and attack buffs; Magic emphasizes resistance reduction and magic amplification; Explosion emphasizes explosion amplification. Single-target stun can satisfy the general stun role without being relabeled as an area effect; Berserk coverage can satisfy the general boss role.

Profiles prioritize support capabilities; they do not classify a unit's damage type. `mana-skill` and `hp-skill` are activation/resource requirements and never establish physical/magic damage or increase a profile's score. Complete-team cards show the actual missing roles filled instead of treating resource flags as recommendation reasons. All profiles require slow and stun. Presence means available capability coverage, not verified combat uptime or a difficulty-specific sufficient amount.

Both recommendation tabs require the exact Random, Combination Item and Other ingredients to be owned in sufficient quantities. This includes nested recipes, accounts for shared ingredient consumption, and stops at an already-owned intermediate. Special ingredients cannot be projected from missing leaves or substituted with Wisp; Custom's plural `Combination Items` label is also recognized. Ordinary missing materials may still be projected. Owning the finished target does not waive ingredients for another copy. This changes recommendation eligibility only; manual recipe navigation and crafting remain available.

The two recommendation tabs are Complete team and Easy to craft. No build-guide catalog is bundled. The app never fetches TMO or game data at runtime. Saved Balanced/Balance profiles migrate to Hybrid without changing their active conditions or expansion state.

## Dataset compatibility and verification

All `public/data/*.json` files are bundled automatically, sorted by numeric version. New visitors receive the newest version; returning users keep an available selection. Retired versions migrate while retaining valid inventory IDs and bans. Custom import/export preserves capabilities and optional metadata. Invalid metadata is rejected before calculations. No network request or dashboard unmount is needed for switching datasets.

Ability filters apply only to the dashboard, preserve their selections while hidden and exclude acquired capabilities from base filtering. Unit ability details and recipe navigation continue to use the complete unit graph. Performance architecture and profiling commands are documented in [performance.md](performance.md).

```powershell
node --experimental-strip-types --test tests/data.test.mjs tests/capabilities.test.mjs tests/team-stats.test.mjs tests/performance.test.mjs
python -m unittest discover -s tests -p 'test_*.py'
npm run build
npm run lint
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173
# In another terminal:
python tests/browser-capabilities.py
python tests/browser-team-stats.py
python tests/browser-performance.py
python tests/browser-tooltip-ux.py
```
