// Compile the existing specialist controller, then run this frozen two-model experiment.
// node scripts/benchmark-uncertainty.cjs [--verify]
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const {Worker, isMainThread, parentPort, workerData} = require('node:worker_threads');
const {simulate} = require('../.test-build/engine');
const {retail, EXPORT_PRICE} = require('../.test-build/optimizer');
const {specialistDispatch, specialistControls, specialistRun, specialistObjective} = require('../.test-build/specialist-controller');
const {specialistScenario, specialistConditions} = require('../.test-build/specialist-scenario');
const {specialistIds, isSpecialistBundle, specialistAccuracy} = require('../.test-build/specialists');
const {randomFor, quantile} = require('../.test-build/neural');
const root = path.resolve(__dirname, '..');
const protocol = require('../experiments/uncertainty-only.json');
const arms = ['none', 'departure', 'headroom', 'both', 'ems', 'full'];
const labels = {
  none: 'Common planner without learned forecasts',
  departure: 'Common planner + departure only',
  headroom: 'Common planner + building/solar only',
  both: 'Common planner + departure and building/solar',
  ems: 'Deadline-aware EMS reference',
  full: 'Four-specialist controller reference'
};
const enabled = {none: [], departure: ['departure'], headroom: ['headroom'], both: ['departure', 'headroom']};
const modelHash = model => crypto.createHash('sha256').update(JSON.stringify(model)).digest('hex');

function loadFrozenModel() {
  const reference = JSON.parse(fs.readFileSync(path.join(root, protocol.modelPath), 'utf8'));
  const model = reference.model;
  if (!isSpecialistBundle(model) || modelHash(model) !== protocol.modelSha256) throw Error('The frozen reference model has changed. Create a new protocol before evaluating another model.');
  if (JSON.stringify(model.settings) !== JSON.stringify(protocol.settings)) throw Error('Frozen controller settings do not match the protocol.');
  if (protocol.seeds.some(seed => [model.trainingSeed, model.validationSeed, ...reference.benchmark.seeds].includes(seed))) throw Error('Fresh evaluation seeds overlap previous training, validation or benchmark seeds.');
  return model;
}

function uncertaintyRun(c, model, arm) {
  if (arm === 'ems' || arm === 'full') return specialistRun(c, model, arm);
  if (!enabled[arm]) throw Error('Unknown uncertainty experiment arm.');
  const disabled = specialistIds.filter(id => !enabled[arm].includes(id));
  return simulate({...c.config, policy: 'ems'}, {
    ...specialistControls(c), price: t => retail('nl', t), exportPrice: EXPORT_PRICE,
    dispatch: specialistDispatch(c.public, model, disabled)
  });
}

function metrics(result, arm) {
  const f = result.final;
  return {arm, cost: f.cost, unmet: f.shortfall, ready: f.ready, departed: f.departed,
    delivered: f.delivered, importKwh: f.importKwh, exportKwh: f.exportKwh,
    violations: f.violations, excessKwh: f.excess, score: specialistObjective(result)};
}
const metricKeys = ['cost', 'unmet', 'ready', 'departed', 'delivered', 'importKwh', 'exportKwh', 'violations', 'excessKwh', 'score'];
function sumRows(rows) {
  return arms.map(arm => ({arm, ...Object.fromEntries(metricKeys.map(key => [key,
    rows.reduce((sum, row) => sum + row.runs.find(run => run.arm === arm)[key], 0)]))}));
}

// Resample whole seeds so their dates, conditions and paired arms stay together.
function clusterInterval(rows, comparator, target = 'both', metric = 'score', lowerIsBetter = true) {
  if (!rows.length || !arms.includes(comparator) || !arms.includes(target) || !metricKeys.includes(metric)) throw Error('Invalid paired comparison.');
  const seeds = [...new Set(rows.map(row => row.seed))];
  const deltas = rows.map(row => {
    const a = row.runs.find(run => run.arm === comparator)[metric];
    const b = row.runs.find(run => run.arm === target)[metric];
    return (a - b) * (lowerIsBetter ? 1 : -1);
  });
  const groups = seeds.map(seed => {
    const indexes = rows.flatMap((row, i) => row.seed === seed ? [i] : []);
    return {sum: indexes.reduce((sum, i) => sum + deltas[i], 0), count: indexes.length};
  });
  const rng = randomFor(protocol.bootstrap.seed);
  const means = Array.from({length: protocol.bootstrap.resamples}, () => {
    let total = 0, count = 0;
    for (let i = 0; i < groups.length; i++) {const group = groups[Math.floor(rng() * groups.length)]; total += group.sum; count += group.count;}
    return total / count;
  });
  return {metric, comparator, target, meanAdvantage: deltas.reduce((sum, value) => sum + value, 0) / deltas.length,
    low: quantile(means, .025), high: quantile(means, .975), clusters: seeds.length,
    wins: deltas.filter(value => value > 1e-7).length,
    losses: deltas.filter(value => value < -1e-7).length,
    ties: deltas.filter(value => Math.abs(value) <= 1e-7).length};
}

function uncertaintyBenchmark(model, settings = protocol, progress = () => {}) {
  const {seeds, days, conditions} = settings;
  if (!Array.isArray(seeds) || !seeds.length || new Set(seeds).size !== seeds.length || seeds.some(seed => !Number.isInteger(seed) || seed < 0 || seed > 100000 || [model.trainingSeed, model.validationSeed].includes(seed))) throw Error('Evaluation seeds must be unique and independent of training and validation.');
  if (!Array.isArray(days) || !days.length || new Set(days).size !== days.length || days.some(day => !Number.isInteger(day) || day < 0 || day > 364)) throw Error('Invalid calendar days.');
  if (!Array.isArray(conditions) || !conditions.length || new Set(conditions).size !== conditions.length || conditions.some(condition => !specialistConditions.includes(condition))) throw Error('Invalid conditions.');
  const before = modelHash(model), cases = [], rows = [];
  for (const seed of seeds) for (const day of days) for (const condition of conditions) {
    const c = specialistScenario(day, seed, condition);cases.push(c);
    rows.push({seed, day, condition, config: c.config, runs: arms.map(arm => metrics(uncertaintyRun(c, model, arm), arm))});
    progress(rows.length, seeds.length * days.length * conditions.length);
  }
  if (modelHash(model) !== before) throw Error('Evaluation mutated the frozen model.');
  return assembleEvidence(model, settings, rows, cases);
}

function assembleEvidence(model, settings, rows, cases = rows.map(row => specialistScenario(row.day, row.seed, row.condition))) {
  const compare = (comparator, target = 'both') => ({
    score: clusterInterval(rows, comparator, target),
    unmet: clusterInterval(rows, comparator, target, 'unmet'),
    ready: clusterInterval(rows, comparator, target, 'ready', false),
    cost: clusterInterval(rows, comparator, target, 'cost')
  });
  return {schema: 'ev-uncertainty-evidence/1', fixture: model.fixture, modelSha256: modelHash(model),
    protocol: settings, labels, scenarios: rows.length, visits: rows.reduce((sum, row) => sum + row.runs[0].departed, 0),
    rows, totals: sumRows(rows),
    slices: settings.conditions.map(condition => ({condition, scenarios: rows.filter(row => row.condition === condition).length, totals: sumRows(rows.filter(row => row.condition === condition))})),
    accuracy: specialistAccuracy(model, cases),
    comparisons: {noLearning: compare('none'), departureOnly: compare('headroom'), headroomOnly: compare('departure'), fixedEms: compare('ems'), fullSystem: compare('full')},
    uncertainty: '95% percentile intervals from 5,000 paired bootstrap resamples of whole seeds; ten synthetic seed clusters in the frozen experiment. The fixture has learnable synthetic hints. No real-world or equivalent-service cost claim.'};
}

module.exports = {arms, labels, enabled, protocol, modelHash, loadFrozenModel, uncertaintyRun, uncertaintyBenchmark, clusterInterval};
if (!isMainThread && workerData?.uncertaintyWorker) {
  const model = loadFrozenModel();
  const part = uncertaintyBenchmark(model, {...protocol, seeds: workerData.seeds}, () => parentPort.postMessage({progress: 1}));
  parentPort.postMessage({rows: part.rows});
} else if (require.main === module) (async () => {
  const target = path.join(root, 'public/models/uncertainty-evidence.json');
  const model = loadFrozenModel();
  const workerCount = Math.min(4, os.availableParallelism(), protocol.seeds.length);
  const size = Math.ceil(protocol.seeds.length / workerCount), total = protocol.seeds.length * protocol.days.length * protocol.conditions.length;
  let done = 0;
  const chunks = Array.from({length: Math.ceil(protocol.seeds.length / size)}, (_, i) => protocol.seeds.slice(i * size, (i + 1) * size));
  const parts = await Promise.all(chunks.map(seeds => new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {workerData: {uncertaintyWorker: true, seeds}});
    let rows;
    worker.on('message', message => {
      if (message.progress) {done++;if (done % 25 === 0) console.log(`Frozen two-specialist experiment: ${done}/${total} scenarios`);}
      if (message.rows) rows = message.rows;
    });
    worker.on('error', reject);
    worker.on('exit', code => code === 0 && rows ? resolve(rows) : reject(Error(`Experiment worker failed with exit code ${code}.`)));
  })));
  // Contiguous seed chunks and ordered Promise.all preserve sequential summation order.
  const evidence = assembleEvidence(model, protocol, parts.flat());
  const serialized = JSON.stringify(evidence);
  if (process.argv.includes('--verify')) {
    if (fs.readFileSync(target, 'utf8') !== serialized) throw Error('Saved uncertainty evidence is not reproducible.');
    console.log('Saved evidence reproduced exactly.');
  } else fs.writeFileSync(target, serialized);
  console.table(evidence.totals.map(run => ({arm: run.arm, cost: run.cost.toFixed(2), unmet: run.unmet.toFixed(2), ready: run.ready, visits: run.departed, violations: run.violations, score: run.score.toFixed(2)})));
  console.log(JSON.stringify(evidence.comparisons, null, 2));
})().catch(error => {console.error(error);process.exitCode = 1;});
