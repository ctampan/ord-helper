import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import test from 'node:test';
import { calculateConsumption, calculateTotalCost, getEffectiveBans, getUnitDetails } from '../src/logic/combination.ts';
import { createGameCatalog, isGameData, resolveGameData, readCustomData, retainValidState } from '../src/logic/data.ts';

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const data = await readJson('../public/data/2.323.json');
const catalog = createGameCatalog({ '2.323.json': data });
const units = new Map(data.units.map((unit) => [unit.id, unit]));
const custom = {
  version: 'test-custom', rarities: ['Common'],
  units: [{ id: 'common_wisp', name: 'Wisp', rarity: 'Common', image: 'images/common_wisp.png' }],
};

test('all shipped datasets are discoverable and 2.323 has the complete validated unit graph', async () => {
  const files = (await readdir(new URL('../public/data/', import.meta.url))).filter((file) => file.endsWith('.json'));
  const sources = Object.fromEntries(await Promise.all(files.map(async (file) => [file, await readJson(`../public/data/${file}`)])));
  assert.equal(createGameCatalog(sources).size, files.length);
  assert.equal(data.version, '2.323');
  assert.equal(data.units.length, 278);
  assert.equal(data.rarities.length, 17);
  assert.equal(isGameData(data), true);
  assert.equal(units.has('alternate_ace'), false);
  assert.equal(data.units.filter((unit) => unit.rarity === 'Seraphim').length, 4);
  const audit = await readJson('../docs/capability-audit-2.323.json');
  assert.equal(Object.values(audit.units).filter(({ originalNote }) => originalNote).length, 251);
  for (const unit of data.units) {
    const note = audit.units[unit.id].originalNote.replace(/Group reference:\s*.*?(?:\.(?=\s|$)|$)/gi, '').trim();
    if (note) assert.ok(unit.capabilities?.length || unit.abilityDetails || unit.note, unit.id);
    assert.doesNotMatch(unit.note || '', /Group reference:/);
  }
  for (const unit of data.units) {
    assert.doesNotMatch(unit.name + (unit.note || ''), /[\uac00-\ud7af]/);
    assert.match(unit.image, /^images\/[a-z]+_[a-z0-9]+\.(png|jpg)$/);
    assert.ok((await stat(new URL(`../public/${unit.image}`, import.meta.url))).isFile());
    assert.ok(Number.isFinite(calculateTotalCost(unit.id, units)));
    assert.ok(Number.isFinite(getUnitDetails(unit.id, units, {}, new Set()).progress));
    if (unit.rarity === 'Common') assert.equal(unit.recipe, undefined);
    if (unit.recipe?.length) {
      const inventory = {};
      for (const { unitId, count } of unit.recipe) inventory[unitId] = (inventory[unitId] || 0) + count;
      assert.deepEqual(calculateConsumption(unit.id, units, inventory, new Set()), inventory);
    }
  }
});

test('new recipes and all four independent Vegapunk variants use the source ingredients', () => {
  const recipe = (id) => Object.fromEntries(units.get(id).recipe.map((r) => [r.unitId, r.count]));
  assert.deepEqual(recipe('eternal_ace'), { legendary_marco: 1, distortion_ace: 1 });
  assert.deepEqual(recipe('transcendence_sabo'), { legendary_marco: 1, other_kuma: 1, distortion_burgess: 1 });
  assert.deepEqual(recipe('mystic_byakuya'), { rare_mihawk: 1, random_ichigo: 1, distortion_ace: 1 });
  assert.deepEqual(recipe('transcendence_bonney'), { hidden_stussy: 1, legendary_kuma: 1, special_zoro: 1, special_capone: 1 });
  for (const form of ['ssnake', 'shawk', 'sshark', 'sbear']) {
    const unit = units.get(`transcendence_vegapunk_${form}`);
    assert.deepEqual(recipe(unit.id), {
      hidden_stussy: 1, rare_kizaru: 1, other_kuma: 1, [`seraphim_${form}`]: 1,
    });
    assert.equal(unit.image, 'images/transcendence_vegapunk.png');
    assert.match(unit.abilityDetails, /Punk Records/);
    const capabilities = units.get(`seraphim_${form}`).capabilities;
    assert.ok(capabilities.some(({ category, condition }) => category === 'sstun' && !condition));
    assert.ok(capabilities.some(({ category, condition }) => category === 'sky' && !condition));
  }
});

test('Wisps remain optional substitutes and bans propagate through Seraphim recipes', () => {
  assert.equal(calculateConsumption('uncommon_robin', units, { common_wisp: 2 }, new Set()), null);
  assert.deepEqual(calculateConsumption('uncommon_robin', units, { common_wisp: 2 }, new Set(), 1, true), { common_wisp: 2 });
  const banned = getEffectiveBans(units, new Set(['other_greenblood']));
  for (const form of ['ssnake', 'shawk', 'sshark', 'sbear']) {
    assert.ok(banned.has(`seraphim_${form}`));
    assert.ok(banned.has(`transcendence_vegapunk_${form}`));
  }
});

test('cost cache is isolated when IDs are reused by Custom', () => {
  const makeMap = (count) => new Map([
    ['base', { id: 'base', name: 'Base', rarity: 'Common', image: '' }],
    ['target', { id: 'target', name: 'Target', rarity: 'Rare', image: '', recipe: [{ unitId: 'base', count }] }],
  ]);
  const first = makeMap(2);
  const second = makeMap(3);
  assert.equal(calculateTotalCost('target', first), 2);
  assert.equal(calculateTotalCost('target', second), 3);
  assert.equal(calculateTotalCost('target', first), 2);
});

test('first visit and every retired version resolve immediately to bundled 2.323', () => {
  for (const version of ['', '2.111', '2.200-2.211', '2.220', '2.323']) {
    const loaded = resolveGameData(version, null, catalog);
    assert.equal(loaded.version, '2.323');
    assert.equal(loaded.migrated, !!version && version !== '2.323');
    assert.deepEqual(loaded.data, data);
    assert.deepEqual(loaded.versions, ['2.323']);
  }
});

test('migration preserves valid inventory and bans, including on reload', () => {
  const original = { common_luffy: 4, alternate_ace: 3, nonexistent: 1, legendary_ace: 2 };
  const bans = new Set(['common_luffy', 'alternate_ace']);
  const state = retainValidState(data, original, bans);
  assert.deepEqual(state.inventory, { common_luffy: 4, legendary_ace: 2 });
  assert.deepEqual([...state.bans], ['common_luffy']);
  assert.equal(original.alternate_ace, 3);
  assert.ok(bans.has('alternate_ace'));
  const reloaded = resolveGameData('2.323', null, catalog);
  assert.equal(reloaded.migrated, false);
  assert.deepEqual(retainValidState(reloaded.data, state.inventory, state.bans), state);
});

test('valid Custom persists and resolves immediately from storage', () => {
  const loaded = resolveGameData('Custom', JSON.stringify(custom), catalog);
  assert.deepEqual(loaded.data, custom);
  assert.deepEqual(loaded.versions, ['2.323', 'Custom']);
  assert.equal(loaded.migrated, false);
});

test('invalid Custom is excluded and safely falls back to bundled 2.323', () => {
  for (const invalid of [null, '{', '{}', JSON.stringify({ units: [] })]) {
    assert.equal(readCustomData(invalid), null);
    const loaded = resolveGameData('Custom', invalid, catalog);
    assert.equal(loaded.migrated, true);
    assert.deepEqual(loaded.versions, ['2.323']);
  }
  const cyclic = structuredClone(custom);
  cyclic.units[0].recipe = [{ unitId: 'common_wisp', count: 1 }];
  assert.equal(isGameData(cyclic), false);
  cyclic.units[0].recipe = [{ unitId: 'missing', count: 1 }];
  assert.equal(isGameData(cyclic), false);
  cyclic.units[0].recipe = [{ unitId: 'common_wisp', count: 0 }];
  assert.equal(isGameData(cyclic), false);
});

test('startup, migration and Custom switches work even when all fetch calls fail', () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Network unavailable'); };
  try {
    const savedCustom = JSON.stringify(custom);
    for (const version of ['', '2.220', 'Custom', '2.323', 'Custom']) {
      const loaded = resolveGameData(version, savedCustom, catalog);
      assert.equal(loaded.data.units.length, version === 'Custom' ? 1 : 278);
      assert.equal(loaded.data instanceof Promise, false);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test('new files appear automatically, newest is the initial default, saved choices persist', () => {
  const sources = Object.fromEntries(['2.9', '2.324', '2.10', '2.323'].map((version) => [
    `../../public/data/${version}.json`, { ...custom, version },
  ]));
  const discovered = createGameCatalog(sources);
  assert.deepEqual([...discovered.keys()], ['2.324', '2.323', '2.10', '2.9']);
  assert.equal(resolveGameData('', null, discovered).version, '2.324');
  assert.equal(resolveGameData('2.323', null, discovered).version, '2.323');
  assert.equal(resolveGameData('2.220', null, discovered).version, '2.324');
  assert.equal(resolveGameData('Custom', JSON.stringify(custom), discovered).version, 'Custom');
  for (const version of discovered.keys()) {
    const loaded = resolveGameData(version, null, discovered);
    assert.equal(loaded.version, version);
    assert.equal(loaded.migrated, false);
    const state = retainValidState(loaded.data, { common_wisp: 7, removed: 2 }, new Set(['common_wisp', 'removed']));
    assert.deepEqual(state.inventory, { common_wisp: 7 });
    assert.deepEqual([...state.bans], ['common_wisp']);
  }
});

test('catalog rejects malformed files, metadata mismatches and duplicate or reserved versions', () => {
  assert.throws(() => createGameCatalog({}));
  assert.throws(() => createGameCatalog({ '2.324.json': data }));
  assert.throws(() => createGameCatalog({ 'broken.json': {} }));
  assert.throws(() => createGameCatalog({ 'Custom.json': { ...custom, version: 'Custom' } }));
  assert.throws(() => createGameCatalog({ 'a/2.323.json': data, 'b/2.323.json': data }));
});
