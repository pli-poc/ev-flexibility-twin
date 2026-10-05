const test=require('node:test');const assert=require('node:assert/strict');
const {defaults,simulate}=require('../.test-build/engine');
const {optimizerDefaults,simulateOptimized,retail}=require('../.test-build/optimizer');
const {compareStrategies,measure,comparisonCsv,exportComparison,parseScenario}=require('../.test-build/comparison');
const near=(a,b,msg)=>assert.ok(Math.abs(a-b)<1e-6,`${msg}: ${a} vs ${b}`);
const base={...defaults,preset:'article'};
const shared=compareStrategies(base,optimizerDefaults);
test('all six labels identify independent strategies; reference is never substituted',()=>{
 assert.deepEqual(shared.runs.map(r=>r.id),['immediate','balanced','ems','cheap','peak','total']);
 assert.equal(new Set(shared.runs.map(r=>r.result)).size,6);
 const direct=simulate({...base,policy:'balanced'},{price:t=>retail('nl',t)});
 assert.deepEqual(shared.runs[1].result,direct);
 for(const r of shared.runs.slice(3))assert.equal(r.result.optimizer.policy,r.id);
});
test('identical tariff, fleet, building, solar potential and limits across strategies',()=>{
 for(const r of shared.runs){
  assert.deepEqual(r.result.vehicles,shared.runs[1].result.vehicles);
  for(const f of r.result.frames){const ref=shared.runs[1].result.frames[f.time];
   near(f.price,ref.price,'price');near(f.building,ref.building,'building');near(f.solar+f.curtailed,ref.solar+ref.curtailed,'solar');near(f.limit,ref.limit,'limit');}
 }
});
test('same assumptions produce the same results regardless of selected classic or advanced strategy',()=>{
 const other=compareStrategies({...base,policy:'immediate'},{...optimizerDefaults,policy:'cheap'});
 assert.equal(shared.fingerprint,other.fingerprint);
 assert.deepEqual(shared.runs.map(r=>r.metrics),other.runs.map(r=>r.metrics));
});
test('reference cost is measured from common tariff, export credit, and physical energy',()=>{
 for(const r of shared.runs){const m=r.metrics;near(m.energyCost,m.importCost-m.exportCredit,'net cost');near(m.energyCost,r.result.final.cost,'cost');near(m.deliveredKwh+m.shortfallKwh,m.requestedKwh,'delivered+shortfall');assert.ok(m.quarterPeakKw<=m.minutePeakKw+1e-6);assert.equal(m.incrementalMonthlyPeakCharge,null);}
});
test('one-minute power integrates to delivered energy; no charger exceeds vehicle limit',()=>{
 for(const r of shared.runs)for(const v of r.result.vehicles){let delivered=0;for(const f of r.result.frames){const s=f.cars[v.id];assert.ok(s.power>=0&&s.power<=v.maxKw+1e-8);if(f.time<v.arrival||f.time>=v.departure)near(s.power,0,'no power while absent');delivered+=s.power*.9/60;near(s.delivered,delivered,'energy');}assert.ok(delivered<=v.need+1e-6);}
});
test('unsafe uncontrolled baseline cannot be reported as equivalent-service savings',()=>{assert.ok(shared.runs[0].metrics.violationMinutes>0);assert.equal(shared.runs[0].equivalentService,false);for(const r of shared.runs.slice(1)){assert.equal(r.metrics.violationMinutes,0);assert.equal(r.metrics.ready,20);}});
test('quarter-hour peak is an average, not a one-minute maximum; monthly estimate stays separate',()=>{
 const result=structuredClone(shared.runs[1].result);for(const f of result.frames)f.grid=0;result.frames[0].grid=150;
 const opt={...optimizerDefaults,existingMonthlyPeakKw:8,capacityRateEurPerKwMonth:4};const m=measure(result,opt);near(m.quarterPeakKw,10,'quarter peak');near(m.incrementalMonthlyPeakCharge,8,'monthly delta');near(m.energyCost,150*result.frames[0].price/60,'daily energy only');
});
test('all four market profiles apply identically to classic and advanced runs',()=>{
 for(const market of ['nl','flanders','wallonia','brussels']){const c=compareStrategies(base,{...optimizerDefaults,market});for(const r of c.runs)for(const t of [0,419,420,659,660,1019,1020,1319,1320,1439])near(r.result.frames[t].price,retail(market,t),'shared tariff');}
});
test('weather drivers vary over the day and the cloud scenario changes irradiance and PV output',()=>{
 const standard=simulate({...defaults,preset:'office'}),cold=simulate({...defaults,preset:'cold'}),cloud=simulate({...defaults,preset:'cloud'});
 assert.notEqual(standard.frames[360].outdoor,standard.frames[780].outdoor);
 assert.equal(standard.frames[360].irradiance,0);assert.ok(standard.frames[780].irradiance>900);
 assert.ok(cold.frames[780].outdoor<standard.frames[780].outdoor);
 near(cloud.frames[780].irradiance,standard.frames[780].irradiance*.2,'cloud irradiance');
 near(cloud.frames[780].solar,defaults.solar*.2*.88,'cloud PV output');assert.ok(cloud.frames[780].solar<standard.frames[780].solar);
 near(cloud.frames[900].irradiance,standard.frames[900].irradiance,'cloud scenario end');
});
test('battery, faults, queues, offline control and restricted import limits are shared',()=>{
 for(const preset of ['office','cloud','cold','fleet','capacity','fault','offline','sleep','impossible']){
  const config={...defaults,preset,chargers:preset==='office'?4:20,battery:true};const c=compareStrategies(config,optimizerDefaults);
  for(const r of c.runs){
   assert.equal(r.result.config.battery,true);assert.ok(r.result.frames.some(f=>Math.abs(f.batteryPower)>.01));
   for(const f of r.result.frames){
    near(f.grid,f.building+f.ev-f.solar-f.batteryPower,'power balance');assert.ok(f.batteryKwh>=50-1e-6&&f.batteryKwh<=90+1e-6);assert.ok(f.grid>=-40-1e-6);
    const onsite=f.cars.filter(s=>s.bay>=0&&!['Departed','Expected'].includes(s.status));assert.equal(new Set(onsite.map(s=>s.bay)).size,onsite.length);assert.ok(onsite.length<=config.chargers);
    for(const s of f.cars){assert.ok(s.power<=r.result.vehicles[s.id].maxKw+1e-6);if(s.status==='Fault'||s.status==='Sleeping'||s.status==='Queued'||s.status==='Arriving')near(s.power,0,'unavailable');}
    if(preset==='capacity'&&f.time>=540&&f.time<960)assert.equal(f.limit,50);
    // Controllable EVs cannot worsen unavoidable building-only overload in managed modes.
    if(r.id!=='immediate')assert.ok(f.grid<=Math.max(f.limit,f.building-f.solar-f.batteryPower)+1e-6);
   }
   const counted=r.result.frames.filter(f=>f.grid>f.limit+.0001).length;assert.equal(r.metrics.violationMinutes,counted);
   if(preset==='fault')assert.ok(r.result.frames.some(f=>f.cars.some(s=>s.status==='Fault')));
   if(preset==='offline')assert.ok(r.result.events.some(e=>e.text.includes('Remote EMS offline')));
   if(preset==='impossible'){assert.ok(r.metrics.shortfallKwh>0);if(['cheap','peak','total'].includes(r.id))assert.ok(r.result.frames.some(f=>f.cars.some(s=>s.reason.includes('at risk'))));}
  }
 }
});
test('scenario exports include optimizer assumptions; CSV is in EUR with explicit periods',()=>{
 const csv=comparisonCsv(shared);assert.equal(csv.split('\n').length,7);assert.ok(csv.includes('"EUR"'));assert.ok(csv.includes('"peak_15min_kw"'));const out=JSON.parse(exportComparison(shared));assert.equal(out.results.length,6);assert.equal(out.config.seed,42);assert.equal(out.optimizer.market,'nl');assert.equal(out.assumptions.vat,'excluded');
 const custom={...optimizerDefaults,market:'wallonia',policy:'peak',peak:70};const parsed=parseScenario({schemaVersion:2,config:base,optimizer:custom,advanced:true});assert.deepEqual(parsed,{config:base,optimizer:custom,advanced:true});assert.equal(parseScenario({schemaVersion:1,config:base}).advanced,false);
});
test('invalid inputs fail explicitly',()=>{
 assert.throws(()=>compareStrategies({...base,grid:NaN},optimizerDefaults));assert.throws(()=>compareStrategies(base,{...optimizerDefaults,market:'unknown'}));assert.throws(()=>compareStrategies(base,{...optimizerDefaults,peak:-1}));assert.throws(()=>compareStrategies(base,{...optimizerDefaults,capacityRateEurPerKwMonth:Infinity}));assert.throws(()=>parseScenario({schemaVersion:9,config:base}));
});
