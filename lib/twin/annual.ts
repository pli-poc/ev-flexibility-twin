import {clock,simulate,type Config,type Frame,type Vehicle} from './engine';
import {markets,optimizerDefaults,retail,simulateOptimized,type AdvancedPolicy,type Market,type OptimizerConfig} from './optimizer';
import {FEATURE_NAMES,featureVector,type Sample} from './ml';

export const YEAR_DAYS=365;
export type TeacherPolicy='immediate'|'balanced'|'ems'|AdvancedPolicy;
export type AnnualSettings={config:Config;optimizer:OptimizerConfig;teacherPolicy:TeacherPolicy;seed:number};
export type DatasetProgress={phase:'generate';day:number;total:number;rows:number;season:string};
const hash=(text:string)=>{let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619)>>>0;return h.toString(16).padStart(8,'0');};
export function seasonName(day:number){return day<59||day>=335?'Winter':day<151?'Spring':day<243?'Summer':'Autumn';}
export function annualPreset(day:number){if(day%61===0)return 'fault';if(day%47===0)return 'offline';if(day%29===0)return 'capacity';if(day%21===4)return 'fleet';if((day<59||day>=335))return 'cold';if(day%9===0)return 'cloud';return 'office';}
export function splitForDay(day:number):Sample['split']{const week=Math.floor(day/7),group=week%5;return group===0?'test':group===1?'validation':'train';}
function averagePower(frames:Frame[],vehicleId:number,start:number):number{let total=0,count=0;for(let t=start;t<Math.min(start+15,1440);t++){total+=frames[t].cars[vehicleId]?.power??0;count++;}return count?total/count:0;}
function activeState(state:Frame['cars'][number]){return state.bay>=0&&(state.status==='Charging'||state.status==='Paused');}
export function generateAnnualDataset(settings:AnnualSettings,onProgress?:(p:DatasetProgress)=>void):{samples:Sample[];fingerprint:string;days:number;settings:AnnualSettings}{
 const samples:Sample[]=[],{config,optimizer,teacherPolicy,seed}=settings;
 for(let day=0;day<YEAR_DAYS;day++){
  const preset=annualPreset(day),seasonFactor=1+.08*Math.cos(2*Math.PI*(day-200)/365),annualConfig:Config={...config,preset,policy:'ems',seed:(seed+day*7919)%100001,dayOfYear:day,demand:Math.max(.5,Math.min(2,config.demand*seasonFactor))};
  const market=optimizer.market??'nl';
  const result=['cheap','peak','total'].includes(teacherPolicy)?simulateOptimized(annualConfig,{...optimizer,policy:teacherPolicy as AdvancedPolicy}):simulate({...annualConfig,policy:teacherPolicy as Config['policy']},{price:(t:number)=>retail(market,t),exportPrice:.07});
  const split=splitForDay(day),week=Math.floor(day/7);
  for(let t=0;t<1440;t+=15){const frame=result.frames[t];for(const state of frame.cars){if(!activeState(state))continue;const vehicle=result.vehicles[state.id],target=averagePower(result.frames,state.id,t);samples.push({x:featureVector({time:t,dayOfYear:day,config:annualConfig,vehicle,state,building:frame.building,solar:frame.solar,limit:frame.limit,price:frame.price,batteryKwh:frame.batteryKwh,outdoor:frame.outdoor,irradiance:frame.irradiance}),y:Math.max(0,Math.min(1,target/Math.max(.1,vehicle.maxKw))),day,week,split,vehicleKind:vehicle.kind,scenario:preset});}}
  if(day%5===0||day===YEAR_DAYS-1)onProgress?.({phase:'generate',day:day+1,total:YEAR_DAYS,rows:samples.length,season:seasonName(day)});
 }
 const fingerprint=hash(JSON.stringify({settings:{...settings,config:{...config,seed:undefined},seed},days:YEAR_DAYS,rows:samples.length,features:FEATURE_NAMES,split:'week-block-5'}));
 return {samples,fingerprint,days:YEAR_DAYS,settings};
}
export function annualDatasetCsv(samples:Sample[]):string{
 const head=['year_day','week_block','split','scenario','driver_group','minute_of_day','minute_sin','minute_cos','year_sin','year_cos','outdoor_c','irradiance_ratio','tariff_eur_kwh_scaled','building_kw_scaled','headroom_ratio','battery_soc','vehicle_soc','energy_remaining_ratio','departure_slack_scaled','driver_group_code','flexible_loads','charger_kw_scaled','battery_enabled','teacher_power_ratio'];
 const rows=samples.map(s=>[s.day+1,s.week,s.split,s.scenario,s.vehicleKind,Math.round(Math.atan2(s.x[0],s.x[1])/(2*Math.PI)*1440+1440)%1440,...s.x,s.y]);
 const quote=(v:unknown)=>`"${String(v??'').replace(/"/g,'""')}"`;
 return [head,...rows].map(row=>row.map(quote).join(',')).join('\n');
}
export function annualSummary(samples:Sample[]){const counts={train:0,validation:0,test:0};for(const s of samples)counts[s.split]++;return {rows:samples.length,days:YEAR_DAYS,counts,regions:markets.map(m=>m.name),firstDate:'Synthetic day 001',lastDate:'Synthetic day 365',clock:clock};}
