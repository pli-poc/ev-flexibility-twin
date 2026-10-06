const {test} = require('node:test');
const assert = require('node:assert/strict');
const {loadFrozenModel, uncertaintyRun, uncertaintyBenchmark, clusterInterval, modelHash, arms} = require('../scripts/benchmark-uncertainty.cjs');
const {specialistScenario} = require('../.test-build/specialist-scenario');
const {specialistRun} = require('../.test-build/specialist-controller');

test('two-specialist experiment disables arrival and energy networks entirely', () => {
  const model = structuredClone(loadFrozenModel());
  for (const id of ['arrivals', 'energy']) Object.defineProperty(model.models[id], 'network', {get() {throw Error(`Unexpected ${id} inference`);}});
  const c = specialistScenario(155, 6101);
  for (const arm of ['none', 'departure', 'headroom', 'both']) assert.equal(uncertaintyRun(c, model, arm).final.violations, 0);
});
test('no-learning and fixed-EMS arms exactly reproduce the existing comparators', () => {
  const model = loadFrozenModel(), c = specialistScenario(85, 11827);
  assert.deepEqual(uncertaintyRun(c, model, 'none'), specialistRun(c, model, 'planner'));
  assert.deepEqual(uncertaintyRun(c, model, 'ems'), specialistRun(c, model, 'ems'));
  assert.deepEqual(uncertaintyRun(c, model, 'full'), specialistRun(c, model, 'full'));
});
test('factorial arms share actual events, enforce physical limits and retain local fallback', () => {
  const model = loadFrozenModel();
  for (const condition of ['normal', 'tight', 'fault', 'offline', 'stale']) {
    const c = specialistScenario(155, 6101, condition), baseline = uncertaintyRun(c, model, 'ems');
    for (const arm of ['none', 'departure', 'headroom', 'both']) {
      const result = uncertaintyRun(c, model, arm);
      assert.deepEqual(result.vehicles, baseline.vehicles);assert.equal(result.final.violations, 0);
      for (const f of result.frames) {
        assert.equal(f.building, baseline.frames[f.time].building);
        assert.ok(Math.abs(f.solar + f.curtailed - baseline.frames[f.time].solar - baseline.frames[f.time].curtailed) < 1e-7);
        for (const state of f.cars) {
          const v = c.actual[state.id];
          assert.ok(state.power >= 0 && state.power <= v.maxKw + 1e-7 && state.delivered <= v.need + 1e-7);
          if (f.time < v.arrival || f.time >= v.departure || state.status === 'Fault') assert.equal(state.power, 0);
          if (state.power > 0 && state.power < 1.4) assert.ok(Math.abs(state.delivered - v.need) < 1e-7);
        }
      }
      if (condition === 'offline' || condition === 'stale') {
        const from = condition === 'offline' ? 600 : 660, to = condition === 'offline' ? 720 : 690;
        assert.ok(result.frames.slice(from, to).some(f => f.cars.some(state => state.power > 0 && state.reason === 'Fair share of current site headroom')));
        assert.ok(result.events.some(event => event.text.includes(condition === 'offline' ? 'Remote EMS offline' : 'Telemetry stale')));
      }
    }
  }
});
test('small factorial benchmark freezes the model and rejects leaking or duplicate seeds', () => {
  const model = loadFrozenModel(), before = modelHash(model);
  for (const seeds of [[model.trainingSeed], [model.validationSeed], [6101, 6101]]) assert.throws(() => uncertaintyBenchmark(model, {seeds, days: [85], conditions: ['normal']}));
  assert.throws(() => uncertaintyRun(specialistScenario(85, 6101), model, 'unknown'));
  const evidence = uncertaintyBenchmark(model, {seeds: [6101, 11827], days: [85], conditions: ['normal']});
  assert.equal(modelHash(model), before);assert.equal(evidence.scenarios, 2);assert.equal(evidence.visits, 36);
  for (const row of evidence.rows) assert.deepEqual(row.runs.map(run => run.arm), arms);
});
test('bootstrap resamples whole seeds and uses the correct direction for completion', () => {
  const rows = [1, 2, 3].flatMap(seed => Array.from({length: 5}, (_, day) => ({seed, day, runs: [{arm: 'none', score: seed + 1, ready: 2}, {arm: 'both', score: 1, ready: seed + 2}]})));
  const score = clusterInterval(rows, 'none'), ready = clusterInterval(rows, 'none', 'both', 'ready', false);
  assert.equal(score.clusters, 3);assert.equal(score.meanAdvantage, 2);assert.ok(score.low > 0);
  assert.equal(ready.meanAdvantage, score.meanAdvantage);assert.equal(ready.low, score.low);assert.equal(ready.high, score.high);
});
