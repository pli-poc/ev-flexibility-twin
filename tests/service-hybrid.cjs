const {test}=require('node:test');const assert=require('node:assert/strict');
const {loadFrozenModel}=require('../scripts/benchmark-uncertainty.cjs');
const {serviceRun,serviceDispatch,noEvCost,validateServiceSettings}=require('../.test-build/service-hybrid');
const {specialistRun,specialistControls}=require('../.test-build/specialist-controller');
const {specialistScenario,specialistConditions}=require('../.test-build/specialist-scenario');
const {simulate}=require('../.test-build/engine');const {retail}=require('../.test-build/optimizer');
const settings={quantile:.5,baselineMargin:0,headroomWeight:1,mode:'completion'};
test('unlearned zero-margin slack controller preserves existing EMS allocation',()=>{
 const m=loadFrozenModel();for(const condition of specialistConditions){const c=specialistScenario(120,13579,condition),a=serviceRun(c,m,{...settings,headroomWeight:0,mode:'slack'},false),b=specialistRun(c,m,'ems');
  for(const key of ['cost','shortfall','delivered'])assert.ok(Math.abs(a.final[key]-b.final[key])<1e-7);
  for(const key of ['ready','departed','violations'])assert.equal(a.final[key],b.final[key]);
  for(let t=0;t<1440;t++)for(const state of a.frames[t].cars)assert.ok(Math.abs(state.power-b.frames[t].cars[state.id].power)<1e-7);
 }
});
test('service controller excludes unused networks and hidden future observations',()=>{
 const m=structuredClone(loadFrozenModel());for(const id of ['arrivals','energy'])Object.defineProperty(m.models[id],'network',{get(){throw Error(`Unexpected ${id} inference`);}});
 const c=specialistScenario(120,13579),r=serviceRun(c,m,settings);assert.equal(r.final.violations,0);
 const frame=r.frames[600],available=frame.cars.filter(s=>s.bay>=0&&!['Expected','Departed','Arriving','Ready','Fault'].includes(s.status));
 const vehicles=c.public.declared.map(v=>({...v,need:c.actual[v.id].need}));const ctx={time:600,available,vehicles,budget:30,building:frame.building,solar:frame.solar,batteryPower:0,batteryKwh:50,limit:c.config.grid,price:frame.price,config:c.config,outdoor:frame.outdoor,irradiance:frame.irradiance};
 const altered=structuredClone(c);altered.actual.forEach(v=>{v.departure=1;v.arrival=1;v.need=999;});altered.building.fill(999);altered.solar.fill(999);
 assert.deepEqual(serviceDispatch(c.public,m,settings)(ctx),serviceDispatch(altered.public,m,settings)(ctx));
 const ids=new Set(available.map(s=>s.id));assert.deepEqual(serviceDispatch(c.public,m,settings)(ctx),serviceDispatch(c.public,m,settings)({...ctx,vehicles:vehicles.map(v=>ids.has(v.id)?v:{...v,need:999,departure:1,arrival:1})}));
});
test('completion allocation enforces shared physics and local fallback on every condition',()=>{
 const m=loadFrozenModel();for(const condition of specialistConditions)for(const fairShare of [0,.25,.5,.75]){const c=specialistScenario(120,13579,condition),r=serviceRun(c,m,{...settings,fairShare});
  assert.equal(r.final.violations,0);assert.deepEqual(r.vehicles,c.actual);
  for(const f of r.frames)for(const s of f.cars){const v=c.actual[s.id];assert.ok(s.power>=0&&s.power<=v.maxKw+1e-7&&s.delivered<=v.need+1e-7);
   if(f.time<v.arrival||f.time>=v.departure||s.status==='Fault')assert.equal(s.power,0);
   if(s.power>0&&s.power<1.4)assert.ok(Math.abs(s.delivered-v.need)<1e-7);
  }
  if(condition==='offline'||condition==='stale')assert.ok(r.events.some(e=>e.text.includes(condition==='offline'?'Remote EMS offline':'Telemetry stale')));
 }
});
test('selected departure-only controller never calls another specialist',()=>{
 const m=structuredClone(loadFrozenModel());for(const id of ['arrivals','energy','headroom'])Object.defineProperty(m.models[id],'network',{get(){throw Error(`Unexpected ${id} inference`);}});
 const r=serviceRun(specialistScenario(35,12203),m,{...settings,headroomWeight:0,fairShare:.25});assert.equal(r.final.violations,0);
});
test('same-weather no-EV accounting matches a physically paused counterfactual',()=>{
 const c=specialistScenario(120,13579,'offline');const r=simulate(c.config,{...specialistControls(c),price:t=>retail('nl',t),exportPrice:.07,powerTransform:()=>Object.fromEntries(c.actual.map(v=>[v.id,{power:0,reason:'Counterfactual pause'}]))});
 assert.equal(r.final.delivered,0);assert.ok(Math.abs(noEvCost(c)-r.final.cost)<1e-7);
});
test('unsupported service settings are rejected and model weights remain frozen',()=>{
 const m=loadFrozenModel(),before=JSON.stringify(m);for(const change of [{quantile:2},{headroomWeight:-1},{mode:'magic'},{baselineMargin:999},{fairShare:2}])assert.throws(()=>validateServiceSettings({...settings,...change}));
 serviceRun(specialistScenario(120,13579),m,settings);assert.equal(JSON.stringify(m),before);
});
