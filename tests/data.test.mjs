import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import test from 'node:test';
import { calculateConsumption, calculateTotalCost, getEffectiveBans, getUnitDetails } from '../src/logic/combination.ts';
import { isGameData, loadGameData, readCustomData, retainValidState } from '../src/logic/data.ts';

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const data = await readJson('../public/data/2.323.json');
const units = new Map(data.units.map((unit) => [unit.id, unit]));
const custom = {
  version: 'test-custom', rarities: ['Common'],
  units: [{ id: 'common_wisp', name: 'Wisp', rarity: 'Common', image: 'images/common_wisp.png' }],
};
const base = '/ord-helper/';
function mockFetch({ failPath, body = data, manifest = ['2.323'] } = {}) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push(url);
    options?.signal?.throwIfAborted();
    if (url === failPath) return new Response('Unavailable', { status: 503 });
    if (url === `${base}versions.json`) return Response.json(manifest);
    if (url === `${base}data/2.323.json`) return Response.json(body);
    throw new Error(`Unexpected request: ${url}`);
  };
  return { calls, fetcher };
}

test('only 2.323 is shipped, with the complete validated unit graph', async () => {
  assert.deepEqual(await readJson('../public/versions.json'), ['2.323']);
  assert.deepEqual(await readdir(new URL('../public/data/', import.meta.url)), ['2.323.json']);
  assert.equal(data.version, '2.323');
  assert.equal(data.units.length, 278);
  assert.equal(data.rarities.length, 17);
  assert.equal(isGameData(data), true);
  assert.equal(units.has('alternate_ace'), false);
  assert.equal(data.units.filter((unit) => unit.rarity === 'Seraphim').length, 4);
  assert.equal(data.units.filter((unit) => unit.note).length, 251);
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
    assert.match(unit.note, /Punk Records/);
    assert.match(units.get(`seraphim_${form}`).note, /single-target stun and can fly/);
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

test('first visit and every retired version resolve directly to 2.323', async () => {
  for (const version of ['', '2.111', '2.200-2.211', '2.220', '2.323']) {
    const { calls, fetcher } = mockFetch();
    const loaded = await loadGameData(base, version, null, undefined, fetcher);
    assert.equal(loaded.version, '2.323');
    assert.equal(loaded.migrated, !!version && version !== '2.323');
    assert.deepEqual(calls, [`${base}versions.json`, `${base}data/2.323.json`]);
  }
});

test('migration preserves valid inventory and bans, including on reload', async () => {
  const original = { common_luffy: 4, alternate_ace: 3, nonexistent: 1, legendary_ace: 2 };
  const bans = new Set(['common_luffy', 'alternate_ace']);
  const state = retainValidState(data, original, bans);
  assert.deepEqual(state.inventory, { common_luffy: 4, legendary_ace: 2 });
  assert.deepEqual([...state.bans], ['common_luffy']);
  assert.equal(original.alternate_ace, 3);
  assert.ok(bans.has('alternate_ace'));
  const { fetcher } = mockFetch();
  const reloaded = await loadGameData(base, '2.323', null, undefined, fetcher);
  assert.equal(reloaded.migrated, false);
  assert.deepEqual(retainValidState(reloaded.data, state.inventory, state.bans), state);
});

test('valid Custom persists and does not request the built-in dataset', async () => {
  const { calls, fetcher } = mockFetch();
  const loaded = await loadGameData(base, 'Custom', JSON.stringify(custom), undefined, fetcher);
  assert.deepEqual(loaded.data, custom);
  assert.deepEqual(loaded.versions, ['2.323', 'Custom']);
  assert.equal(loaded.migrated, false);
  assert.deepEqual(calls, [`${base}versions.json`]);
});

test('invalid Custom is excluded and safely falls back to 2.323', async () => {
  for (const invalid of [null, '{', '{}', JSON.stringify({ units: [] })]) {
    assert.equal(readCustomData(invalid), null);
    const { fetcher } = mockFetch();
    const loaded = await loadGameData(base, 'Custom', invalid, undefined, fetcher);
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

test('load errors reject without migration or a legacy fallback; retry can succeed', async () => {
  for (const failPath of [`${base}versions.json`, `${base}data/2.323.json`]) {
    const { calls, fetcher } = mockFetch({ failPath });
    await assert.rejects(loadGameData(base, '2.220', null, undefined, fetcher), /HTTP 503/);
    assert.ok(calls.every((url) => !url.endsWith('data.json') && !url.includes('2.220')));
  }
  for (const body of [{ units: [] }, { ...data, version: '2.111' }]) {
    const { fetcher } = mockFetch({ body });
    await assert.rejects(loadGameData(base, '2.220', null, undefined, fetcher), /Invalid game data/);
  }
  const { fetcher } = mockFetch();
  assert.equal((await loadGameData(base, '2.220', null, undefined, fetcher)).migrated, true);
});

test('aborted loads do not resolve stale data', async () => {
  const { fetcher } = mockFetch();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(loadGameData(base, '2.220', null, controller.signal, fetcher), { name: 'AbortError' });
});
