import {compareStrategies,type StrategyId} from './comparison';
import {type Config,type Frame,type Result} from './engine';
import {FEATURE_NAMES,featureVector,type Sample} from './ml';
import {YEAR_DAYS,annualPreset,seasonName,splitForDay,type AnnualSettings} from './annual';

export type AnnualPolicyResult={
 id:StrategyId;name:string;importCost:number;exportCredit:number;energyCost:number;capacityCostEur:number|null;totalCost:number;
 requestedKwh:number;deliveredKwh:number;shortfallKwh:number;ready:number;departed:number;
 readinessPct:number;violationMinutes:number;excessKwh:number;peakKw:number;quarterPeakKw:number;
};
export type AnnualBacktestReport={
 schemaVersion:1;days:number;rows:number;datasetFingerprint:string;teacherPolicy:string;
 splitCounts:{train:number;validation:number;test:number};results:AnnualPolicyResult[];
};
export type AnnualBacktestProgress={day:number;total:number;rows:number;season:string};
const hash=(text:string)=>{let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619)>>>0;return h.toString(16).padStart(8,'0');};
const active=(state:Frame['cars'][number])=>state.bay>=0&&(state.status==='Charging'||state.status==='Paused');
function averagePower(result:Result,vehicleId:number,start:number){
 let total=0,count=0;for(let t=start;t<Math.min(start+15,1440);t++){total+=result.frames[t].cars[vehicleId]?.power??0;count++;}return count?total/count:0;
}
function seasonalConfig(settings:AnnualSettings,day:number):Config{
 const seasonFactor=1+.08*Math.cos(2*Math.PI*(day-200)/365);
 return {...settings.config,preset:annualPreset(day),policy:'ems',seed:(settings.seed+day*7919)%100001,dayOfYear:day,demand:Math.max(.5,Math.min(2,settings.config.demand*seasonFactor))};
}
export function runAnnualBacktest(settings:AnnualSettings,onProgress?:(p:AnnualBacktestProgress)=>void,dayCount=YEAR_DAYS):{report:AnnualBacktestReport;samples:Sample[]}{
 const days=Math.max(1,Math.min(YEAR_DAYS,Math.floor(dayCount))),samples:Sample[]=[];
 const sums=new Map<StrategyId,AnnualPolicyResult>();
 for(let day=0;day<days;day++){
  const config=seasonalConfig(settings,day),comparison=compareStrategies(config,settings.optimizer);
  for(const run of comparison.runs){
   if(run.id==='ml')continue;
   let sum=sums.get(run.id);
   if(!sum){sum={id:run.id,name:run.name,importCost:0,exportCredit:0,energyCost:0,capacityCostEur:null,totalCost:0,requestedKwh:0,deliveredKwh:0,shortfallKwh:0,ready:0,departed:0,readinessPct:0,violationMinutes:0,excessKwh:0,peakKw:0,quarterPeakKw:0};sums.set(run.id,sum);}
   const m=run.metrics;sum.importCost+=m.importCost;sum.exportCredit+=m.exportCredit;sum.energyCost+=m.energyCost;
   sum.requestedKwh+=m.requestedKwh;sum.deliveredKwh+=m.deliveredKwh;sum.shortfallKwh+=m.shortfallKwh;
   sum.ready+=m.ready;sum.departed+=m.departed;sum.violationMinutes+=m.violationMinutes;sum.excessKwh+=m.excessKwh;
   sum.peakKw=Math.max(sum.peakKw,m.minutePeakKw);sum.quarterPeakKw=Math.max(sum.quarterPeakKw,m.quarterPeakKw);
  }
  const teacher=comparison.runs.find(r=>r.id===settings.teacherPolicy);
  if(!teacher)throw new Error('The selected teacher policy is unavailable in the annual baseline run.');
  for(let t=0;t<1440;t+=15){
   const frame=teacher.result.frames[t],week=Math.floor(day/7),split=splitForDay(day);
   for(const state of frame.cars){
    if(!active(state))continue;
    const vehicle=teacher.result.vehicles[state.id],target=averagePower(teacher.result,state.id,t);
    samples.push({x:featureVector({time:t,dayOfYear:day,config,vehicle,state,building:frame.building,solar:frame.solar,limit:frame.limit,price:frame.price,batteryKwh:frame.batteryKwh,outdoor:frame.outdoor,irradiance:frame.irradiance}),y:Math.max(0,Math.min(1,target/Math.max(.1,vehicle.maxKw))),day,week,split,vehicleKind:vehicle.kind,scenario:config.preset});
   }
  }
  if(day%3===0||day===days-1)onProgress?.({day:day+1,total:days,rows:samples.length,season:seasonName(day)});
 }
 const splitCounts={train:samples.filter(s=>s.split==='train').length,validation:samples.filter(s=>s.split==='validation').length,test:samples.filter(s=>s.split==='test').length};
 for(const row of sums.values()){
  row.readinessPct=row.departed?100*row.ready/row.departed:0;
  const rate=settings.optimizer.capacityRateEurPerKwMonth??0;
  row.capacityCostEur=rate>0?Math.max(0,row.quarterPeakKw-(settings.optimizer.existingMonthlyPeakKw??settings.optimizer.peak))*rate*12:null;
  row.totalCost=row.energyCost+(row.capacityCostEur??0);
 }
 const fingerprint=hash(JSON.stringify({settings:{...settings,config:{...settings.config,seed:undefined}},days,rows:samples.length,features:FEATURE_NAMES,split:'week-block-5'}));
 return {report:{schemaVersion:1,days,rows:samples.length,datasetFingerprint:fingerprint,teacherPolicy:settings.teacherPolicy,splitCounts,results:[...sums.values()]},samples};
}
export function annualBacktestCsv(report:AnnualBacktestReport):string{
 const columns=['strategy','days','currency','import_cost_eur','export_credit_eur','net_energy_cost_eur','estimated_annual_capacity_cost_eur','total_modeled_cost_eur','requested_kwh','delivered_kwh','shortfall_kwh','ready_vehicles','departed_vehicles','readiness_pct','violation_minutes','excess_kwh','annual_max_1min_peak_kw','annual_max_15min_peak_kw'];
 const quote=(v:unknown)=>'"'+String(v??'').replace(/"/g,'""')+'"';
 return [columns,...report.results.map(r=>[r.name,report.days,'EUR',r.importCost,r.exportCredit,r.energyCost,r.capacityCostEur,r.totalCost,r.requestedKwh,r.deliveredKwh,r.shortfallKwh,r.ready,r.departed,r.readinessPct,r.violationMinutes,r.excessKwh,r.peakKw,r.quarterPeakKw])].map(row=>row.map(quote).join(',')).join('\n');
}
