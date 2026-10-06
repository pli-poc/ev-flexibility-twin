const {test}=require('node:test');const assert=require('node:assert/strict');
const {protocol,arms,checkProtocol,rank,paired,acceptance,loadSelection,summariseEvidence}=require('../scripts/benchmark-service.cjs');
const {loadFrozenModel}=require('../scripts/benchmark-uncertainty.cjs');
function values(ready=120,unmet=5,unitCost=.2){return {ready,unmet,readyRate:ready/200,unitCost,violations:0};}
test('frozen service experiment covers all weekdays and isolates new test seeds and dates',()=>{
 checkProtocol(loadFrozenModel());assert.equal(new Set(protocol.testDays.map(day=>day%7)).size,7);
 assert.equal(protocol.testDays.length*protocol.testSeeds.length*protocol.conditions.length,1120);
 const selected=loadSelection();assert.equal(selected.validationQualified,true);assert.ok(arms.includes(selected.fixed.policy));
 assert.ok(selected.learned.readyRate-selected.fixed.readyRate>=protocol.acceptance.minimumReadyRateGain);
 assert.ok(selected.learned.unmet<selected.fixed.unmet);
});
test('selection ranks actual completed service before unmet energy and raw bill',()=>{
 assert.ok(rank({...values(130,20),chargingCost:30},{...values(120,5),chargingCost:20})<0);
 assert.ok(rank({...values(120,5),chargingCost:30},{...values(120,20),chargingCost:20})<0);
 assert.ok(rank({...values(130,5),chargingCost:30,violations:1},{...values(120,20),chargingCost:20})>0);
});
test('overall admission rejects energy-only gains, expensive unit cost, unsafe commands and condition regressions',()=>{
 const base={policy:'balanced',...values(120,10)},ai={policy:'hybrid-ai',...values(130,5)};
 const ci={ready:{low:.1},unmet:{low:.1}},slices=[{totals:[base,ai]}];
 assert.equal(acceptance([base,ai],slices,ci,'balanced').accepted,true);
 for(const change of [{ready:119,readyRate:119/200},{unitCost:.3},{violations:1},{unmet:11}])assert.equal(acceptance([base,{...ai,...change}],slices,ci,'balanced').accepted,false);
 assert.equal(acceptance([base,ai],[{totals:[base,{...ai,ready:119}]}],ci,'balanced').accepted,false);
 assert.equal(acceptance([base,ai],slices,{...ci,ready:{low:-.1}},'balanced').accepted,false);
});
test('service evidence uncertainty groups repeated scenarios by seed and preserves gain direction',()=>{
 const rows=[1,2,3].flatMap(seed=>Array.from({length:3},()=>({seed,runs:[{policy:'balanced',ready:5,unmet:10},{policy:'hybrid-ai',ready:5+seed,unmet:10-seed}]})));
 const a=paired(rows,'balanced'),b=paired(rows,'balanced','hybrid-ai','unmet');assert.equal(a.clusters,3);assert.equal(a.meanAdvantage,2);assert.deepEqual({...a,metric:'unmet'},b);assert.ok(a.low>0);
});
test('final refinement keeps its own unseen matrix and publishes an exact evidence summary',()=>{
 const next=require('../experiments/service-balanced.json'),evidence=require('../public/models/service-balanced-evidence.json'),summary=require('../public/models/service-proof.json');
 assert.equal(new Set(next.testDays.map(day=>day%7)).size,7);
 assert.equal(next.testDays.length*next.testSeeds.length*next.conditions.length,1120);
 for(const seed of next.testSeeds)assert.ok(!protocol.testSeeds.includes(seed)&&!next.validationSeeds.includes(seed));
 for(const day of next.testDays)assert.ok(!protocol.testDays.includes(day)&&!next.validationDays.includes(day));
 assert.deepEqual(summary,summariseEvidence(evidence,'service-balanced-evidence.json'));
 // A failed overall gate must remain visible even when a causal ablation passes.
 assert.equal(summary.acceptance.accepted,false);
 assert.equal(summary.acceptance.gates.find(g=>g.reference==='hybrid-ablated').accepted,true);
});
