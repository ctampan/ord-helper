import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  CAPABILITIES, filterUnitsByCapabilities, hasBaseCapability, readCapabilityFilters,
  readCapabilityExpanded, displayAbilityText,
} from '../src/logic/capabilities.ts';
import { isGameData, readCustomData, retainValidState } from '../src/logic/data.ts';

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const data = await readJson('../public/data/2.323.json');
const audit = await readJson('../docs/capability-audit-2.323.json');
const mapAudit = await readJson('../docs/capability-map-audit-2.323.json');
const units = new Map(data.units.map((unit) => [unit.id, unit]));
const effects = (id, category) => (units.get(id).capabilities || []).filter((effect) => effect.category === category);

test('all 278 units are audited and preserve their subgroups and original numeric information', () => {
  assert.equal(CAPABILITIES.length, 25);
  assert.equal(new Set(CAPABILITIES.map(({ id }) => id)).size, 25);
  assert.equal(Object.keys(audit.units).length, 278);
  assert.equal(isGameData(data), true);
  for (const unit of data.units) {
    const original = audit.units[unit.id];
    assert.equal(unit.subGroup, original.subGroup ?? undefined, unit.id);
    const text = JSON.stringify({ capabilities: unit.capabilities, abilityDetails: unit.abilityDetails, note: unit.note });
    const previous = JSON.stringify(mapAudit.units[unit.id].corrections.map(({ previous }) => previous));
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
  assert.match(units.get('transcendence_doflamingo').abilityDetails, /136.*45/);
  assert.match(units.get('transcendence_doflamingo').note, /differs between references/);
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
  assert.match(units.get('transcendence_koby').note, /source title.*description lists armor-ignoring/);
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

test('saved filter choices survive close/reload and corrupt or retired preferences are sanitized', () => {
  assert.equal(readCapabilityExpanded(null), true);
  assert.equal(readCapabilityExpanded('true'), true);
  assert.equal(readCapabilityExpanded('false'), false);
  assert.equal(readCapabilityExpanded('broken'), true);
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

test('display strips source labels and normalizes legacy minus without hiding conditions or conflicts', () => {
  assert.equal(displayAbilityText('−60 · Mana skill (Sions) · 4.5 s (Sions)'), '-60 · Mana skill · 4.5 s');
  assert.equal(displayAbilityText('Sions — Movement slow: 136; Upgrade 4'), 'Alternative detail: Movement slow: 136; Upgrade 4');
  assert.equal(displayAbilityText('Command: joker tr. Group reference: reduction 201; poison 20.'), 'Command: joker tr. ');
  for (const unit of data.units) {
    const text = displayAbilityText(JSON.stringify({ capabilities: unit.capabilities?.map(({ source, ...rest }) => rest), note: unit.note, details: unit.abilityDetails }));
    assert.doesNotMatch(text, /ORDSearch|Sions|Warcraft map|−|Group reference:/i, unit.id);
  }
});
