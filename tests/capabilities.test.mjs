import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  CAPABILITIES, filterUnitsByCapabilities, hasBaseCapability, readCapabilityFilters,
  readCapabilityVisible, displayAbilityText,
} from '../src/logic/capabilities.ts';
import { isGameData, readCustomData, retainValidState } from '../src/logic/data.ts';

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const data = await readJson('../public/data/2.323.json');
const audit = await readJson('../docs/capability-audit-2.323.json');
const mapAudit = await readJson('../docs/capability-map-audit-2.323.json');
const skillAudit = await readJson('../docs/capability-map-skills-2.323.json');
const sourceAudit = await readJson('../docs/capability-source-audit-2.323.json');
const units = new Map(data.units.map((unit) => [unit.id, unit]));
const effects = (id, category) => (units.get(id).capabilities || []).filter((effect) => effect.category === category);

test('all 278 units are audited and preserve their subgroups and original numeric information', () => {
  assert.equal(CAPABILITIES.length, 28);
  assert.equal(new Set(CAPABILITIES.map(({ id }) => id)).size, 28);
  assert.equal(Object.keys(audit.units).length, 278);
  assert.equal(isGameData(data), true);
  for (const unit of data.units) {
    const original = audit.units[unit.id];
    assert.equal(unit.subGroup, original.subGroup ?? undefined, unit.id);
    const text = JSON.stringify({ capabilities: unit.capabilities, abilityDetails: unit.abilityDetails, note: unit.note });
    const previous = JSON.stringify([
      mapAudit.units[unit.id].corrections.map(({ previous }) => previous),
      sourceAudit.units[unit.id].previous,
    ]);
    const numbers = new Set((text + previous).match(/\d+(?:\.\d+)?/g) || []);
    const unitNote = original.originalNote.replace(/Group reference:\s*.*?(?:\.(?=\s|$)|$)/gi, '');
    for (const number of unitNote.match(/\d+(?:\.\d+)?/g) || []) {
      assert.ok(numbers.has(number), `${unit.id}: original numeric detail ${number} was lost`);
    }
    assert.doesNotMatch(text, /[\uac00-\ud7af]/);
    assert.equal(new Set((unit.capabilities || []).map((effect) => JSON.stringify(effect))).size, unit.capabilities?.length || 0);
  }
});

test('verified source values have signs, units, distinct targets and timing', () => {
  assert.deepEqual(effects('rare_hawkins', 'shield'), [{ category: 'shield', detail: '-10 · Aura · range 800', source: 'warcraft-map' }]);
  assert.equal(effects('hidden_bonkurei', 'shield')[0].detail, '-11 · Aura · range 850');
  assert.equal(effects('hidden_bonkurei', 'stun')[0].detail, '1.65 s · 12% on attack · range 500');
  assert.match(units.get('hidden_bonkurei').note, /does not stack with Ivankov/);
  assert.deepEqual(effects('legendary_kalgara', 'shield').map(({ detail }) => detail), ['-20 · Aura · range 825', '-20 · Story / lane · Basic attack · 20 s', '-40 · Boss · Basic attack · 20 s']);
  assert.match(effects('transcendence_doflamingo', 'shield')[0].detail, /-60.*150 mana.*7\.5 s.*850/);
  assert.deepEqual(effects('transcendence_doflamingo', 'slow').map(({ detail }) => detail), ['-250% · Skill · 4.5 s · 18% on attack · range 525', '-75% · Aftershock · 2 s · Area']);
  assert.doesNotMatch(units.get('transcendence_doflamingo').abilityDetails, /136|ground-area triggered slow/);
  assert.doesNotMatch(units.get('transcendence_doflamingo').note, /differs between references/);
  assert.match(sourceAudit.units.transcendence_doflamingo.previous.abilityDetails, /136.*45/);
  assert.equal(effects('seraphim_ssnake', 'bombup')[0].detail, '+3% · Area · max 25% · Pistol Kiss hits 6 times');
  assert.equal(effects('eternal_uta', 'bombup')[0].source, 'warcraft-map');
});

test('source gaps are supplemented without guessing single-target missing HP or treating Armor Break as ordinary reduction', () => {
  assert.ok(hasBaseCapability(units.get('eternal_mihawk'), 'ignore'));
  assert.equal(effects('eternal_mihawk', 'ignore')[0].source, 'sions');
  assert.ok(hasBaseCapability(units.get('legendary_blackbeard'), 'sstun'));
  assert.ok(hasBaseCapability(units.get('legendary_blackbeard'), 'boss'));
  assert.equal(data.units.flatMap((unit) => unit.capabilities || []).some((effect) => effect.category === 'singlelost'), false);
  assert.equal(effects('transcendence_koby', 'ignore').length, 0);
  assert.match(units.get('transcendence_koby').note, /60%.*explosion damage.*60,000 magic damage/);
  assert.equal(effects('seraphim_sshark', 'shield').length, 1);
  assert.match(effects('seraphim_sshark', 'shield')[0].detail, /-20/);
  assert.ok(hasBaseCapability(units.get('seraphim_sshark'), 'armorbreak'));
  for (const effect of effects('rare_garp', 'shield')) assert.doesNotMatch(effect.detail || '', /201|211/);
});

test('filters exclude upgrade and form capabilities while keeping normal mana and HP skills', () => {
  for (const form of ['ssnake', 'shawk', 'sshark', 'sbear']) {
    const unit = units.get(`transcendence_vegapunk_${form}`);
    assert.equal(hasBaseCapability(unit, 'ignore'), false);
    assert.equal(hasBaseCapability(unit, 'shield'), false);
    assert.equal(hasBaseCapability(unit, 'stun'), false);
    assert.match(effects(unit.id, 'ignore')[0].condition, /Atlas/);
    assert.ok(hasBaseCapability(unit, 'slow'));
  }
  assert.equal(hasBaseCapability(units.get('immortal_dragon'), 'udelete'), false);
  assert.match(effects('immortal_dragon', 'udelete')[0].condition, /Upgrade 4/);
  assert.equal(hasBaseCapability(units.get('distortion_blackmaria'), 'slow'), false);
  assert.ok(hasBaseCapability(units.get('limited_enel'), 'mshield'));
  assert.ok(hasBaseCapability(units.get('transcendence_doflamingo'), 'shield'));
});

test('All/Any, empty selection, disabled filters, and unclassified Custom units', () => {
  const both = filterUnitsByCapabilities(data.units, ['shield', 'stun'], 'all');
  const either = filterUnitsByCapabilities(data.units, ['shield', 'stun'], 'any');
  assert.ok(both.length > 0 && either.length > both.length);
  assert.ok(both.every((unit) => hasBaseCapability(unit, 'shield') && hasBaseCapability(unit, 'stun')));
  assert.ok(either.every((unit) => hasBaseCapability(unit, 'shield') || hasBaseCapability(unit, 'stun')));
  assert.equal(filterUnitsByCapabilities(data.units, [], 'all'), data.units);
  assert.equal(filterUnitsByCapabilities(data.units, ['shield'], 'all', false), data.units);
  assert.deepEqual(filterUnitsByCapabilities(data.units, ['singlelost'], 'any'), []);
  const oldCustom = [{ id: 'old', name: 'Old', rarity: 'Common', image: '' }];
  assert.deepEqual(filterUnitsByCapabilities(oldCustom, ['shield'], 'all'), []);
  assert.equal(filterUnitsByCapabilities(oldCustom, [], 'all'), oldCustom);
});

test('resource and swimming filters preserve explicit requirements and exclude acquired skills', () => {
  assert.equal(filterUnitsByCapabilities(data.units, ['hp-skill'], 'all').length, 31);
  assert.equal(filterUnitsByCapabilities(data.units, ['mana-skill'], 'all').length, 75);
  assert.equal(hasBaseCapability(units.get('rare_sugar'), 'regen'), true);
  assert.equal(hasBaseCapability(units.get('rare_sugar'), 'mana-skill'), false);
  assert.equal(hasBaseCapability(units.get('legendary_shanks'), 'hp-skill'), false);
  assert.match(effects('legendary_nami', 'hp-skill')[0].detail, /8\.8%.*or 35 HP/);
  assert.match(effects('limited_katakuri', 'hp-skill')[0].detail, /35.*15%.*consume 17 HP/);
  assert.match(effects('transcendence_aokiji', 'mana-skill')[0].detail, /Consumes 40 mana.*50/);
  assert.match(effects('transcendence_kizaru', 'mana-skill')[0].detail, /Consumes 50 mana.*75/);
  assert.match(effects('transcendence_law', 'hp-skill')[0].detail, /250.*50.*only once/);
  assert.match(effects('transcendence_shanks', 'mana-skill')[0].detail, /35 mana.*14\.25/);
  assert.equal(hasBaseCapability(units.get('transcendence_franky'), 'mana-skill'), true);
  assert.match(effects('transcendence_franky', 'mana-skill')[1].condition, /Upgrade 4/);
  assert.equal(hasBaseCapability(units.get('hidden_sunny'), 'mana-skill'), false);
  assert.match(effects('hidden_sunny', 'mana-skill')[0].condition, /Vegapunk/);
  assert.match(effects('limited_marco', 'hp-skill')[1].condition, /Phoenix form/);
  assert.deepEqual(filterUnitsByCapabilities(data.units, ['swimming'], 'all').map(({ id }) => id).sort(),
    ['rare_decken', 'legendary_laboon', 'legendary_jinbe', 'hidden_decken', 'distortion_burgess', 'transcendence_jinbe'].sort());
  assert.equal(hasBaseCapability(units.get('hidden_tiger'), 'sky'), true);
  assert.equal(hasBaseCapability(units.get('hidden_tiger'), 'swimming'), false);
  const both = filterUnitsByCapabilities(data.units, ['hp-skill', 'mana-skill'], 'all');
  assert.ok(both.some(({ id }) => id === 'mystic_anya'));
  assert.ok(both.every((unit) => hasBaseCapability(unit, 'hp-skill') && hasBaseCapability(unit, 'mana-skill')));
  assert.deepEqual(readCapabilityFilters('{"selected":["hp-skill","mana-skill","swimming"],"mode":"any"}'),
    { selected: ['hp-skill', 'mana-skill', 'swimming'], mode: 'any' });
});

test('restored skill annotations retain map identity, field, level and original evidence', () => {
  assert.equal(skillAudit.sha256, mapAudit.sha256);
  assert.equal(Object.keys(skillAudit.units).length, 278);
  for (const [id, category] of [['hidden_akainu', 'hp-skill'], ['transcendence_akainu', 'hp-skill'], ['mystic_gojo', 'mana-skill']]) {
    assert.equal(hasBaseCapability(units.get(id), category), false);
    assert.ok(skillAudit.units[id].unverified.some((record) => record.category === category && record.originalNote), id);
  }
  for (const [id, record] of Object.entries(skillAudit.units)) {
    for (const addition of record.additions) {
      assert.ok(effects(id, addition.replacement.category).some((c) => JSON.stringify(c) === JSON.stringify(addition.replacement)), id);
      assert.ok(addition.evidence.length, id);
      for (const evidence of addition.evidence) {
        if (evidence.file === 'war3map.w3u') {
          assert.equal(evidence.field, 'umvt');
          assert.equal(evidence.value, 'amph');
          assert.deepEqual(evidence.rawUnitIds, record.baseUnitIds);
        } else {
          const ability = mapAudit.units[id].abilities.find((a) => a.rawId === evidence.rawAbilityId);
          assert.equal(evidence.level, 1);
          assert.ok(ability.textFields.some((f) => f.field === evidence.field && f.level === 1 && f.text.includes(evidence.quote)), id);
          assert.equal(typeof evidence.originalText, 'string');
          if (evidence.acquisition) {
            const acquired = mapAudit.units[id].abilities.find((a) => a.rawId === evidence.acquisition.rawAbilityId);
            assert.ok(acquired.textFields.some((f) => f.text.includes(evidence.acquisition.quote)), id);
            assert.ok(addition.replacement.condition, id);
          }
        }
      }
    }
  }
});

test('saved filter choices survive close/reload and corrupt or retired preferences are sanitized', () => {
  assert.equal(readCapabilityVisible(null), true);
  assert.equal(readCapabilityVisible('true'), true);
  assert.equal(readCapabilityVisible('false'), false);
  assert.equal(readCapabilityVisible('broken'), true);
  const saved = JSON.stringify({ selected: ['shield', 'slow'], mode: 'any' });
  assert.deepEqual(readCapabilityFilters(saved), { selected: ['shield', 'slow'], mode: 'any' });
  assert.deepEqual(readCapabilityFilters(JSON.stringify({ selected: ['shield', 'invalid', 'shield', null], mode: 'other' })), { selected: ['shield'], mode: 'all' });
  for (const value of [null, '', 'broken', 'null', '[]', '7']) {
    assert.deepEqual(readCapabilityFilters(value), { selected: [], mode: 'all' });
  }
});

test('new capability data round-trips through Custom and malformed imports are rejected', () => {
  const roundTrip = readCustomData(JSON.stringify(data));
  assert.deepEqual(roundTrip, data);
  const custom = { version: 'custom', rarities: ['Common'], units: [{ id: 'u', name: 'Unit', image: '', rarity: 'Common' }] };
  assert.equal(isGameData(custom), true);
  for (const capability of [{ category: 'shield' }, { category: 'shield', source: 'warcraft-map', detail: '-4' }]) {
    const withCapabilities = { ...custom, units: [{ ...custom.units[0], capabilities: [capability] }] };
    assert.equal(isGameData(withCapabilities), true);
    assert.deepEqual(readCustomData(JSON.stringify(withCapabilities)), withCapabilities);
  }
  for (const capability of [null, { category: 'unknown', source: 'sions' }, { category: 'shield', source: 'unknown' },
    { category: 'shield', source: 'sions', detail: 4 }, { category: 'shield', source: 'sions', condition: '' }]) {
    assert.equal(isGameData({ ...custom, units: [{ ...custom.units[0], capabilities: [capability] }] }), false);
  }
  assert.equal(isGameData({ ...custom, units: [{ ...custom.units[0], capabilities: 'shield' }] }), false);
  assert.equal(isGameData({ ...custom, units: [{ ...custom.units[0], abilityDetails: 7 }] }), false);
  const state = retainValidState(roundTrip, { rare_hawkins: 2, missing: 9 }, new Set(['rare_hawkins']));
  assert.deepEqual(state.inventory, { rare_hawkins: 2 });
  assert.deepEqual([...state.bans], ['rare_hawkins']);
});

test('all map corrections retain exact evidence and previous values without assuming trigger behavior', () => {
  assert.equal(Object.keys(mapAudit.units).length, 278);
  assert.equal(mapAudit.sha256, '6de87277d89edccb359b442f1498f69a5e675c0c3d7479bb37c91dabd30ab8ca');
  assert.match(mapAudit.unavailable['war3map.j'], /Cannot read/);
  for (const [id, record] of Object.entries(mapAudit.units)) {
    assert.ok(record.objects.length, id);
    assert.ok(record.unverified.some((text) => text.includes('Trigger-computed')), id);
    for (const correction of record.corrections) {
      assert.ok(correction.evidence.length, id);
      for (const evidence of correction.evidence) {
        const ability = record.abilities.find(({ rawId }) => rawId === evidence.rawAbilityId);
        assert.ok(ability.shared, id);
        assert.equal(evidence.level, 1);
        assert.ok(ability.textFields.some((field) => field.field === evidence.field && field.level === evidence.level && field.text.includes(evidence.quote)), id);
      }
      for (const effect of correction.replacement) {
        assert.ok(effects(id, correction.category).some((actual) => JSON.stringify(actual) === JSON.stringify(effect)), id);
        assert.equal(effect.source, 'warcraft-map');
      }
    }
  }
  const oldStun = mapAudit.units.hidden_bonkurei.corrections.find(({ category }) => category === 'stun').previous;
  assert.equal(oldStun[0].detail, '0.35 s');
  // A multi-effect reference remains intact when only one map mechanism is parsed.
  assert.ok(effects('immortal_roger', 'slow').some(({ detail }) => detail.includes('99%')));
});

test('display strips source labels, obsolete conflict warnings and normalizes legacy minus', () => {
  assert.equal(displayAbilityText('−60 · Mana skill (Sions) · 4.5 s (Sions)'), '-60 · Mana skill · 4.5 s');
  assert.equal(displayAbilityText('Sions — Movement slow: 136; Upgrade 4'), 'Movement slow: 136; Upgrade 4');
  assert.equal(displayAbilityText('Armor reduction: ORDSearch values are shown in the tags; Sions values/context are retained in ability details.'), '');
  assert.equal(displayAbilityText('Values differ between references; alternative values/context are retained in ability details.'), '');
  assert.equal(displayAbilityText('Command: joker tr. Group reference: reduction 201; poison 20.'), 'Command: joker tr. ');
  for (const unit of data.units) {
    const text = displayAbilityText(JSON.stringify({ capabilities: unit.capabilities?.map(({ source, ...rest }) => rest), note: unit.note, details: unit.abilityDetails }));
    assert.doesNotMatch(text, /ORDSearch|Sions|Warcraft map|−|Group reference:/i, unit.id);
  }
});

test('each effect and condition uses one source; superseded claims stay in the audit', () => {
  assert.deepEqual(sourceAudit.priority, ['warcraft-map', 'ordsearch', 'sions']);
  assert.equal(Object.keys(sourceAudit.units).length, data.units.length);
  for (const unit of data.units) {
    const record = sourceAudit.units[unit.id];
    for (const selected of record.selected) {
      const actual = (unit.capabilities || []).filter((effect) => effect.category === selected.category &&
        effect.condition === selected.condition);
      assert.ok(actual.length, unit.id);
      assert.ok(actual.every(({ source }) => source === selected.source), unit.id);
    }
    if (record.previous) {
      assert.deepEqual(record.replacement, Object.fromEntries(
        ['capabilities', 'abilityDetails', 'note'].filter((key) => key in unit).map((key) => [key, unit[key]])), unit.id);
    }
    const text = JSON.stringify(unit);
    assert.doesNotMatch(text, /values differ|differs between references|alternative values\/context|Sions — (Armor reduction|Movement slow)|\(Sions\)/i, unit.id);
    assert.doesNotMatch(unit.note || '', /source|reference|ORDSearch|Sions|Warcraft map/i, unit.id);
    assert.doesNotMatch(unit.abilityDetails || '', /source|reference|ORDSearch|Sions|Warcraft map/i, unit.id);
    for (const selection of record.textSelections || []) {
      const evidence = selection.evidence;
      const mapRecord = mapAudit.units[unit.id];
      const ability = mapRecord.abilities.find(({ rawId }) => rawId === evidence.rawAbilityId);
      assert.ok(ability.textFields.some((field) => field.field === evidence.field && field.level === evidence.level &&
        evidence.quotes.every((quote) => field.text.includes(quote))), unit.id);
      for (const id of evidence.rawUnitIds) {
        assert.ok(mapRecord.objects.some((obj) => obj.rawId === id && obj.abilityIds.includes(evidence.rawAbilityId)), unit.id);
      }
      assert.ok(unit[selection.field].includes(selection.replacement), unit.id);
    }
  }
  assert.equal(effects('transcendence_hawkins', 'shield').filter(({ condition }) => condition === 'Upgrade 4').length, 1);
  assert.equal(effects('eternal_hancock', 'shield').filter(({ condition }) => condition === 'Upgrade 4').length, 1);
  // Separate acquired effects still fall back to Sions when higher sources have no matching condition.
  assert.equal(effects('immortal_gaban', 'shield').find(({ condition }) => condition === 'special upgrade').source, 'sions');
  assert.equal(effects('transcendence_aokiji', 'slow').find(({ condition }) => condition === 'Upgrade 4').source, 'sions');
  for (const id of ['legendary_kuma', 'legendary_kalgara', 'hidden_sunny']) {
    assert.doesNotMatch(units.get(id).note || '', /source title|description lists/);
  }
  assert.match(units.get('legendary_zoro').note, /15% HP/);
  assert.match(units.get('legendary_hibari').note, /7\.5%.*22\.5%.*2,000,000/);
  assert.match(units.get('transcendence_franky').note, /2 Sunny ships for 8 wood/);
  assert.match(units.get('transcendence_doflamingo').note, /Upgrade 4 extends awakening by 1\.5s/);
  assert.equal(effects('transcendence_aokiji', 'sky')[0].detail, 'Flying');
  assert.equal(effects('transcendence_aokiji', 'regen')[0].detail, 'Self mana regeneration');
  assert.equal(effects('transcendence_aokiji', 'slow').find(({ condition }) => condition === 'Upgrade 4').detail, '-10');
  assert.doesNotMatch(effects('limited_enel', 'rangetlpd')[0].detail, /resistance reduction|stun/);
  assert.doesNotMatch(effects('hidden_vergo', 'shield').map(({ detail }) => detail).join(' '), /stun/);
});
