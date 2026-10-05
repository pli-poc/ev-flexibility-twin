import {defaults,simulate,vehiclesFor,type Config,type Result,type DispatchContext,type DispatchDecision,type Vehicle} from './engine';
import {retail,EXPORT_PRICE,simulateOptimized,type Market} from './optimizer';
import {predictDemand,type DemandDay,type ForecastModel} from './forecast';
export const PHYSICAL_FORECAST_KEY='ev-physical-forecast-v1';
export type PhysicalModel={schema:'physical-forecast/1';forecast:ForecastModel;buffer:number;threshold:number;seed:number;validationSeed:number;validationScores:{buffer:number;score:number}[]};
export type Disturbance='normal'|'early'|'late'|'fault'|'offline'|'stale';
export const physicalPolicies=['immediate','balanced','ems','cheap','peak','total','historical','forecast-mean','forecast'] as const;
export type PhysicalPolicy=typeof physicalPolicies[number];
export function physicalScenario(day:number,seed:number,disturbance:Disturbance='normal'):Config{return {...defaults,preset:disturbance==='fault'?'fault':disturbance==='offline'?'offline':day%4===0?'fleet':day<60||day>334?'cold':'office',seed:(seed+day*7919)%100001,dayOfYear:day,grid:[75,100,140][day%3],solar:[20,60,100][day%3],chargers:12+day%9,demand:.8+(day%5)*.15};}
function feature(c:Config){const d=c.dayOfYear??111;return [d%7/6,Math.sin(d/365*2*Math.PI),Math.cos(d/365*2*Math.PI),c.preset==='fleet'?1:0,c.demand/2];}
function profile(c:Config):DemandDay{const energy=Array(96).fill(0);for(const v of vehiclesFor(c))energy[Math.floor(v.arrival/15)]+=v.need/.9;return {day:c.dayOfYear??111,seed:c.seed,features:feature(c),energy};}
function gap(r:Result){return r.final.shortfall;}
function objective(r:Result){return r.final.cost+20*gap(r)+1000*r.final.violations;}
export function isPhysicalModel(raw:unknown):raw is PhysicalModel{const m=raw as PhysicalModel;return !!m&&m.schema==='physical-forecast/1'&&[0,.5,1].includes(m.buffer)&&Number.isFinite(m.threshold)&&m.threshold>=0&&m.forecast?.version===1&&Number.isInteger(m.forecast.k)&&m.forecast.k>0&&Number.isFinite(m.forecast.radius)&&m.forecast.radius>=0&&Array.isArray(m.forecast.training)&&m.forecast.training.length>0&&m.forecast.training.length<=365&&m.forecast.training.every(d=>Array.isArray(d.features)&&d.features.length===5&&d.features.every(Number.isFinite)&&Array.isArray(d.energy)&&d.energy.length===96&&d.energy.every(x=>Number.isFinite(x)&&x>=0));}
export function trainPhysicalForecast(days=140,seed=42,onProgress?:(phase:string,day:number,total:number)=>void):PhysicalModel{
 const training=Array.from({length:days},(_,i)=>profile(physicalScenario(Math.floor(i*365/days),seed)));
 const validation=Array.from({length:days},(_,i)=>profile(physicalScenario(Math.floor(i*365/days),seed+7919)));
 const error=(k?:number)=>validation.reduce((s,d)=>{const p=predictDemand(training,d,k);return s+d.energy.reduce((a,x,t)=>a+Math.abs(x-p[t]),0)/96;},0)/days;
 let k=3,best=Infinity;for(const candidate of [3,7,15]){const e=error(candidate);if(e<best){best=e;k=candidate;}}
 const residuals=validation.flatMap(d=>{const p=predictDemand(training,d,k);return d.energy.slice(24,76).map((x,i)=>Math.abs(x-p[i+24]));}).sort((a,b)=>a-b);
 const model:PhysicalModel={schema:'physical-forecast/1',forecast:{version:1,k,training,radius:residuals[Math.ceil(.9*residuals.length)-1],validationMae:best,baselineMae:error()},buffer:0,threshold:1,seed,validationSeed:seed+15401,validationScores:[]};
 // Controller selection is isolated from the fresh-seed benchmarks.
 for(const buffer of [0,.5,1]){let score=0;for(let i=0;i<12;i++){const day=Math.floor(i*365/12),c=physicalScenario(day,model.validationSeed);score+=objective(simulatePhysicalForecast(c,{...model,buffer}));onProgress?.('Controller validation',i+1+12*buffer,36);}model.validationScores.push({buffer,score:score/12});}
 model.buffer=model.validationScores.reduce((a,b)=>b.score<a.score?b:a).buffer;return model;
}
export function physicalDispatch(c:Config,model:PhysicalModel,weather:Result,mode:'historical'|'mean'|'adaptive'='adaptive',market:Market='nl'){
 const prediction=predictDemand(model.forecast.training,{day:c.dayOfYear??111,features:feature(c)},mode==='historical'?undefined:model.forecast.k);
 const declared=new Map(vehiclesFor(c).map(v=>[v.id,v]));let previous=-1,signature='',plans:Record<number,number>={};
 return (ctx:DispatchContext):Record<number,DispatchDecision>=>{
  // Future vehicles in the engine context are intentionally inaccessible to this planner.
  const active=ctx.available.map(s=>({s,v:declared.get(s.id)!}));const ids=active.map(x=>x.s.id).join(',');const slot=Math.floor(ctx.time/15);
  if(slot!==previous||ids!==signature){previous=slot;signature=ids;plans={};
   const end=Math.min(96,slot+24),free=Array(96).fill(0);for(let t=slot;t<end;t++){const f=weather.frames[t*15];free[t]=Math.max(0,f.limit-3-f.building+f.solar)*15/60;}free[slot]=ctx.budget*(15-ctx.time%15)/60;
   let forecastEnergy=0,headroom=0;for(let t=slot+1;t<Math.min(end,slot+17);t++){forecastEnergy+=prediction[t];headroom+=free[t];}
   const pressure=forecastEnergy/Math.max(.01,headroom);const buffer=mode==='adaptive'&&pressure>=model.threshold?model.buffer*model.forecast.radius:0;
   for(let arrival=slot+1;arrival<Math.min(end,slot+17);arrival++){let need=prediction[arrival]+(prediction[arrival]>0?buffer:0);const choices=Array.from({length:Math.min(8,end-arrival)},(_,i)=>arrival+i).sort((a,b)=>retail(market,a*15)-retail(market,b*15)||a-b);for(const t of choices){const take=Math.min(free[t],need);free[t]-=take;need-=take;}}
   const ordered=[...active].sort((a,b)=>(a.v.departure-ctx.time-(a.v.need-a.s.delivered)/(.9*a.v.maxKw)*60)-(b.v.departure-ctx.time-(b.v.need-b.s.delivered)/(.9*b.v.maxKw)*60)||a.s.id-b.s.id);
   for(const {s,v} of ordered){let need=Math.max(0,v.need-s.delivered)/.9;const choices=Array.from({length:Math.max(0,Math.min(end,Math.ceil(v.departure/15))-slot)},(_,i)=>slot+i).sort((a,b)=>retail(market,a*15)-retail(market,b*15)||a-b);let current=0;for(const t of choices){const minutes=Math.max(0,Math.min(15,v.departure-t*15)-(t===slot?ctx.time%15:0));const take=Math.min(free[t],need,v.maxKw*minutes/60);free[t]-=take;need-=take;if(t===slot)current+=take;}plans[s.id]=current*60/Math.max(1,15-ctx.time%15);}
  }
  const powers:Record<number,DispatchDecision>={};let budget=ctx.budget;
  // Minimum urgency is evaluated every minute; departures are declared, not actual surprise times.
  const ordered=[...active].sort((a,b)=>a.v.departure-b.v.departure||a.s.id-b.s.id);
  for(const {s,v} of ordered){const remaining=Math.max(0,v.need-s.delivered)/.9,minutes=Math.max(1,v.departure-ctx.time),urgent=Math.max(0,(remaining-v.maxKw*Math.max(0,minutes-1)/60)*60);const want=Math.max(plans[s.id]??0,urgent);const power=Math.min(v.maxKw,remaining*60,budget,want);budget-=power;powers[s.id]={power,reason:`${mode==='adaptive'?'AI forecast':'Forecast mean'} · observed request · declared departure · current grid headroom`};}
  return powers;
 };
}
export function disturbanceTransform(kind:Disturbance){return (vehicles:Vehicle[])=>vehicles.map(v=>({...v,departure:kind==='early'&&v.id%5===0?Math.max(v.arrival+30,v.departure-90):v.departure,arrival:kind==='late'&&v.id%5===0?Math.min(v.departure-30,v.arrival+45):v.arrival}));}
export function simulatePhysicalForecast(c:Config,model:PhysicalModel,mode:'historical'|'mean'|'adaptive'='adaptive',kind:Disturbance='normal',market:Market='nl'):Result{
 const weather=simulate({...c,policy:'balanced'},{price:t=>retail(market,t)});const dispatch=physicalDispatch(c,model,weather,mode,market);
 return simulate({...c,policy:'ems'},{price:t=>retail(market,t),exportPrice:EXPORT_PRICE,vehicleTransform:disturbanceTransform(kind),declaredVehicles:vehiclesFor(c),communicationUnavailable:t=>kind==='stale'&&t>=660&&t<690,dispatch});
}
export function physicalRun(c:Config,model:PhysicalModel,policy:PhysicalPolicy,kind:Disturbance):Result{
 const controls={vehicleTransform:disturbanceTransform(kind),declaredVehicles:vehiclesFor(c),communicationUnavailable:(t:number)=>kind==='stale'&&t>=660&&t<690};
 if(policy==='forecast'||policy==='forecast-mean'||policy==='historical')return simulatePhysicalForecast(c,model,policy==='forecast'?'adaptive':policy==='historical'?'historical':'mean',kind);
 if(policy==='cheap'||policy==='peak'||policy==='total')return simulateOptimized(c,{policy,market:'nl',peak:c.grid*.85},undefined,controls);
 return simulate({...c,policy},{price:t=>retail('nl',t),exportPrice:EXPORT_PRICE,...controls});
}
export function physicalBenchmark(model:PhysicalModel,days=14,seeds=[4781,7919,12553],onProgress?:(done:number,total:number)=>void){
 const kinds:Disturbance[]=['normal','early','late','fault','offline','stale'];let done=0;
 const rows=seeds.flatMap(seed=>Array.from({length:days},(_,i)=>{const day=Math.floor(i*365/days),kind=kinds[i%kinds.length],config=physicalScenario(day,seed,kind);const runs=physicalPolicies.map(policy=>{const r=physicalRun(config,model,policy,kind);return {policy,cost:r.final.cost,unmet:r.final.shortfall,ready:r.final.ready,departed:r.final.departed,violations:r.final.violations,excess:r.final.excess,batteryEnd:r.final.batteryKwh,score:objective(r),minimumUnmet:r.vehicles.reduce((s,v)=>s+Math.max(0,v.need-v.maxKw*.9*Math.max(0,v.departure-v.arrival-2)/60),0)};});onProgress?.(++done,days*seeds.length);return {seed,day,kind,config,minimumUnmet:runs[0].minimumUnmet,runs};}));
 const totals=physicalPolicies.map(policy=>({policy,...rows.reduce((a,row)=>{const r=row.runs.find(x=>x.policy===policy)!;return {cost:a.cost+r.cost,unmet:a.unmet+r.unmet,ready:a.ready+r.ready,departed:a.departed+r.departed,violations:a.violations+r.violations,score:a.score+r.score};},{cost:0,unmet:0,ready:0,departed:0,violations:0,score:0})}));
 return {seeds,days,rows,totals};
}
