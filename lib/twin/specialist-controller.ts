import {simulate,type DispatchContext,type DispatchDecision,type Result,type SimulationOptions,type Config} from './engine';
import {simulateOptimized,retail,EXPORT_PRICE,type Market} from './optimizer';
import {clip,quantile,randomFor} from './neural';
import {specialistScenario,specialistConditions,type PublicDay,type SpecialistCase,type SpecialistCondition} from './specialist-scenario';
import {predictDay,specialistAccuracy,specialistIds,type SpecialistBundle,type SpecialistId,type OperatingPolicy,type PlannerSettings} from './specialists';
import {physicalLosses} from './physical-forecast';
export const specialistPolicies=['immediate','balanced','ems','cheap','peak','total','planner','full','no-departure','no-arrivals','no-energy','no-headroom','selected'] as const;
export type SpecialistPolicy=typeof specialistPolicies[number];
export const specialistNames:Record<SpecialistPolicy,string>={immediate:'Immediate (uncontrolled)',balanced:'Load balancing',ems:'Deadline-aware EMS',cheap:'Cheapest energy',peak:'Peak-aware',total:'Total-cost-aware',planner:'Common planner · no learned models',full:'Four-specialist AI controller','no-departure':'AI without departure model','no-arrivals':'AI without arrival model','no-energy':'AI without energy model','no-headroom':'AI without building/solar model',selected:'Validation-selected operating policy'};
export function specialistObjective(result:Result){return result.final.cost+20*result.final.shortfall+1000*result.final.violations;}
const disabledFor=(policy:SpecialistPolicy):SpecialistId[]=>policy==='planner'?[...specialistIds]:policy.startsWith('no-')?[policy.slice(3) as SpecialistId]:[];
/** Only PublicDay and current connected requests cross this interface. */
export function specialistDispatch(d:PublicDay,m:SpecialistBundle,disabled:SpecialistId[]=[],market:Market='nl'){
 const prediction=predictDay(d,m,disabled),weatherEnabled=!disabled.includes('headroom'),departureEnabled=!disabled.includes('departure');let previous='',lastBudget=-1,plans:Record<number,number>={};
 return (ctx:DispatchContext):Record<number,DispatchDecision>=>{
  const active=ctx.available.map(s=>{const v=ctx.vehicles[s.id],mean=prediction.departures[s.id],alive=m.models.departure.residuals.filter(r=>mean+r>ctx.time+5);const estimated=departureEnabled?mean+quantile(alive.length?alive:m.models.departure.residuals,m.settings.quantile):v.departure-m.settings.baselineMargin;return {s,v,deadline:clip(estimated,ctx.time+10,1380),need:Math.max(0,v.need-s.delivered)/.9};}).sort((a,b)=>a.deadline-b.deadline||a.v.id-b.v.id);
  const start=Math.floor(ctx.time/15),key=`${start}:${active.map(r=>r.v.id).join(',')}`;
  if(key!==previous||Math.abs(lastBudget-ctx.budget)>3){previous=key;lastBudget=ctx.budget;plans={};const end=Math.min(96,Math.max(start+1,...active.map(r=>Math.ceil(r.deadline/15)))),free=Array(96).fill(0),score=Array(96).fill(0);
   for(let s=start;s<end;s++){const minutes=15-(s===start?ctx.time%15:0),buffer=weatherEnabled?m.settings.weatherBuffer*(m.models.headroom.radius[0]+m.models.headroom.radius[1]):0;free[s]=Math.max(0,d.config.grid-3-prediction.building[s]+prediction.solar[s]-buffer)*minutes/60;if(s===start)free[s]=ctx.budget*minutes/60;
    let competition=0;for(let a=Math.max(start+1,s-11);a<=s;a++)competition+=prediction.arrivals[a]*prediction.energy[a]/.9/12;
    const net=prediction.building[s]-prediction.solar[s];score[s]=(net<0?EXPORT_PRICE:retail(market,s*15))+m.settings.competition*competition/Math.max(.2,free[s]);
   }
   for(const r of active){let need=Math.min(r.need,r.v.maxKw*Math.max(0,r.deadline-ctx.time)/60),current=0;const choices=Array.from({length:Math.max(0,Math.min(end,Math.ceil(r.deadline/15))-start)},(_,i)=>start+i).sort((a,b)=>score[a]-score[b]||a-b);
    for(const s of choices){const minutes=Math.max(0,Math.min(r.deadline,s*15+15)-Math.max(ctx.time,s*15)),take=Math.min(need,free[s],r.v.maxKw*minutes/60);free[s]-=take;need-=take;if(s===start)current+=take;}plans[r.v.id]=current*60/Math.max(1,15-ctx.time%15);
   }
  }
  const powers:Record<number,DispatchDecision>={};let budget=ctx.budget,due=0;
  for(const r of active){const minutes=Math.max(1,r.deadline-ctx.time),deliverable=Math.min(r.need,r.v.maxKw*minutes/60);due+=deliverable;let future=0;
   for(let s=start;s<Math.ceil(r.deadline/15);s++){const from=Math.max(ctx.time+1,s*15),to=Math.min(r.deadline,s*15+15),buffer=weatherEnabled?m.settings.weatherBuffer*(m.models.headroom.radius[0]+m.models.headroom.radius[1]):0;future+=Math.max(0,to-from)*Math.max(0,d.config.grid-3-prediction.building[s]+prediction.solar[s]-buffer)/60;}
   const mandatory=Math.max(0,(deliverable-r.v.maxKw*Math.max(0,minutes-1)/60)*60,(due-future)*60),want=Math.max(plans[r.v.id]??0,mandatory),power=Math.min(r.v.maxKw,r.need*60,budget,want);budget-=power;
   powers[r.v.id]={power,reason:`${disabled.length===4?'Unlearned':'Specialist'} planner · risk deadline · measured headroom · ${disabled.join(', ')||'four predictors'}`};
  }return powers;
 };
}
export function specialistControls(c:SpecialistCase):SimulationOptions{return {vehicleTransform:()=>c.actual.map(v=>({...v})),declaredVehicles:c.public.declared,observeConnectedRequests:true,environment:t=>({building:c.building[Math.floor(t/15)],solar:c.solar[Math.floor(t/15)]}),minimumChargingKw:1.4,communicationUnavailable:t=>(c.condition==='stale'&&t>=660&&t<690)||(c.condition==='offline'&&t>=600&&t<720)};}
export function specialistRun(c:SpecialistCase,m:SpecialistBundle,raw:SpecialistPolicy='full',market:Market='nl',preferredPeak=c.config.grid*.85):Result{
 const policy=raw==='selected'?m.selected:raw,controls=specialistControls(c),price=(t:number)=>retail(market,t);
 if(['cheap','peak','total'].includes(policy)){
  // Every fixed planner gets the same published (imperfect) weather forecast.
  const forecast=simulate({...c.config,policy:'balanced'},{price,environment:t=>({building:c.public.building[Math.floor(t/15)],solar:c.public.solar[Math.floor(t/15)]})});forecast.frames.forEach((f,t)=>{f.building=c.public.building[Math.floor(t/15)];f.solar=c.public.solar[Math.floor(t/15)];f.curtailed=0;});
  return simulateOptimized(c.config,{policy:policy as 'cheap'|'peak'|'total',market,peak:preferredPeak},forecast,controls);
 }
 if(['immediate','balanced','ems'].includes(policy))return simulate({...c.config,policy:policy as 'immediate'|'balanced'|'ems'},{price,exportPrice:EXPORT_PRICE,...controls});
 return simulate({...c.config,policy:'ems'},{price,exportPrice:EXPORT_PRICE,...controls,dispatch:specialistDispatch(c.public,m,disabledFor(policy as SpecialistPolicy),market)});
}
/** Controller settings and fallback are selected entirely before test generation. */
export function validateSpecialistController(m:SpecialistBundle,progress?:(phase:string,done:number,total:number)=>void):SpecialistBundle{
 const cases=Array.from({length:10},(_,i)=>specialistScenario(Math.floor(i*365/10),m.validationSeed,specialistConditions[i%5]));const candidates:PlannerSettings[]=[];for(const q of [.02,.1,.2,.5])for(const competition of [0,.08])for(const weatherBuffer of [0,.5,1])candidates.push({quantile:q,competition,weatherBuffer,baselineMargin:60});let done=0;const total=cases.length*(candidates.length+8);
 const evaluate=(policy:OperatingPolicy,settings:PlannerSettings)=>{const candidate={...m,settings},score=cases.reduce((s,c)=>{const r=specialistRun(c,candidate,policy);progress?.('Controller validation',++done,total);return s+specialistObjective(r);},0)/cases.length;return {policy,settings,score};};
 const validation=candidates.map(settings=>evaluate('full',settings));const best=validation.reduce((a,b)=>b.score<a.score?b:a);m.settings=best.settings;
 for(const margin of [0,60,180])validation.push(evaluate('planner',{...m.settings,baselineMargin:margin}));
 for(const fixed of ['balanced','ems','cheap','peak','total'] as const)validation.push(evaluate(fixed,m.settings));
 const bestFixed=validation.filter(r=>!['full','planner'].includes(r.policy)).reduce((a,b)=>b.score<a.score?b:a),selected=validation.reduce((a,b)=>b.score<a.score?b:a);m.fixed=bestFixed.policy;m.selected=selected.policy;
 // The no-learning comparator and fallback retain their own validation-selected margin.
 if(selected.policy==='planner')m.settings={...m.settings,baselineMargin:selected.settings.baselineMargin};else m.settings={...m.settings,baselineMargin:validation.filter(r=>r.policy==='planner').reduce((a,b)=>b.score<a.score?b:a).settings.baselineMargin};
 m.validation=validation;return m;
}
export type RunMetrics={policy:SpecialistPolicy;cost:number;unmet:number;ready:number;departed:number;violations:number;score:number;minimumUnmet:number;aboveBound:number;batteryEnd:number};
export type BenchmarkRow={seed:number;day:number;condition:SpecialistCondition;config:Config;runs:RunMetrics[]};
export function pairedInterval(deltas:number[],seed=314159){const rng=randomFor(seed),means=Array.from({length:600},()=>deltas.reduce(s=>s+deltas[Math.floor(rng()*deltas.length)],0)/deltas.length);return {mean:deltas.reduce((s,x)=>s+x,0)/deltas.length,low:quantile(means,.025),high:quantile(means,.975),wins:deltas.filter(x=>x>1e-7).length,losses:deltas.filter(x=>x< -1e-7).length,ties:deltas.filter(x=>Math.abs(x)<=1e-7).length};}
function sumRuns(rows:BenchmarkRow[]){return specialistPolicies.map(policy=>({policy,...rows.reduce((a,row)=>{const r=row.runs.find(x=>x.policy===policy)!;return {cost:a.cost+r.cost,unmet:a.unmet+r.unmet,ready:a.ready+r.ready,departed:a.departed+r.departed,violations:a.violations+r.violations,score:a.score+r.score,minimumUnmet:a.minimumUnmet+r.minimumUnmet,aboveBound:a.aboveBound+r.aboveBound};},{cost:0,unmet:0,ready:0,departed:0,violations:0,score:0,minimumUnmet:0,aboveBound:0})}));}
export function specialistBenchmark(m:SpecialistBundle,days=10,seeds=[4781,7919,12553],progress?:(phase:string,done:number,total:number)=>void){
 if(!Number.isInteger(days)||days<1||days>365||!seeds.length||seeds.length>10||seeds.some(s=>!Number.isInteger(s)||s<0||s>100000))throw Error('Invalid frozen benchmark configuration.');
 if(seeds.some(s=>s===m.trainingSeed||s===m.validationSeed)||new Set(seeds).size!==seeds.length)throw Error('Test seeds must be unique and independent of training and validation.');
 const cases=seeds.flatMap(seed=>Array.from({length:days},(_,i)=>specialistScenario(Math.floor(i*365/days),seed,specialistConditions[i%5]))),accuracy=specialistAccuracy(m,cases);let done=0;
 const rows:BenchmarkRow[]=cases.map(c=>{const runs=specialistPolicies.map(policy=>{const r=specialistRun(c,m,policy),loss=physicalLosses(r);return {policy,cost:r.final.cost,unmet:r.final.shortfall,ready:r.final.ready,departed:r.final.departed,violations:r.final.violations,score:specialistObjective(r),minimumUnmet:loss.availabilityBound,aboveBound:loss.gapAboveBound,batteryEnd:r.final.batteryKwh};});progress?.('Frozen unseen-seed benchmark',++done,cases.length);return {seed:c.seed,day:c.day,condition:c.condition,config:c.config,runs};});
 const paired=(policy:SpecialistPolicy)=>pairedInterval(rows.map(row=>row.runs.find(r=>r.policy===policy)!.score-row.runs.find(r=>r.policy==='full')!.score));
 return {schema:'ev-specialist-evidence/1',days,seeds,rows,totals:sumRuns(rows),slices:specialistConditions.map(condition=>({condition,count:rows.filter(r=>r.condition===condition).length,totals:sumRuns(rows.filter(r=>r.condition===condition))})),accuracy,comparisons:{noLearning:paired('planner'),fixed:paired(m.fixed as SpecialistPolicy),contributions:specialistIds.map(id=>({id,...paired(`no-${id}` as SpecialistPolicy)}))},objective:{unmetEurPerKwh:20,violationEurPerMinute:1000},uncertainty:'Paired scenario bootstrap; correlated scenarios within a seed are not independent real-world trials.'};
}
