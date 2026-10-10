# ORD 2.323 data

Source: [Sions post 13347](https://sions.kr/bbs/board.php?bo_table=mk_helper&wr_id=13347), inspected on 2026-10-10. The HTML-encoded JSON is embedded in `#wr_content_json`; the helper button changes presentation without loading another dataset. Source portraits use `https://sions.kr/data/file/mk_helper_thumb/`.

The 303 source rows become 278 units/items and 17 rarities. Twenty-five reference/separator rows become subgroup labels or shared notes. All 278 retained source recipes were compared with the converted graph. Common units intentionally have no Wisp recipes, so Wisp substitution remains optional.

Names keep the existing English character/form names and stable IDs. Old HP/Mana/upgrade suffixes are replaced by current information in notes. Notes are translated from both the current source names and descriptions; 251 entries have notes. The remaining 27 entries have no additional source information. No old gameplay notes were copied without checking the current source.

Where the source title and description disagree (including Legendary Kuma, Kalgara, Hibari, Zoro, Hidden Sunny, Transcendence Doflamingo, Franky, and Koby), the notes distinguish both claims. Single-target values whose precise meaning is not specified are retained without inventing a percentage or duration. Gold, wood, tokens, zombies, and extra random-unit requirements remain informational when they cannot be represented by the existing unit recipe schema.

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

## Verification

Run `node --experimental-strip-types --test tests/data.test.mjs` with Node 22.6 or newer, plus `npm run build` and `npm run lint`. The tests cover dataset integrity, portraits, source recipe changes, Wisp substitution, ban propagation, cost cache isolation, Custom validation, version resolution, migration, failed loading, retry, and cancellation. This test command does not change the deployment workflow or its build commands.

Chrome browser checks also verified all 278 rendered entries and 213 portraits, notes and recipe trees, Wisp toggling, ban propagation, export metadata, migration and reload for each retired version, missing-unit shortcut guards, failed data/manifest requests and retry, persistent Custom data, switching datasets, successful imports, and invalid import/storage handling. No uncaught browser errors occurred.

Only 2.323 is shipped. Users with retired selected versions migrate after successful loading, retaining inventory and bans for valid IDs. Stored valid Custom datasets and shortcut preferences remain available. The runtime uses the existing GitHub Pages base path.
