import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { damageFit, damageLabel, isDamageProfile } from '../src/logic/damage.ts';
import { isGameData, readCustomData } from '../src/logic/data.ts';
import { getRecommendations, getTeamStats } from '../src/logic/teamStats.ts';

const damage = (types, dominant = types[0] ?? null, core = true) => ({ types, dominant, core });
const unit = (id, damageProfile, categories = [], count = 1, ingredient = 'common') => ({
  id, name: id, rarity: 'Legendary', image: '', damageProfile,
  capabilities: categories.map((category) => ({ category })), recipe: [{ unitId: ingredient, count }],
});
const map = (...units) => new Map([{ id: 'common', name: 'Common', rarity: 'Common', image: '' }, ...units].map((u) => [u.id, u]));
const recommend = (units, inventory = {}, profile = 'Physical', bans = new Set(), wisp = false, conditions = {}) =>
  getRecommendations(units, inventory, bans, wisp, profile, conditions);

test('empty teams seek a matching final-build core, independently of support or expensive magical Sengoku', () => {
  const units = map(unit('physical', damage(['Physical']), [], 20),
    unit('sengoku', damage(['Magic', 'Explosion']), ['stun', 'damageb'], 100),
    unit('slow', undefined, ['slow']));
  const empty = recommend(units);
  assert.equal(empty.corePhase, true);
  assert.equal(empty.missingCore, true);
  assert.deepEqual(empty.complete.map((r) => r.unit.id), ['physical']);
  assert.equal(empty.complete[0].addsCore, true);
  assert.equal(empty.complete[0].netGain, 0);
  assert.equal(empty.complete[0].missing.common, 20);
  const withCore = recommend(units, { physical: 1 });
  assert.equal(withCore.corePhase, false);
  assert.equal(withCore.missingCore, false);
  assert.equal(withCore.complete[0].unit.id, 'sengoku');
  assert.ok(withCore.complete[0].requiredGained.includes('stun'));
  assert.equal(withCore.complete[0].damageFit, 0);
  const banned = recommend(units, {}, 'Physical', new Set(['physical']));
  assert.equal(banned.corePhase, false);
  assert.ok(banned.complete.some((r) => r.unit.id === 'sengoku'));
});

test('Magic, Explosion and Hybrid use explicit dominance; secondary damage alone never establishes the wrong core', () => {
  const units = map(unit('physical', damage(['Physical', 'Magic'], 'Physical')),
    unit('magic', damage(['Magic', 'Explosion'], 'Magic')),
    unit('explosion', damage(['Magic', 'Explosion'], 'Explosion')),
    unit('mixed', damage(['Physical', 'Magic'], null)));
  assert.deepEqual(recommend(units).complete.map((r) => r.unit.id), ['physical']);
  assert.deepEqual(recommend(units, {}, 'Magic').complete.map((r) => r.unit.id), ['magic']);
  assert.deepEqual(recommend(units, {}, 'Explosion').complete.map((r) => r.unit.id), ['explosion']);
  assert.equal(recommend(units, {}, 'Hybrid').complete.length, 4);
  assert.equal(damageFit(units.get('physical'), 'Magic'), 1);
  assert.match(damageLabel(units.get('physical')), /Hybrid.*Physical dominant/);
  assert.match(damageLabel(units.get('mixed')), /dominance unclassified/);
});

test('both control coverage and an existing last core are protected when ingredients are consumed', () => {
  const units = map(unit('physical', damage(['Physical']), ['slow', 'stun']),
    unit('bad', damage(['Magic']), ['slow', 'stun', 'shield', 'damageb'], 1, 'physical'),
    unit('replacement', damage(['Physical']), ['slow', 'stun', 'shield'], 1, 'physical'));
  const stock = { physical: 1 };
  const before = JSON.stringify(stock);
  const result = recommend(units, stock);
  assert.ok(!result.complete.some((r) => r.unit.id === 'bad'));
  assert.ok(result.easy.find((r) => r.unit.id === 'bad').losesCore);
  assert.ok(result.complete.some((r) => r.unit.id === 'replacement'));
  assert.equal(JSON.stringify(stock), before);
  units.set('lose_control', unit('lose_control', damage(['Physical']), [], 1, 'physical'));
  assert.ok(!recommend(units, stock).complete.some((r) => r.unit.id === 'lose_control'));
  assert.equal(recommend(units, { physical: 2 }).easy.find((r) => r.unit.id === 'bad').losesCore, false);
});

test('core candidates cannot spend the last slow/stun; unavailable special ingredients are still mandatory', () => {
  const units = map(unit('slow', undefined, ['slow']),
    unit('unsafe', damage(['Physical']), [], 1, 'slow'),
    unit('token', undefined), unit('gated', damage(['Physical']), [], 2, 'token'));
  units.get('token').rarity = 'Random';
  assert.equal(recommend(units, { slow: 1, token: 1 }).corePhase, false);
  assert.deepEqual(recommend(units, { slow: 1, token: 1 }).complete, []);
  assert.deepEqual(recommend(units, { slow: 1, token: 2 }).complete.map((r) => r.unit.id), ['gated']);
});

test('both tabs exclude early rarities while Easy to craft prefers ready/nearby relevant endgame units', () => {
  const units = map(unit('ready', damage(['Physical'], 'Physical', false), [], 1),
    unit('nearby', damage(['Physical']), [], 2), unit('expensive', damage(['Physical']), [], 100),
    unit('magic', damage(['Magic']), [], 1), unit('support', damage(['Magic']), ['shield'], 3),
    unit('mana', undefined, ['mana-skill']), unit('unknown', undefined));
  const early = ['Common', 'Uncommon', 'Special', 'Rare'].map((rarity) =>
    ({ ...unit(`early_${rarity}`, damage(['Physical']), ['slow', 'stun']), rarity }));
  for (const u of early) units.set(u.id, u);
  const result = recommend(units, { common: 1 });
  assert.deepEqual(result.easy.map((r) => r.unit.id), ['ready', 'nearby', 'support', 'expensive']);
  assert.deepEqual(result.complete.map((r) => r.unit.id), ['nearby', 'expensive']);
  for (const inventory of [{}, { common: 10 }, { ready: 1 }, { common: 10, ready: 1 }]) {
    const recommendations = recommend(units, inventory);
    for (const tab of ['complete', 'easy']) {
      assert.ok(recommendations[tab].length > 0);
      assert.ok(recommendations[tab].every((r) => !r.unit.id.startsWith('early_')));
    }
  }
  assert.ok(getTeamStats(units, { early_Rare: 1 }).some((stat) => stat.category === 'stun'));
  units.set('common_wisp', { id: 'common_wisp', name: 'Wisp', rarity: 'Common', image: '' });
  assert.equal(recommend(units, { common_wisp: 1 }, 'Physical', new Set(), true).easy[0].craftable, true);
  assert.equal(recommend(units, { common_wisp: 1 }, 'Physical', new Set(), false).easy[0].craftable, false);
});

test('unmapped legacy data remains support-only and conditional support does not imply a core or damage type', () => {
  const conditional = unit('conditional', undefined);
  conditional.capabilities = [{ category: 'stun', condition: 'Upgrade 4' }];
  const units = map(conditional, unit('support', undefined, ['shield']), unit('mana', undefined, ['mana-skill']));
  assert.deepEqual(recommend(units).complete.map((r) => r.unit.id), ['support']);
  assert.equal(recommend(units).profileFallback, true);
  assert.equal(recommend(units, { conditional: 1 }, 'Physical', new Set(), false,
    { conditional: { 'Upgrade 4': 1 } }).missingRequired.includes('stun'), false);
  assert.equal(damageFit(conditional, 'Magic'), 0);
  const without = structuredClone(getTeamStats(units, { support: 1 }));
  delete without[0].contributions[0].unit.damageProfile;
  units.get('support').damageProfile = damage(['Magic']);
  const after = structuredClone(getTeamStats(units, { support: 1 }));
  delete after[0].contributions[0].unit.damageProfile;
  assert.deepEqual(after, without);
});

test('Custom validates and round-trips damage metadata while retaining backwards compatibility', () => {
  const data = { version: 'Custom', rarities: ['Common', 'Legendary'], units: [...map(unit('a', damage(['Physical', 'Magic']))).values()] };
  assert.ok(isGameData(data));
  assert.deepEqual(readCustomData(JSON.stringify(data)), data);
  for (const bad of [null, {}, damage(['Fire']), damage(['Magic', 'Magic']), damage(['Magic'], 'Physical'),
    damage([], null), { ...damage(['Magic']), core: 'true' }, { types: ['Magic'], core: true }]) {
    assert.equal(isDamageProfile(bad), false);
    data.units[1].damageProfile = bad;
    assert.equal(isGameData(data), false);
  }
  delete data.units[1].damageProfile;
  assert.ok(isGameData(data));
  assert.ok(isDamageProfile(damage([], null, false)));
});

test('all bundled entries have audited damage metadata; real Sengoku does not become a Physical core', async () => {
  const read = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
  const data = await read('../public/data/2.323.json');
  const source = await read('../scripts/data/damage-profiles-2.323.json');
  const audit = await read('../docs/damage-profile-audit-2.323.json');
  assert.equal(data.units.length, 278);
  assert.ok(isGameData(data));
  for (const unit of data.units) {
    assert.deepEqual(unit.damageProfile, source.units[unit.id].profile, unit.id);
    assert.deepEqual(audit.units[unit.id], source.units[unit.id], unit.id);
  }
  const units = new Map(data.units.map((u) => [u.id, u]));
  assert.deepEqual(units.get('immortal_sengoku').damageProfile, damage(['Magic', 'Explosion'], 'Magic'));
  assert.equal(units.get('legendary_sengoku').damageProfile.dominant, 'Magic');
  assert.ok(units.get('legendary_sengoku').damageProfile.types.includes('Physical'));
  for (const profile of ['Physical', 'Magic', 'Explosion', 'Hybrid']) {
    const result = recommend(units, {}, profile);
    assert.equal(result.corePhase, true, profile);
    assert.ok(result.complete.every((r) => r.addsCore && r.damageFit === 2), profile);
    assert.ok(result.complete.length <= 5 && result.easy.length <= 5);
    assert.deepEqual(result, recommend(units, {}, profile));
  }
  assert.ok(!recommend(units).complete.some((r) => r.unit.id.includes('sengoku')));
  // Keep the actual skillsets, isolating support eligibility from the five-card
  // cutoff and unrelated candidates in the complete shipped recipe graph.
  const supportUnits = map(...['immortal_garp', 'immortal_sengoku'].map((id) =>
    ({ ...units.get(id), recipe: [{ unitId: 'common', count: 1 }] })));
  const withCore = recommend(supportUnits, { immortal_garp: 1 });
  assert.ok(withCore.complete.some((r) => r.unit.id === 'immortal_sengoku'));
});
