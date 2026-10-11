import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { calculateBuildable, calculateConsumption, getUnitDetails } from '../src/logic/combination.ts';
import { getDashboardDetails } from '../src/logic/dashboardDetails.ts';
import { getRecipeIndex } from '../src/logic/recipeIndex.ts';
import { createUnitOverlayStore } from '../src/logic/unitOverlays.ts';

const data = JSON.parse(await readFile(new URL('../public/data/2.323.json', import.meta.url), 'utf8'));
const makeUnits = () => new Map(data.units.map((unit) => [unit.id, unit]));

test('incremental statuses match fresh calculations after inventory, bans, Wisp, and interrupted snapshots', () => {
  const units = makeUnits();
  let inventory = {};
  let bans = new Set();
  let seed = 323;
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
  const snapshots = [];
  for (let step = 0; step < 40; step++) {
    const id = step % 4 === 0 ? 'common_wisp' : data.units[Math.floor(random() * data.units.length)].id;
    inventory = { ...inventory, [id]: Math.floor(random() * 12) };
    if (step % 5 === 0) {
      bans = new Set(bans);
      if (bans.has(id)) bans.delete(id);
      else bans.add(id);
    }
    const details = getDashboardDetails(units, inventory, bans);
    for (const unit of data.units) {
      assert.deepEqual(details.get(unit.id), getUnitDetails(unit.id, units, inventory, bans), unit.id);
    }
    assert.equal(getDashboardDetails(units, inventory, bans), details);
    snapshots.push({ inventory, bans, details });
  }
  // React may abandon/retry a deferred render with an earlier immutable snapshot.
  for (const previous of snapshots.reverse()) {
    assert.deepEqual(getDashboardDetails(units, previous.inventory, previous.bans), previous.details);
  }
  const enabled = getDashboardDetails(units, { common_wisp: 10 }, new Set());
  const disabled = getDashboardDetails(units, { common_wisp: 0 }, new Set());
  assert.equal(enabled.get('uncommon_robin').status, 'orange');
  assert.equal(disabled.get('uncommon_robin').status, 'red');
});

test('unaffected or unchanged rows retain result identity, with separate caches per dataset', () => {
  const units = makeUnits();
  const bans = new Set();
  const first = getDashboardDetails(units, {}, bans);
  const next = getDashboardDetails(units, { rare_hawkins: 1 }, bans);
  assert.equal(next.get('uncommon_robin'), first.get('uncommon_robin'));
  const equivalent = getDashboardDetails(units, { rare_hawkins: 1, unused_custom_id: 12 }, new Set());
  for (const [id, value] of next) assert.equal(equivalent.get(id), value);
  const customUnits = new Map([['uncommon_robin', {
    id: 'uncommon_robin', name: 'Custom', rarity: 'Common', image: '',
  }]]);
  assert.equal(getDashboardDetails(customUnits, { common_wisp: 1 }, bans).get('uncommon_robin').buildableCount, 1);
  assert.equal(getDashboardDetails(units, { common_wisp: 1 }, bans).get('uncommon_robin').buildableCount, 0);
});

test('indexed Used In and Top Tier preserve source order and existing Wisp behavior', () => {
  const units = makeUnits();
  const index = getRecipeIndex(units);
  assert.equal(getRecipeIndex(units), index);
  const topRarities = new Set(['Transcendence', 'Limited', 'Immortal', 'Eternal', 'Mystic']);
  const contains = (target, id) => target.recipe?.some((req) => req.unitId === id || contains(units.get(req.unitId), id));
  for (const unit of data.units) {
    const direct = data.units.filter((target) => target.recipe?.some((req) => req.unitId === unit.id));
    if (unit.id === 'common_wisp') direct.push(...data.units.filter((target) => target.rarity === 'Common' && target.id !== unit.id));
    assert.deepEqual(index.usedIn.get(unit.id) || [], direct);
    assert.deepEqual(index.topTier.get(unit.id) || [], data.units.filter((target) => topRarities.has(target.rarity) && contains(target, unit.id)));
  }
});

test('one-pass build counts honor shared ingredients, rollback, bans, Wisp, and the existing cap', () => {
  const units = makeUnits();
  const scenarios = [
    {}, { common_wisp: 19 }, { common_luffy: 100, common_zoro: 100, common_wisp: 100 },
    Object.fromEntries(data.units.filter((unit) => unit.rarity === 'Common').map((unit) => [unit.id, 100])),
    { uncommon_robin: 5, special_nami: 4, common_wisp: 7, rare_hawkins: 3 },
  ];
  for (const inventory of scenarios) for (const bans of [new Set(), new Set(['uncommon_robin', 'special_nami'])]) {
    for (const unit of data.units) {
      const count = calculateBuildable(unit.id, units, inventory, bans);
      assert.ok(count >= 0 && count <= 100);
      if (count > 0) assert.notEqual(calculateConsumption(unit.id, units, inventory, bans, count, true), null, unit.id);
      if (count < 100) assert.equal(calculateConsumption(unit.id, units, inventory, bans, count + 1, true), null, unit.id);
    }
  }
  const shared = new Map([
    ['a', { id: 'a', rarity: 'Common' }], ['common_wisp', { id: 'common_wisp', rarity: 'Common' }],
    ['b', { id: 'b', rarity: 'Special', recipe: [{ unitId: 'a', count: 2 }] }],
    ['c', { id: 'c', rarity: 'Rare', recipe: [{ unitId: 'b', count: 1 }, { unitId: 'a', count: 1 }] }],
  ]);
  assert.deepEqual(calculateConsumption('c', shared, { a: 2, common_wisp: 1 }, new Set(), 1, true), { a: 2, common_wisp: 1 });
  assert.equal(calculateBuildable('c', shared, { a: 5, common_wisp: 1 }, new Set()), 2);
});

test('legacy Custom craftable Common recipes retain bulk Wisp fallback behavior', () => {
  const units = new Map([
    ['common_wisp', { id: 'common_wisp', rarity: 'Common' }],
    ['base', { id: 'base', rarity: 'Rare' }],
    ['common', { id: 'common', rarity: 'Common', recipe: [{ unitId: 'common_wisp', count: 6 }] }],
    ['material', { id: 'material', rarity: 'Rare', recipe: [{ unitId: 'common', count: 3 }, { unitId: 'base', count: 2 }] }],
    ['target', { id: 'target', rarity: 'Common', recipe: [{ unitId: 'material', count: 1 }] }],
  ]);
  const inventory = { common_wisp: 6, common: 1, base: 22, material: 8 };
  assert.equal(calculateBuildable('target', units, inventory, new Set()), 14);
  assert.deepEqual(calculateConsumption('target', units, inventory, new Set(), 14, true), { material: 8, common_wisp: 6 });
  assert.equal(calculateConsumption('target', units, inventory, new Set(), 15, true), null);
  assert.ok(getRecipeIndex(units).batchCraftTargets.has('target'));
});

test('hover controller keeps tooltip handoff alive and cancels pending dismissal when opening a recipe', async () => {
  const store = createUnitOverlayStore();
  let updates = 0;
  const unsubscribe = store.subscribe(() => updates++);
  const anchor = {};
  store.hover('a', anchor);
  const first = store.getSnapshot();
  store.hover(null);
  store.hover('a');
  await new Promise((resolve) => setTimeout(resolve, 170));
  assert.equal(store.getSnapshot(), first);
  assert.equal(updates, 1);
  store.hover(null);
  store.showRecipe('b');
  await new Promise((resolve) => setTimeout(resolve, 170));
  assert.deepEqual(store.getSnapshot(), { hovered: null, recipeUnitId: 'b' });
  store.hover('a', anchor);
  assert.equal(store.getSnapshot().hovered, null);
  store.closeRecipe();
  store.hover('a', anchor);
  store.clear();
  assert.deepEqual(store.getSnapshot(), { hovered: null, recipeUnitId: null });
  unsubscribe();
});

test('Shift synchronization replaces stale hover and cancels delayed dismissal', async () => {
  const store = createUnitOverlayStore();
  const unsubscribe = store.subscribe(() => {});
  const a = { dataset: { unitId: 'a' }, isConnected: true };
  const b = { dataset: { unitId: 'b' }, isConnected: true };
  store.hover('a', a);
  store.hover(null);
  store.synchronizeHover(b);
  assert.deepEqual(store.getSnapshot().hovered, { unitId: 'b', anchor: b });
  await new Promise((resolve) => setTimeout(resolve, 170));
  assert.equal(store.getSnapshot().hovered.anchor, b);
  store.synchronizeHover(null, 'b');
  assert.equal(store.getSnapshot().hovered.anchor, b);
  store.synchronizeHover(null, 'a');
  assert.equal(store.getSnapshot().hovered, null);
  store.hover('a', a);
  const replacement = { dataset: { unitId: 'a' }, isConnected: true };
  store.hover('a', replacement);
  assert.equal(store.getSnapshot().hovered.anchor, replacement);
  replacement.isConnected = false;
  store.synchronizeHover(null, 'a');
  assert.equal(store.getSnapshot().hovered, null);
  store.showRecipe('a');
  store.synchronizeHover(b);
  assert.equal(store.getSnapshot().recipeUnitId, 'a');
  assert.equal(store.getSnapshot().hovered, null);
  unsubscribe();
});
