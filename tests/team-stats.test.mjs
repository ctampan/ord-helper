import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { isCapability, displayAbilityText } from '../src/logic/capabilities.ts';
import { isGameData, readCustomData } from '../src/logic/data.ts';
import {
  getSummaryTotal, getTeamStats, getRecommendations, previewCraft, sanitizeConditions,
  readTeamPreferences, teamStorageKey,
} from '../src/logic/teamStats.ts';

const unit = (id, capabilities = [], extra = {}) => ({ id, name: id, rarity: 'Legendary', image: '', capabilities, ...extra });
const effect = (category, value, extra = {}) => ({ category, source: 'tmo', detail: `${value}`,
  numeric: { value, unit: category === 'shield' ? 'armor' : '%', target: 'area', activation: 'aura',
    stacking: 'sum', stackGroup: category, ...extra } });
const map = (...units) => new Map(units.map((u) => [u.id, u]));

test('team stats count inventory copies and item effects, exclude Common and leave text-only values unparsed', () => {
  const units = map(unit('a', [effect('shield', -10)]), unit('common', [effect('shield', -50)], { rarity: 'Common' }),
    unit('item', [effect('shield', -2)], { rarity: 'Item' }), unit('old', [{ category: 'slow', detail: '-99%' }]));
  const stats = getTeamStats(units, { a: 2, common: 99, item: 1, old: 1, invalid: 3 });
  const armor = stats.find((s) => s.category === 'shield');
  const slow = stats.find((s) => s.category === 'slow');
  assert.equal(armor.providers, 3);
  assert.equal(armor.totals[0].value, -22);
  assert.equal(armor.incomplete, false);
  assert.equal(slow.totals.length, 0);
  assert.equal(slow.incomplete, true);
  assert.deepEqual(getTeamStats(units, { a: -1, old: 0 }), []);
  assert.equal(getTeamStats(map(unit('flying', [{ category: 'sky' }])), { flying: 2 })[0].incomplete, false);
});

test('summary order prioritizes visible numeric totals including zero, keeping stable category order within each group', () => {
  const units = map(unit('a', [{ category: 'damageb' },
    effect('slow', -25, { stacking: 'unknown' }), effect('shield', -10),
    effect('mshield', 0), { category: 'boss' }]));
  const stats = getTeamStats(units, { a: 2 });
  assert.deepEqual(stats.map((s) => s.category), ['slow', 'shield', 'mshield', 'damageb', 'boss']);
  assert.deepEqual(getSummaryTotal(stats[0]).estimate, { minimum: -50, maximum: -50 });
  assert.equal(getSummaryTotal(stats[1]).value, -20);
  assert.equal(getSummaryTotal(stats[2]).value, 0);
  assert.equal(getSummaryTotal(stats[3]), undefined);
});

test('stacking honors highest, once, caps, duplicate quantities and independent target/activation/duration/unit contexts', () => {
  const units = map(unit('a', [effect('shield', -10, { stacking: 'highest' })]),
    unit('b', [effect('shield', -15, { stacking: 'highest' })]),
    unit('c', [effect('slow', -40, { cap: 60 })]));
  let stats = getTeamStats(units, { a: 5, b: 2, c: 2 });
  assert.equal(stats.find((s) => s.category === 'shield').totals[0].value, -15);
  assert.equal(stats.find((s) => s.category === 'slow').totals[0].value, -60);
  units.set('a', unit('a', [effect('shield', -10, { stacking: 'once' })]));
  stats = getTeamStats(units, { a: 7 });
  assert.equal(stats[0].totals[0].value, -10);
  units.set('a', unit('a', [effect('shield', -10), effect('shield', -20, { target: 'boss' }),
    effect('shield', -30, { activation: 'skill', duration: 4 }), effect('shield', -30, { activation: 'skill', duration: 7 }),
    effect('shield', -2, { unit: '%' })]));
  assert.equal(getTeamStats(units, { a: 1 })[0].totals.length, 5);
});

test('unknown stacking and distinct groups are not silently summed', () => {
  const units = map(unit('a', [effect('shield', -10, { stacking: 'unknown' })]),
    unit('b', [effect('shield', -20, { stackGroup: 'other' })]));
  assert.equal(getTeamStats(units, { a: 1 })[0].totals[0].value, -10);
  assert.equal(getTeamStats(units, { a: 2 })[0].totals[0].value, undefined);
  assert.equal(getTeamStats(units, { a: 1, b: 1 })[0].incomplete, true);
  assert.equal(getTeamStats(units, { a: 1, b: 1 })[0].totals[0].value, undefined);
});

test('cumulative estimates are explicit, respect shared exclusions/caps and keep units, contexts and self effects separate', () => {
  const units = map(unit('a', [effect('slow', -20, { stacking: 'unknown', stackGroup: 'a' })]),
    unit('b', [effect('slow', -30, { stacking: 'unknown', stackGroup: 'b' })]));
  const slow = getTeamStats(units, { a: 1, b: 1 })[0].totals[0];
  assert.equal(slow.value, undefined);
  assert.deepEqual(slow.estimate, { minimum: -50, maximum: -50 });
  const conflicts = map(unit('a', [effect('shield', -20, { stacking: 'once' })]),
    unit('b', [effect('shield', -35, { stacking: 'once' })]));
  assert.deepEqual(getTeamStats(conflicts, { a: 3, b: 2 })[0].totals[0].estimate, { minimum: -35, maximum: -20 });
  const isolated = map(unit('self', [effect('damageb', 20, { target: 'self' })]),
    unit('other', [effect('damageb', 30, { unit: 'points' })]));
  const stats = getTeamStats(isolated, { self: 2, other: 1 })[0];
  assert.equal(stats.totals.length, 2);
  assert.equal(stats.totals.find((s) => s.target === 'self').value, undefined);
  assert.equal(stats.totals.find((s) => s.target === 'self').estimate, undefined);
  assert.equal(stats.totals.find((s) => s.unit === 'points').value, 30);
});

test('real slow, ATK, attack speed and mana regeneration expose cumulative numeric values without parsing runtime descriptions', async () => {
  const data = JSON.parse(await readFile(new URL('../public/data/2.323.json', import.meta.url), 'utf8'));
  const units = new Map(data.units.map((u) => [u.id, u]));
  const stats = getTeamStats(units, { hidden_sabo: 1, hidden_mobydick: 1, rare_chopper: 1,
    legendary_dragon: 1, rare_brook: 1, legendary_chopper: 1, random_yotsuba: 1, rare_sugar: 1 });
  const attack = getSummaryTotal(stats.find((s) => s.category === 'damageb'));
  assert.equal(attack.unit, '%');
  assert.deepEqual(attack.estimate, { minimum: 50, maximum: 50 });
  const speed = stats.find((s) => s.category === 'speedb').totals.find((t) => t.unit === '%');
  assert.deepEqual(speed.estimate, { minimum: 35, maximum: 35 });
  const slow = stats.find((s) => s.category === 'slow').totals.find((t) => t.activation === 'aura');
  assert.deepEqual(slow.estimate, { minimum: -75, maximum: -75 });
  const mana = stats.find((s) => s.category === 'regen').totals.find((t) => t.unit === 'mana/s');
  assert.deepEqual(mana.estimate, { minimum: 2.1, maximum: 2.1 });
});

test('verified additive groups sum after exclusions and caps, with unknown effects kept out of the subtotal', () => {
  const units = map(
    unit('a', [effect('shield', -10, { stacking: 'highest', stackGroup: 'buff-a', additiveGroup: 'armor' })]),
    unit('b', [effect('shield', -20, { stacking: 'highest', stackGroup: 'buff-a', additiveGroup: 'armor' })]),
    unit('c', [effect('shield', -7, { cap: 10, stackGroup: 'buff-c', additiveGroup: 'armor' })]),
    unit('unknown', [effect('shield', -99, { stacking: 'unknown', stackGroup: undefined })]));
  const armor = getTeamStats(units, { a: 3, b: 2, c: 2 })[0];
  assert.equal(armor.totals[0].value, -30);
  assert.equal(armor.incomplete, false);
  const partial = getTeamStats(units, { a: 3, b: 2, c: 2, unknown: 1 })[0];
  assert.equal(partial.totals[0].value, -30);
  assert.equal(partial.incomplete, true);
  // Additive metadata must never override duration/damage safeguards.
  const damage = map(unit('a', [effect('stun', 3, { stackGroup: 'a', additiveGroup: 'stuns' })]),
    unit('b', [effect('stun', 4, { stackGroup: 'b', additiveGroup: 'stuns' })]));
  assert.equal(getTeamStats(damage, { a: 1, b: 1 })[0].totals[0].value, undefined);
});

test('stun durations, damage percentages and resource requirements are never added across copies', () => {
  for (const category of ['stun', 'sstun', 'rangetlpd', 'mana-skill']) {
    const numeric = effect(category, 3, { unit: category === 'stun' || category === 'sstun' ? 's' : '%' });
    const stats = getTeamStats(map(unit('a', [numeric])), { a: 2 });
    assert.equal(stats[0].totals[0].value, undefined, category);
    assert.equal(stats[0].incomplete, true, category);
  }
});

test('checkbox conditions affect one copy and exclusive forms stay exclusive even with multiple owned copies', () => {
  const units = map(unit('a', [
    { category: 'stun', condition: 'Human', exclusiveGroup: 'form' },
    { category: 'stun', condition: 'Phoenix', exclusiveGroup: 'form' },
    { category: 'slow', condition: 'Upgrade 4' },
  ]));
  const saved = { a: { Human: 1, Phoenix: 4, 'Upgrade 4': 7, invalid: 3 }, absent: { test: 10 } };
  const active = sanitizeConditions(units, { a: 2 }, saved);
  assert.equal(active.a.Human, 1);
  assert.equal(active.a.Phoenix, undefined);
  assert.equal(active.a['Upgrade 4'], 1);
  assert.equal(active.a.invalid, undefined);
  assert.equal(getTeamStats(units, { a: 2 }) .length, 0);
  assert.equal(getTeamStats(units, { a: 2 }, active)[0].providers, 1);
  assert.equal(getTeamStats(units, { a: 1 }, active)[0].providers, 1);
  assert.equal(Object.keys(sanitizeConditions(units, {}, saved)).length, 0);
});

test('preference storage sanitizes corrupt data and keeps dataset namespaces separate', () => {
  assert.equal(readTeamPreferences('broken').profile, 'Hybrid');
  assert.equal(readTeamPreferences('{"profile":"unsupported"}').profile, 'Hybrid');
  const value = readTeamPreferences('{"profile":"Magic","expanded":true,"conditions":{"a":{"Upgrade 4":2,"bad":-1}}}');
  assert.equal(value.conditions.a['Upgrade 4'], 1);
  assert.equal(value.conditions.a.bad, undefined);
  assert.equal(readTeamPreferences(JSON.stringify(value)).expanded, true);
  const legacy = readTeamPreferences('{"profile":"Balanced","expanded":true,"conditions":{"a":{"Upgrade 4":2}}}');
  assert.equal(legacy.profile, 'Hybrid');
  assert.equal(legacy.expanded, true);
  assert.equal(legacy.conditions.a['Upgrade 4'], 1);
  assert.equal(readTeamPreferences('{"profile":"Balance"}').profile, 'Hybrid');
  assert.notEqual(teamStorageKey('2.323'), teamStorageKey('Custom'));
});

test('recommendations subtract consumed support and do not recommend a recipe with no net profile gain', () => {
  const units = map(unit('support', [{ category: 'shield' }]),
    unit('gain', [{ category: 'slow' }], { recipe: [{ unitId: 'support', count: 1 }] }),
    unit('better', [{ category: 'slow' }, { category: 'stun' }], { recipe: [{ unitId: 'support', count: 1 }] }));
  const inventory = { support: 1 };
  const before = JSON.stringify(inventory);
  const result = getRecommendations(units, inventory, new Set(), false, 'Physical');
  assert.equal(result.complete.find((r) => r.unit.id === 'gain'), undefined);
  assert.equal(result.complete[0].unit.id, 'better');
  assert.deepEqual(result.complete[0].lost, ['shield']);
  assert.equal(result.complete[0].netGain, 1);
  assert.equal(JSON.stringify(inventory), before);
  const singleOnly = map(unit('support', [{ category: 'shield' }]),
    unit('gain', [{ category: 'sstun' }, { category: 'slow' }], { recipe: [{ unitId: 'support', count: 1 }] }));
  const candidate = getRecommendations(singleOnly, inventory, new Set(), false, 'Physical').complete[0];
  assert.ok(candidate.gained.includes('sstun'));
  assert.ok(!candidate.gained.includes('stun'));
});

test('every profile requires slow/stun first, never treats mana activation as magic and preserves the last control provider', () => {
  const units = map(unit('common', [], { rarity: 'Common' }), unit('control', [{ category: 'slow' }]),
    unit('mana', [{ category: 'mana-skill' }], { recipe: [{ unitId: 'common', count: 100 }] }),
    unit('armor', [{ category: 'shield' }], { recipe: [{ unitId: 'common', count: 50 }] }),
    unit('magic', [{ category: 'docking' }], { recipe: [{ unitId: 'common', count: 40 }] }),
    unit('slow', [{ category: 'slow' }], { recipe: [{ unitId: 'common', count: 1 }] }),
    unit('stun', [{ category: 'sstun' }], { recipe: [{ unitId: 'common', count: 2 }] }),
    unit('bad_trade', [{ category: 'stun' }, { category: 'docking' }, { category: 'regen' }],
      { recipe: [{ unitId: 'control', count: 1 }] }));
  for (const profile of ['Hybrid', 'Physical', 'Magic', 'Explosion']) {
    const empty = getRecommendations(units, {}, new Set(), false, profile);
    assert.ok(empty.complete.every((r) => r.requiredGained.length > 0));
    assert.ok(!empty.complete.some((r) => ['mana', 'armor', 'magic'].includes(r.unit.id)));
    assert.deepEqual(empty.missingRequired, ['slow', 'stun']);
    const ownedSlow = getRecommendations(units, { control: 1 }, new Set(), false, profile);
    assert.ok(!ownedSlow.complete.some((r) => r.unit.id === 'bad_trade'));
    assert.deepEqual(ownedSlow.complete.map((r) => r.unit.id), ['stun']);
    assert.ok(!ownedSlow.easy.some((r) => r.unit.id === 'mana'));
  }
  const bothControls = { control: 1, stun: 1 };
  const magic = getRecommendations(units, bothControls, new Set(), false, 'Magic');
  assert.ok(magic.complete.some((r) => r.unit.id === 'magic'));
  assert.ok(!magic.complete.some((r) => ['mana', 'armor'].includes(r.unit.id)));
  const physical = getRecommendations(units, bothControls, new Set(), false, 'Physical');
  assert.ok(physical.complete.some((r) => r.unit.id === 'armor'));
  assert.ok(!physical.complete.some((r) => ['mana', 'magic'].includes(r.unit.id)));
  units.set('good_trade', unit('good_trade', [{ category: 'slow' }, { category: 'stun' }],
    { recipe: [{ unitId: 'control', count: 1 }] }));
  const replacement = getRecommendations(units, { control: 1 }, new Set(), false, 'Physical')
    .complete.find((r) => r.unit.id === 'good_trade');
  assert.ok(replacement);
  assert.deepEqual(replacement.requiredLost, []);
});

test('Wisp options, projected material losses, inherited bans and existing target quantities follow crafting semantics', () => {
  const units = map(unit('common', [], { rarity: 'Common' }), unit('common_wisp', [], { rarity: 'Common' }),
    unit('support', [{ category: 'shield' }], { recipe: [{ unitId: 'common', count: 2 }] }),
    unit('gain', [{ category: 'slow' }, { category: 'stun' }], { recipe: [{ unitId: 'support', count: 1 }, { unitId: 'common', count: 2 }] }));
  const inventory = { support: 1, common_wisp: 2, gain: 2 };
  const normal = previewCraft('gain', units, inventory, new Set(), false);
  assert.equal(normal.craftable, false);
  assert.equal(normal.after.support, 0);
  assert.equal(normal.after.gain, 3);
  assert.equal(normal.missing.common, 2);
  const assisted = previewCraft('gain', units, inventory, new Set(), true);
  assert.equal(assisted.craftable, true);
  assert.equal(assisted.wispCost, 2);
  assert.equal(assisted.after.common_wisp, 0);
  const banned = getRecommendations(units, inventory, new Set(['support']), true, 'Hybrid');
  assert.equal(banned.easy.some((r) => r.unit.id === 'gain'), false);
  assert.ok(getTeamStats(units, inventory).some((s) => s.category === 'shield'));
});

test('missing control falls back to the active profile supports without treating mana skills as magic', () => {
  const units = map(unit('common', [], { rarity: 'Common' }),
    ...[['armor', 'shield', 8], ['attack', 'damageb', 6], ['speed', 'speedb', 4],
      ['mr', 'mshield', 9], ['amp', 'docking', 7], ['explosion', 'bombup', 5], ['mana', 'mana-skill', 99]]
      .map(([id, category, cost]) => unit(id, [{ category }], { recipe: [{ unitId: 'common', count: cost }] })));
  for (const [profile, expected] of [['Physical', ['speed', 'attack', 'armor']],
    ['Magic', ['amp', 'mr']], ['Explosion', ['explosion', 'mr']], ['Hybrid', ['speed', 'attack', 'armor', 'mr']]]) {
    const result = getRecommendations(units, {}, new Set(), false, profile);
    assert.equal(result.profileFallback, true, profile);
    assert.deepEqual(result.missingRequired, ['slow', 'stun']);
    assert.deepEqual(result.complete.map((r) => r.unit.id), expected, profile);
    assert.ok(result.complete.every((r) => r.fills.length > 0 && r.requiredLost.length === 0 && r.netGain > 0));
    assert.ok(result.complete.every((r) => r.projected && r.missing.common > 0));
  }
  units.set('stun', unit('stun', [{ category: 'sstun' }], { recipe: [{ unitId: 'common', count: 1 }] }));
  const prioritized = getRecommendations(units, {}, new Set(), false, 'Physical');
  assert.equal(prioritized.profileFallback, false);
  assert.deepEqual(prioritized.complete.map((r) => r.unit.id), ['stun']);
  const bannedControl = getRecommendations(units, {}, new Set(['stun']), false, 'Physical');
  assert.equal(bannedControl.profileFallback, true);
  assert.deepEqual(bannedControl.complete.map((r) => r.unit.id), ['speed', 'attack', 'armor']);
});

test('profile fallback preserves control providers and special-material requirements', () => {
  const units = map(unit('common', [], { rarity: 'Common' }), unit('token', [], { rarity: 'Other' }),
    unit('slow', [{ category: 'slow' }]),
    unit('bad', [{ category: 'shield' }, { category: 'damageb' }, { category: 'speedb' }],
      { recipe: [{ unitId: 'slow', count: 1 }] }),
    unit('gated', [{ category: 'shield' }], { recipe: [{ unitId: 'token', count: 1 }] }),
    unit('safe', [{ category: 'damageb' }], { recipe: [{ unitId: 'common', count: 2 }] }));
  const result = getRecommendations(units, { slow: 1 }, new Set(), false, 'Physical');
  assert.equal(result.profileFallback, true);
  assert.deepEqual(result.complete.map((r) => r.unit.id), ['safe']);
  const blocked = getRecommendations(units, { slow: 1 }, new Set(['safe']), false, 'Physical');
  assert.equal(blocked.profileFallback, false);
  assert.deepEqual(blocked.complete, []);
  const available = getRecommendations(units, { slow: 1, token: 1 }, new Set(['safe']), false, 'Physical');
  assert.equal(available.profileFallback, true);
  assert.deepEqual(available.complete.map((r) => r.unit.id), ['gated']);
  assert.deepEqual(available.missingRequired, ['stun']);
});

test('recommendations are deterministic, limit each tab to five, and empty inventory still produces explicit material needs', () => {
  const common = unit('common', [], { rarity: 'Common' });
  const units = map(common, ...Array.from({ length: 8 }, (_, i) => unit(`u${i}`, [{ category: 'slow' }],
    { recipe: [{ unitId: 'common', count: 1 }] })));
  const result = getRecommendations(units, {}, new Set(), false, 'Physical');
  assert.equal(result.complete.length, 5);
  assert.equal(result.easy.length, 5);
  assert.deepEqual(result.easy.map((r) => r.unit.id), ['u0', 'u1', 'u2', 'u3', 'u4']);
  assert.equal(result.easy[0].missing.common, 1);
  assert.equal(result.easy[0].projected, true);
});

test('equally useful candidates rank readiness and missing recursive material cost before total price and the five-result limit', () => {
  const units = map(unit('common', [], { rarity: 'Common' }),
    unit('part', [], { recipe: [{ unitId: 'common', count: 2 }] }),
    ...Array.from({ length: 8 }, (_, i) => unit(`u${i + 1}`, [{ category: 'slow' }],
      { recipe: [{ unitId: 'part', count: i + 1 }] })));
  const result = getRecommendations(units, { common: 2 }, new Set(), false, 'Hybrid');
  for (const tab of ['complete', 'easy']) {
    assert.deepEqual(result[tab].map((r) => r.unit.id), ['u1', 'u2', 'u3', 'u4', 'u5']);
    assert.deepEqual(result[tab].map((r) => r.totalCost), [2, 4, 6, 8, 10]);
  }
});

test('both tabs require the exact Random, Combination Item and Other recipe materials in sufficient quantity, regardless of Wisp', () => {
  for (const rarity of ['Random', 'Combination Item', 'Combination Items', 'Other']) {
    const units = map(unit('common', [], { rarity: 'Common' }), unit('common_wisp', [], { rarity: 'Common' }),
      unit('special', [], { rarity, recipe: [{ unitId: 'common', count: 1 }] }),
      unit('unrelated', [], { rarity }),
      unit('candidate', [{ category: 'slow' }], { rarity: rarity === 'Random' ? 'Mystic' : 'Eternal',
        recipe: [{ unitId: 'special', count: 2 }, { unitId: 'common', count: 3 }] }));
    for (const inventory of [{}, { unrelated: 10 }, { special: 0 }, { special: 1 },
      { special: 1, common: 99, common_wisp: 99 }, { candidate: 1, common: 99 }]) {
      const result = getRecommendations(units, inventory, new Set(), true, 'Hybrid');
      for (const tab of ['complete', 'easy']) assert.equal(result[tab].length, 0, `${rarity}: ${JSON.stringify(inventory)} ${tab}`);
    }
    const eligible = getRecommendations(units, { special: 2 }, new Set(), false, 'Hybrid');
    for (const tab of ['complete', 'easy']) {
      assert.equal(eligible[tab][0].unit.id, 'candidate', rarity);
      assert.equal(eligible[tab][0].missing.common, 3, rarity);
    }
  }
});

test('special-material gates consume shared quantities across nested recipes and accept already-owned intermediates', () => {
  const units = map(unit('common', [], { rarity: 'Common' }), unit('token', [], { rarity: 'Other' }),
    unit('part', [], { recipe: [{ unitId: 'token', count: 1 }, { unitId: 'common', count: 2 }] }),
    unit('candidate', [{ category: 'slow' }], { recipe: [{ unitId: 'part', count: 2 }] }));
  assert.equal(getRecommendations(units, { token: 1 }, new Set(), false, 'Hybrid').easy.length, 0);
  for (const inventory of [{ token: 2 }, { part: 1, token: 1 }, { part: 2 }]) {
    const result = getRecommendations(units, inventory, new Set(), false, 'Hybrid');
    assert.equal(result.complete[0].unit.id, 'candidate');
    assert.equal(result.easy[0].unit.id, 'candidate');
  }
  assert.equal(getRecommendations(units, { part: 1 }, new Set(), false, 'Hybrid').easy.length, 0);
});

test('numeric metadata round-trips through Custom and malformed or guessed metrics are rejected', () => {
  const data = { version: 'Custom', rarities: ['Legendary'], units: [unit('a', [effect('shield', -10, { additiveGroup: 'armor' })])] };
  assert.ok(isGameData(data));
  assert.deepEqual(readCustomData(JSON.stringify(data)), data);
  for (const numeric of [{ value: NaN }, { ...effect('shield', -10).numeric, stacking: 'sum', stackGroup: undefined },
    { ...effect('shield', -10).numeric, duration: 0 }, { ...effect('shield', -10).numeric, cap: 5 },
    { ...effect('shield', -10).numeric, target: 'invented' }]) {
    assert.equal(isCapability({ category: 'shield', source: 'tmo', numeric }), false);
  }
  for (const extra of [{ additiveGroup: '' }, { additiveGroup: 5 }, { additiveGroup: 'armor', stacking: 'unknown' }]) {
    assert.equal(isCapability(effect('shield', -10, extra)), false);
  }
  assert.equal(isCapability({ category: 'shield', exclusiveGroup: 'form' }), false);
  assert.equal(isCapability({ category: 'shield', source: 'tmo' }), true);
  assert.equal(displayAbilityText('TMO — -10 (TMO)'), '-10');
});

test('bundled metadata is validated, TMO selections match exact map identities, and map values keep priority', async () => {
  const read = async (name) => JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8'));
  const data = await read('../public/data/2.323.json');
  const audit = await read('../docs/capability-source-audit-2.323.json');
  const mapAudit = await read('../docs/capability-map-audit-2.323.json');
  assert.ok(isGameData(data));
  assert.ok(data.units.flatMap((u) => u.capabilities || []).filter((c) => c.numeric).length > 250);
  const units = new Map(data.units.map((u) => [u.id, u]));
  for (const [id, record] of Object.entries(audit.units)) {
    for (const selection of record.tmoSelections || []) {
      assert.ok(selection.rawUnitIds.some((rawId) => mapAudit.units[id].objects.some((obj) => obj.rawId === rawId)), id);
      const actual = units.get(id).capabilities.filter((c) => c.category === selection.category && !c.condition);
      assert.ok(actual.every((c) => c.source === 'tmo'), id);
      assert.deepEqual(actual, selection.replacement, id);
    }
  }
  assert.equal(units.get('rare_hawkins').capabilities.find((c) => c.category === 'shield').source, 'warcraft-map');
  assert.equal(units.get('special_chopperguard').capabilities.find((c) => c.category === 'damageb').source, 'tmo');
  const stats = getTeamStats(units, { hidden_bonkurei: 2, hidden_ivankov: 1 });
  assert.equal(stats.find((s) => s.category === 'shield').totals[0].value, -11);
  const choices = units.get('distortion_blackmaria').capabilities.filter((c) => c.condition);
  assert.equal(new Set(choices.map((c) => c.condition)).size, 3);
  assert.ok(choices.every((c) => c.exclusiveGroup === 'black-maria-skill'));
  const armor = (inventory) => getTeamStats(units, inventory).find((s) => s.category === 'shield').totals[0].value;
  assert.equal(armor({ rare_sabo: 3, hidden_sabo: 2 }), -30);
  assert.equal(armor({ hidden_sabo: 1, transcendence_sabo: 1 }), undefined);
  assert.equal(armor({ rare_sabo: 2, hidden_sabo: 1, transcendence_sabo: 1 }), -10);
  assert.equal(armor({ special_hawkins: 1, rare_hawkins: 2, transcendence_chopper: 1 }), -50);
});

test('native negative aura collisions retain contributions and mark a partial total without guessing the winner', async () => {
  const data = JSON.parse(await readFile(new URL('../public/data/2.323.json', import.meta.url), 'utf8'));
  const units = new Map(data.units.map((u) => [u.id, u]));
  for (const [a, b] of [['hidden_sabo', 'transcendence_sabo'], ['special_hawkins', 'rare_hawkins'],
    ['legendary_chopper', 'transcendence_chopper']]) {
    const stat = getTeamStats(units, { [a]: 1, [b]: 1 }).find((s) => s.category === 'shield');
    assert.equal(stat.totals[0].value, undefined, `${a}/${b}`);
    assert.equal(stat.incomplete, true);
    assert.equal(stat.contributions.length, 2);
    const alone = getTeamStats(units, { [b]: 3 }).find((s) => s.category === 'shield');
    assert.equal(alone.totals[0].value, alone.contributions[0].effect.numeric.value);
  }
  const partial = getTeamStats(units, { rare_sabo: 3, hidden_sabo: 1, transcendence_sabo: 1 })
    .find((s) => s.category === 'shield');
  assert.equal(partial.totals[0].value, -10);
  assert.equal(partial.incomplete, true);
});
