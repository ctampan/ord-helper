# Warcraft map capability audit

The map-only resource/mobility supplement is reproducible without the website snapshots:

```powershell
python scripts/extract-warcraft-map.py 'ref/ORDR_S2_2.323[R]_english.w3x' --library 'C:/path/to/StormLib.dll' --output ref/map-2.323.json
python scripts/map_skill_requirements.py
```

It adds three categories to the original 25: `hp-skill`, `mana-skill`, and `swimming`. Explicit level-1 activation clauses establish 31 base HP-skill units and 75 base Mana-skill units. Resource thresholds, costs, proc chances, recovery context, alternative triggers, and adjacent activation limits are retained verbatim apart from display normalization (`Health` to `HP`). Regeneration, enemy HP damage, maximum mana, and higher-level descriptions do not establish resource requirements. Ordinary resource thresholds are detail text, not upgrade conditions, so these skills remain filterable.

Six playable units explicitly use amphibious movement (`war3map.w3u`, `umvt = amph`): Rare Decken, Legendary Laboon, Legendary Jinbe, Hidden Decken, Distortion Burgess, and Transcendence Jinbe. Fisher Tiger's Flying classification follows the user's correction; map ability `A0DZ` independently verifies terrain-ignoring traversal. Swimming is not inferred from Flying or character identity.

`capability-map-skills-2.323.json` audits all 278 entries with raw object identities, reviewed base forms, previous/replacement values, field/level, original quotations and acquisition evidence. This supplement preserves the previous numeric audit. Reviewed base objects distinguish Chopper's permanent upgrade, Franky's acquired transformation, Marco's Phoenix form, cosmetic variants, and non-playable visual shells. Franky's acquired skill and Marco's Phoenix-form cost retain their separate conditions. Sunny's Mana skill requires Vegapunk's Knowledge and is excluded from base-only filtering. Unresolved non-base abilities remain in the audit instead of being guessed.

Three old annotations cannot be established from the readable map objects: HP skills for Hidden/Transcendence Akainu, and Mana skill for Mystic Gojo. They remain in the original source audit and are explicitly marked unverified in the supplement. Neither a character's maximum HP/mana nor an old marker is substituted for missing trigger evidence.

The supplied `ORDR_S2_2.323[R]_english.w3x` has SHA-256 `6de87277d89edccb359b442f1498f69a5e675c0c3d7479bb37c91dabd30ab8ca`. The offline extractor opens it read-only with the official [StormLib](https://github.com/ladislav-zezula/StormLib/releases/tag/v9.40) library; neither the game nor map scripts are executed.

Readable data comprises 1,519 unit objects, 1,680 ability objects, 110 upgrade objects, 15 item objects, and 11,088 string records. Every modification retains its field ID, level, data pointer, original text, and a cleaned display value. `war3map.j` could not be read (error 1392); trigger-computed mechanics remain unverified.

All 278 application entries are accounted for in `capability-map-audit-2.323.json`. Character and rarity matching excludes enemies, summons, clones, and visual dummies. Reviewed aliases cover translations, materials, and different form names. Multiple candidate forms contribute only abilities shared by all candidates. Vegapunk's four crafting origins share the Vegapunk object, and both Nika origins share the Nika object; these matches do not establish a separate form-specific ability route. Original subgroup labels/order and the recipe graph remain unchanged.

Corrections use narrowly matched, explicitly stated level-1 effects: targeted stun durations, armor-reduction auras, movement slow, Armor Break amounts, and named amplification/resistance reductions. A level-1 tooltip is evidence of the described effect, not proof of its runtime trigger implementation. Existing upgrade/choice conditions are retained. Abilities acquired through a cost/selection tooltip, higher levels, ambiguous targets, and incomplete comparisons with multiple existing effects are not automatically substituted. Such limitations are recorded per unit. No stacking totals or caps are inferred.

Each correction stores previous and replacement records, the map hash, internal filename, raw unit/ability IDs, field and level, and verbatim supporting quotations. Reviewed cross-line rules preserve distinct effects, including Kalgara's aura/story/boss reductions and Doflamingo's skill/aftershock slows. Bon Clay's area stun is corrected from 0.35 s to 1.65 s. Doflamingo's armor reduction remains -60, while its duration is corrected to 7.5 s; the 4.5 s awakening duration is a separate statement. Older conflicting information remains in the audit or alternative details.

Raw reference inputs are not included in the repository. To reproduce the audit, create a local `ref/` directory and provide the map and source snapshots described below. This directory is ignored by Git and excluded from runtime assets. Download the official x64 Unicode DLL separately, then run:

```powershell
python scripts/extract-warcraft-map.py 'ref/ORDR_S2_2.323[R]_english.w3x' --library 'C:/path/to/StormLib.dll' --output ref/map-2.323.json
python scripts/build-capabilities.py
```

Conversion also requires `beautifulsoup4`, the ORDSearch DOM in `ref/ref.html`, and decoded Sions data in `ref/sions.json`. It is deterministic and makes no network requests. Existing original translated notes are read from the original capability audit, rather than from already transformed application data.

Verification:

```powershell
python -m unittest discover -s tests -p 'test_map_capabilities.py'
node --experimental-strip-types --test tests/data.test.mjs tests/capabilities.test.mjs
npm run lint
npm run build
```

With the production preview running on port 4173, `python tests/browser-capabilities.py` checks persisted panel visibility, active hidden filters, independent header collapse, compact source-free values, independent recipe/ability panels, left/right placement, viewport fallback, zoom changes, inventory-safe disclosures, and crafting/Wisp/shortcut behavior. Tooltip descriptions are always expanded. In the recipe modal, capabilities appear immediately after notes/commands and before ingredients. Shared `Group reference:` summaries are excluded from unit notes and kept only in the original source audit.
