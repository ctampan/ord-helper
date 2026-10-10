# Warcraft map capability audit

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

With the production preview running on port 4173, `python tests/browser-capabilities.py` checks persisted expansion, active collapsed filters, compact source-free values, independent recipe/ability panels, left/right placement, viewport fallback, zoom changes, inventory-safe disclosures, and crafting/Wisp/shortcut behavior. Tooltip descriptions are always expanded. In the recipe modal, capabilities appear immediately after notes/commands and before ingredients. Shared `Group reference:` summaries are excluded from unit notes and kept only in the original source audit.
