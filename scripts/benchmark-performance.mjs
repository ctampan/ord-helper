// Run: node --experimental-strip-types scripts/benchmark-performance.mjs [baseline.ts]
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { stripTypeScriptTypes } from 'node:module';
import { getUnitDetails } from '../src/logic/combination.ts';
import { getDashboardDetails } from '../src/logic/dashboardDetails.ts';

const data = JSON.parse(await readFile(new URL('../public/data/2.323.json', import.meta.url), 'utf8'));
const units = new Map(data.units.map((unit) => [unit.id, unit]));
const bans = new Set();
const calculators = { current: getUnitDetails };
if (process.argv[2]) {
  const source = stripTypeScriptTypes(await readFile(process.argv[2], 'utf8'));
  const baseline = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  calculators.baseline = baseline.getUnitDetails;
}
const median = (samples) => samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)];
for (const amount of [0, 10, 100]) {
  const inventory = Object.fromEntries(data.units.filter((unit) => unit.rarity === 'Common').map((unit) => [unit.id, amount]));
  const result = { commonCountEach: amount, units: units.size };
  for (const [name, calculate] of Object.entries(calculators)) {
    const samples = [];
    for (let iteration = 0; iteration < 13; iteration++) {
      const start = performance.now();
      for (const unit of data.units) calculate(unit.id, units, inventory, bans);
      if (iteration >= 3) samples.push(performance.now() - start);
    }
    result[`${name}MedianMs`] = +median(samples).toFixed(2);
  }
  let state = inventory;
  getDashboardDetails(units, state, bans);
  const samples = [];
  for (let iteration = 0; iteration < 30; iteration++) {
    state = { ...state, rare_hawkins: iteration % 2 };
    const start = performance.now();
    getDashboardDetails(units, state, bans);
    samples.push(performance.now() - start);
  }
  result.incrementalRareChangeMedianMs = +median(samples).toFixed(2);
  console.log(JSON.stringify(result));
}
