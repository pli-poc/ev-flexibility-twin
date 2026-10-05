import {fitNeural,neuralPredict,validNeural,clip,quantile,type NeuralNet,type NeuralSample} from './neural';
import {seasonalCases,departureFeatures,arrivalFeatures,energyFeatures,headroomFeatures,type PublicDay,type SpecialistCase} from './specialist-scenario';
export const SPECIALIST_MODEL_KEY='ev-specialist-model-v1';
export const SPECIALIST_REPLAY_KEY='ev-specialist-replay-v1';
export const specialistIds=['departure','arrivals','energy','headroom'] as const;
export type SpecialistId=typeof specialistIds[number];
export type Accuracy={mae:number;baselineMae:number;rmse:number;baselineRmse:number;coverage:number;count:number};
export type Specialist={network:NeuralNet;radius:number[];residuals:number[];validation:Accuracy};
export type PlannerSettings={quantile:number;competition:number;weatherBuffer:number;baselineMargin:number};
export type OperatingPolicy='full'|'planner'|'ems'|'balanced'|'cheap'|'peak'|'total';
export type SpecialistBundle={schema:'ev-specialists/1';fixture:'recurring-patterns/1';seed:number;days:number;trainingSeed:number;validationSeed:number;models:Record<SpecialistId,Specialist>;settings:PlannerSettings;selected:OperatingPolicy;fixed:OperatingPolicy;validation:{policy:OperatingPolicy;score:number;settings:PlannerSettings}[]};
const dimensions={departure:[8,1],arrivals:[8,1],energy:[6,1],headroom:[8,2]} as const;
const scales={departure:[1440],arrivals:[3],energy:[40],headroom:[80,160]} as const;
export type DayPrediction={departures:number[];arrivals:number[];energy:number[];building:number[];solar:number[]};
function samples(cases:SpecialistCase[],id:SpecialistId):NeuralSample[]{return cases.flatMap(c=>{
 const d=c.public;
 if(id==='departure')return c.actual.map(v=>({x:departureFeatures(d,d.declared[v.id]),y:[v.departure/1440]}));
 if(id==='arrivals'){const counts=Array(96).fill(0);for(const v of c.actual)counts[Math.floor(v.arrival/15)]++;return Array.from({length:64},(_,i)=>{const slot=i+24;return {x:arrivalFeatures(d,slot),y:[counts[slot]/3]};});}
 if(id==='energy')return d.bookings.flatMap((count,slot)=>count?[{x:energyFeatures(d,slot),y:[c.actual.filter(v=>Math.floor(d.declared[v.id].arrival/15)===slot).reduce((s,v)=>s+v.need,0)/count/40]}]:[]);
 return Array.from({length:96},(_,s)=>({x:headroomFeatures(d,s),y:[c.building[s]/80,c.solar[s]/160]}));
 });}
function unlearned(id:SpecialistId,x:number[]){if(id==='departure')return [x[0]];if(id==='arrivals')return [x[2]];if(id==='energy')return [(14+10*x[1])/40];return [x[0],x[1]];}
function scaledPrediction(id:SpecialistId,n:NeuralNet,x:number[]){const p=neuralPredict(n,x).map((v,k)=>v*scales[id][k]);if(id==='departure')return [clip(p[0],0,1380)];if(id==='arrivals')return [x[2]+x[3]+x[4]===0?0:clip(p[0],0,4)];if(id==='energy')return [clip(p[0],5,40)];return [clip(p[0],0,80),clip(p[1],0,160)];}
function accuracy(id:SpecialistId,rows:NeuralSample[],model:Specialist):Accuracy{let error=0,baseline=0,squared=0,baselineSquared=0,covered=0,count=0;for(const row of rows){const p=scaledPrediction(id,model.network,row.x),b=unlearned(id,row.x);for(let k=0;k<p.length;k++){const e=p[k]-row.y[k]*scales[id][k],be=(b[k]-row.y[k])*scales[id][k];error+=Math.abs(e);squared+=e*e;baseline+=Math.abs(be);baselineSquared+=be*be;covered+=Math.abs(e)<=model.radius[k]+1e-8?1:0;count++;}}return {mae:error/count,baselineMae:baseline/count,rmse:Math.sqrt(squared/count),baselineRmse:Math.sqrt(baselineSquared/count),coverage:covered/count,count};}
export function trainSpecialists(days=140,seed=42,progress?:(phase:string,done:number,total:number)=>void):SpecialistBundle{
 if(!Number.isInteger(days)||days<14||days>365||!Number.isInteger(seed)||seed<0||seed>100000)throw Error('Invalid specialist training configuration.');
 const trainingSeed=seed,validationSeed=(seed+15401)%100001,training=seasonalCases(days,trainingSeed),validation=seasonalCases(Math.max(28,Math.floor(days/2)),validationSeed),models={} as Record<SpecialistId,Specialist>;
 for(const [i,id] of specialistIds.entries()){
  const tr=samples(training,id),va=samples(validation,id),network=fitNeural(tr,va,seed+i*1009,45,(done,total)=>progress?.(`Training ${id} network`,done,total));
  const errors=va.map(row=>scaledPrediction(id,network,row.x).map((v,k)=>row.y[k]*scales[id][k]-v)),radius=Array.from({length:dimensions[id][1]},(_,k)=>quantile(errors.map(e=>Math.abs(e[k])),.9));
  const specialist:Specialist={network,radius,residuals:id==='departure'?errors.map(e=>e[0]):[],validation:{mae:0,baselineMae:0,rmse:0,baselineRmse:0,coverage:0,count:0}};specialist.validation=accuracy(id,va,specialist);models[id]=specialist;
 }
 return {schema:'ev-specialists/1',fixture:'recurring-patterns/1',seed,days,trainingSeed,validationSeed,models,settings:{quantile:.2,competition:.08,weatherBuffer:.5,baselineMargin:60},selected:'full',fixed:'ems',validation:[]};
}
export function predictDay(d:PublicDay,m:SpecialistBundle,disabled:SpecialistId[]=[]):DayPrediction{
 const enabled=(id:SpecialistId)=>!disabled.includes(id),p:DayPrediction={departures:[],arrivals:[],energy:[],building:[],solar:[]};
 p.departures=d.declared.map(v=>enabled('departure')?clip(scaledPrediction('departure',m.models.departure.network,departureFeatures(d,v))[0],v.arrival+30,1380):v.departure);
 for(let s=0;s<96;s++){
  p.arrivals.push(enabled('arrivals')?scaledPrediction('arrivals',m.models.arrivals.network,arrivalFeatures(d,s))[0]:d.bookings[s]);
  p.energy.push(enabled('energy')?scaledPrediction('energy',m.models.energy.network,energyFeatures(d,s))[0]:14+10*d.fleet[s]);
  const weather=enabled('headroom')?scaledPrediction('headroom',m.models.headroom.network,headroomFeatures(d,s)):[d.building[s],d.solar[s]];p.building.push(weather[0]);p.solar.push(clip(weather[1],0,d.config.solar));
 }return p;
}
/** P(unplug within horizon | still connected), using validation residuals only. */
export function departureProbability(mean:number,now:number,horizon:number,residuals:number[]){const alive=residuals.filter(r=>mean+r>now);return alive.length?alive.filter(r=>mean+r<=now+horizon).length/alive.length:1;}
export function specialistAccuracy(m:SpecialistBundle,cases:SpecialistCase[]){return Object.fromEntries(specialistIds.map(id=>[id,accuracy(id,samples(cases,id),m.models[id])])) as Record<SpecialistId,Accuracy>;}
export function isSpecialistBundle(raw:unknown):raw is SpecialistBundle{
 const m=raw as SpecialistBundle,finite=(x:unknown)=>typeof x==='number'&&Number.isFinite(x);
 if(!m||m.schema!=='ev-specialists/1'||m.fixture!=='recurring-patterns/1'||!Number.isInteger(m.seed)||m.seed<0||m.seed>100000||!Number.isInteger(m.days)||m.days<14||m.days>365||!Number.isInteger(m.trainingSeed)||!Number.isInteger(m.validationSeed)||m.trainingSeed===m.validationSeed||!['full','planner','ems','balanced','cheap','peak','total'].includes(m.selected)||!['ems','balanced','cheap','peak','total'].includes(m.fixed)||!m.settings||![.02,.1,.2,.5].includes(m.settings.quantile)||![0,.08,.2].includes(m.settings.competition)||![0,.5,1].includes(m.settings.weatherBuffer)||![0,60,180].includes(m.settings.baselineMargin)||!Array.isArray(m.validation)||m.validation.length>100||m.validation.some(v=>!v||!Number.isFinite(v.score)||v.score<0||!['full','planner','ems','balanced','cheap','peak','total'].includes(v.policy)||!v.settings||![.02,.1,.2,.5].includes(v.settings.quantile)||![0,.08,.2].includes(v.settings.competition)||![0,.5,1].includes(v.settings.weatherBuffer)||![0,60,180].includes(v.settings.baselineMargin)))return false;
 return specialistIds.every(id=>{const s=m.models?.[id];return !!s&&validNeural(s.network,dimensions[id][0],dimensions[id][1])&&Array.isArray(s.radius)&&s.radius.length===dimensions[id][1]&&s.radius.every(x=>finite(x)&&x>=0&&x<=1440)&&Array.isArray(s.residuals)&&s.residuals.length<=7200&&(id!=='departure'||s.residuals.length>0)&&s.residuals.every(x=>finite(x)&&Math.abs(x)<=1440)&&!!s.validation&&['mae','baselineMae','rmse','baselineRmse','coverage','count'].every(k=>finite(s.validation[k as keyof Accuracy])&&s.validation[k as keyof Accuracy]>=0)&&s.validation.coverage>=0&&s.validation.coverage<=1;});
}
