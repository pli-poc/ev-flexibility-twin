import {simulate,vehiclesFor,validateConfig,type Config,type Policy,type Result} from './engine';
import {advancedPolicies,EXPORT_PRICE,retail,simulateOptimized,validateOptimizer,type AdvancedPolicy,type OptimizerConfig,type OptimizerResult} from './optimizer';
import {simulatePhysicalForecast,disturbanceTransform,type Disturbance,type PhysicalModel} from './physical-forecast';
import {modelDispatch,type Network} from './ml';
export const COMPARISON_VERSION='comparison-1.1.0';
export type StrategyId=Policy|AdvancedPolicy|'ml'|'forecast';
export const strategies:{id:StrategyId;name:string;description:string}[]=[
 {id:'immediate',name:'Immediate charging',description:'Uncontrolled baseline: maximum power on connection. Overloads are recorded, not prevented.'},
 {id:'balanced',name:'Load balancing',description:'Shares current headroom. Uses the same hardware, tariff and fault model as every strategy.'},
 {id:'ems',name:'Deadline-aware EMS',description:'Prioritises departure urgency and moderates charging during expensive intervals.'},
 ...advancedPolicies
];
export type Metrics={importCost:number;exportCredit:number;energyCost:number;requestedKwh:number;deliveredKwh:number;shortfallKwh:number;ready:number;departed:number;readyPct:number;minutePeakKw:number;quarterPeakKw:number;violationMinutes:number;excessKwh:number;batteryEndKwh:number;incrementalMonthlyPeakCharge:number|null};
export type StrategyRun={id:StrategyId;name:string;description:string;result:Result|OptimizerResult;metrics:Metrics;equivalentService:boolean;comparisonNote:string};
export type Comparison={version:string;config:Config;optimizer:OptimizerConfig;runs:StrategyRun[];referenceId:'balanced';fingerprint:string;disturbance:Disturbance;forecastModel?:PhysicalModel|null};
export function measure(result:Result,opt:OptimizerConfig):Metrics{
 let importCost=0,exportCredit=0,quarterPeakKw=0;
 for(const f of result.frames){importCost+=Math.max(0,f.grid)*f.price/60;exportCredit+=Math.max(0,-f.grid)*EXPORT_PRICE/60;}
 for(let start=0;start<1440;start+=15)quarterPeakKw=Math.max(quarterPeakKw,result.frames.slice(start,start+15).reduce((sum,f)=>sum+Math.max(0,f.grid),0)/15);
 const requestedKwh=result.vehicles.reduce((sum,v)=>sum+v.need,0),f=result.final;
 const rate=opt.capacityRateEurPerKwMonth??0;
 return {importCost,exportCredit,energyCost:importCost-exportCredit,requestedKwh,deliveredKwh:f.delivered,shortfallKwh:f.shortfall,ready:f.ready,departed:f.departed,readyPct:f.departed?100*f.ready/f.departed:0,minutePeakKw:f.peak,quarterPeakKw,violationMinutes:f.violations,excessKwh:f.excess,batteryEndKwh:f.batteryKwh,incrementalMonthlyPeakCharge:rate>0?Math.max(0,quarterPeakKw-(opt.existingMonthlyPeakKw??opt.peak))*rate:null};
}
export function compareStrategies(input:Config,raw:OptimizerConfig,model?:Network|null,forecast?:PhysicalModel|null,disturbance:Disturbance='normal'):Comparison{
 const valid=validateConfig(input),config={...valid,policy:'balanced' as Policy},optimizer=validateOptimizer(raw);
 const price=(t:number)=>retail(optimizer.market,t);
 const controls={vehicleTransform:disturbanceTransform(disturbance),declaredVehicles:vehiclesFor(config),communicationUnavailable:(t:number)=>disturbance==='stale'&&t>=660&&t<690};
 const reference=simulate(config,{price,exportPrice:EXPORT_PRICE,...controls});
 const runs:StrategyRun[]=strategies.map(s=>{
  const result=s.id==='balanced'?reference:['cheap','peak','total'].includes(s.id)?simulateOptimized(config,{...optimizer,policy:s.id as AdvancedPolicy},reference,controls):simulate({...config,policy:s.id as Policy},{price,exportPrice:EXPORT_PRICE,...controls});
  return {...s,result,metrics:measure(result,optimizer),equivalentService:false,comparisonNote:''};
 });
 if(model){const result=simulate({...config,policy:'ems'},{price,exportPrice:EXPORT_PRICE,dispatch:modelDispatch(model),...controls});runs.push({id:'ml',name:'Learned EMS policy',description:`Compact model trained to imitate ${model.teacherPolicy} using one year of illustrative synthetic simulation data.`,result,metrics:measure(result,optimizer),equivalentService:false,comparisonNote:'Experimental learned dispatch. The same vehicle, charger, battery and grid limits still apply; inspect service and safety results before interpreting cost.'});}
 if(forecast){const result=simulatePhysicalForecast(config,forecast,'adaptive',disturbance,optimizer.market);runs.push({id:'forecast',name:forecast.planner==='service-v2'&&forecast.riskWeight===0?'Service-first EMS controller':'AI forecast controller',description:forecast.planner==='service-v2'&&forecast.riskWeight===0?'Validation disabled forecast pressure. This run tests a service-first scheduling improvement, not added value from AI.':'Learned arrival-energy forecast feeds per-vehicle planning; declared deadlines, charger limits and current grid headroom remain enforced.',result,metrics:measure(result,optimizer),equivalentService:false,comparisonNote:''});}
 const base=runs.find(r=>r.id==='balanced')!;
 for(const run of runs){
  const sameDelivery=run.metrics.ready===base.metrics.ready&&run.result.vehicles.every(v=>Math.abs(run.result.final.cars[v.id].delivered-reference.final.cars[v.id].delivered)<.05);
  const sameStorage=!config.battery||Math.abs(run.metrics.batteryEndKwh-base.metrics.batteryEndKwh)<.05;
  run.equivalentService=sameDelivery&&sameStorage&&run.metrics.violationMinutes===0&&base.metrics.violationMinutes===0;
  run.comparisonNote=run.metrics.violationMinutes?'Import limit exceeded; not an admissible saving.':!sameDelivery?'Vehicle-level delivery differs; cost difference is not equivalent-service savings.':!sameStorage?'Final stored energy differs; cost difference is not storage-normalised savings.':base.metrics.violationMinutes?'Reference exceeds import limit; compare service and safety first.':'Same vehicle energy and final storage as load balancing; no import-limit violations.';
 }
 const settings=JSON.stringify({version:COMPARISON_VERSION,config,disturbance,forecastModel:forecast??null,market:optimizer.market,peak:optimizer.peak,existingMonthlyPeakKw:optimizer.existingMonthlyPeakKw,capacityRateEurPerKwMonth:optimizer.capacityRateEurPerKwMonth});
 let hash=2166136261;for(let i=0;i<settings.length;i++)hash=Math.imul(hash^settings.charCodeAt(i),16777619)>>>0;
 return {version:COMPARISON_VERSION,config,optimizer,runs,referenceId:'balanced',disturbance,forecastModel:forecast??null,fingerprint:hash.toString(16).padStart(8,'0')};
}
export function comparisonCsv(c:Comparison):string{
 const header=['scenario_id','model_version','strategy','market','currency','period','seed','grid_kw','solar_kwp','demand_multiplier','chargers','battery','flexible_building','preferred_peak_kw','existing_monthly_peak_kw','capacity_rate_eur_kw_month','import_cost_eur','export_credit_eur','site_energy_cost_eur','requested_kwh','delivered_kwh','shortfall_kwh','ready','departed','readiness_pct','peak_1min_kw','peak_15min_kw','violation_minutes','excess_kwh','battery_end_kwh','incremental_monthly_peak_charge_eur','equivalent_service','note'];
 const quote=(v:unknown)=>`"${String(v??'').replace(/"/g,'""')}"`;
 return [header,...c.runs.map(r=>[c.fingerprint,c.version,r.id,c.optimizer.market,'EUR','synthetic 24h weekday',c.config.seed,c.config.grid,c.config.solar,c.config.demand,c.config.chargers,c.config.battery,c.config.flexible,c.optimizer.peak,c.optimizer.existingMonthlyPeakKw,c.optimizer.capacityRateEurPerKwMonth,r.metrics.importCost,r.metrics.exportCredit,r.metrics.energyCost,r.metrics.requestedKwh,r.metrics.deliveredKwh,r.metrics.shortfallKwh,r.metrics.ready,r.metrics.departed,r.metrics.readyPct,r.metrics.minutePeakKw,r.metrics.quarterPeakKw,r.metrics.violationMinutes,r.metrics.excessKwh,r.metrics.batteryEndKwh,r.metrics.incrementalMonthlyPeakCharge,r.equivalentService,r.comparisonNote])].map(row=>row.map(quote).join(',')).join('\n');
}
export function exportComparison(c:Comparison):string{
 return JSON.stringify({schemaVersion:2,version:c.version,scenarioId:c.fingerprint,config:c.config,optimizer:c.optimizer,disturbance:c.disturbance,forecastModel:c.forecastModel,assumptions:{currency:'EUR',period:'24h synthetic weekday',vat:'excluded',tariffs:'synthetic; not a customer invoice',forecast:'perfect synthetic building/PV; connected vehicles only; storage controlled locally',capacityCharge:'optional user-entered marginal monthly estimate; never added to daily energy cost'},results:c.runs.map(({id,name,metrics,equivalentService,comparisonNote})=>({id,name,metrics,equivalentService,comparisonNote}))},null,2);
}
export function parseScenario(raw:unknown):{config:Config;optimizer:OptimizerConfig;advanced:boolean}{
 const obj=raw as {schemaVersion?:number;config?:unknown;optimizer?:unknown;advanced?:unknown};
 if(!obj||![1,2].includes(obj.schemaVersion??0))throw new Error('Unsupported scenario version.');
 const config=validateConfig(obj.config);
 const optimizer=obj.optimizer?validateOptimizer(obj.optimizer):validateOptimizer({policy:'total',market:'nl',peak:85});
 if(obj.advanced!==undefined&&typeof obj.advanced!=='boolean')throw new Error('Invalid optimizer mode.');
 return {config,optimizer,advanced:obj.advanced===true};
}
