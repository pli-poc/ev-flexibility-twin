import type {Config,DispatchContext,DispatchDecision,Frame,Vehicle,CarState} from './engine';

export const ML_MODEL_STORAGE_KEY='future-ev-energy-twin-ai-ems-ml-v1';
export const ML_MODEL_SCHEMA=1;
export const FEATURE_NAMES=['minute_sin','minute_cos','year_sin','year_cos','outdoor_c','irradiance','tariff_eur_kwh','building_kw','headroom_ratio','battery_soc','vehicle_soc','energy_remaining_ratio','departure_slack_min','driver_group','flexible_loads','charger_kw','battery_enabled'];
export type Sample={x:number[];y:number;day:number;week:number;split:'train'|'validation'|'test';vehicleKind:string;scenario:string};
export type Network={schemaVersion:number;algorithm:'compact-mlp-v1';createdAt:string;teacherPolicy:string;market:string;days:number;rowCount:number;trainRows:number;validationRows:number;testRows:number;features:string[];hiddenUnits:number;weightsInputHidden:number[];biasHidden:number[];weightsHiddenOutput:number[];biasOutput:number;epochs:number;seed:number;metrics:{trainMae:number;validationMae:number;testMae:number;testRmse:number;testActionAgreement:number};datasetFingerprint:string};
export type FeatureInput={time:number;dayOfYear:number;config:Config;vehicle:Vehicle;state:CarState;building:number;solar:number;limit:number;price:number;batteryKwh:number;outdoor:number;irradiance:number};
const clamp=(n:number,low:number,high:number)=>Math.max(low,Math.min(high,n));
export function featureVector(i:FeatureInput):number[]{
 const {vehicle:v,state:s,config:c}=i,minute=i.time%1440,day=i.dayOfYear;
 const remaining=Math.max(0,v.need-s.delivered),chargeHours=remaining/(Math.max(.1,v.maxKw)*.9)*60;
 const slack=v.departure-i.time-chargeHours,headroom=Math.max(0,i.limit-i.building+i.solar);
 return [Math.sin(2*Math.PI*minute/1440),Math.cos(2*Math.PI*minute/1440),Math.sin(2*Math.PI*day/365),Math.cos(2*Math.PI*day/365),clamp((i.outdoor+10)/45,0,1),clamp(i.irradiance/1000,0,1),clamp(i.price/.75,0,1),clamp(i.building/180,0,1),clamp(headroom/150,0,1),c.battery?clamp(i.batteryKwh/100,0,1):0,clamp((v.initial+s.delivered)/Math.max(1,v.capacity),0,1),clamp(remaining/Math.max(1,v.need),0,1),clamp((slack+360)/720,0,1),v.kind==='Employee'?0:v.kind==='Visitor'?.5:1,Number(c.flexible),clamp(v.maxKw/22,0,1),Number(c.battery)];
}

export function sampleFeatures(sample:Sample):number[]{return sample.x;}
function sigmoid(n:number):number{return 1/(1+Math.exp(-clamp(n,-20,20)));}
export function predictPower(model:Network,x:number[]):number{
 if(model.schemaVersion!==ML_MODEL_SCHEMA||model.algorithm!=='compact-mlp-v1'||x.length!==FEATURE_NAMES.length||model.hiddenUnits<1||model.weightsInputHidden.length!==x.length*model.hiddenUnits||model.biasHidden.length!==model.hiddenUnits||model.weightsHiddenOutput.length!==model.hiddenUnits)throw new Error('Unsupported or invalid EMS model package.');
 const h=new Array<number>(model.hiddenUnits);for(let j=0;j<model.hiddenUnits;j++){let z=model.biasHidden[j];for(let i=0;i<x.length;i++)z+=x[i]*model.weightsInputHidden[i*model.hiddenUnits+j];h[j]=Math.max(0,z);}
 let out=model.biasOutput;for(let j=0;j<h.length;j++)out+=h[j]*model.weightsHiddenOutput[j];return clamp(sigmoid(out),0,1);
}
export function modelDispatch(model:Network):(ctx:DispatchContext)=>Record<number,DispatchDecision>{
 return ctx=>{const output:Record<number,DispatchDecision>={};for(const state of ctx.available){const vehicle=ctx.vehicles[state.id];const x=featureVector({time:ctx.time,dayOfYear:ctx.config.dayOfYear??172,config:ctx.config,vehicle,state,building:ctx.building,solar:ctx.solar,limit:ctx.limit,price:ctx.price,batteryKwh:ctx.batteryKwh,outdoor:ctx.outdoor,irradiance:ctx.irradiance});const power=predictPower(model,x)*vehicle.maxKw;output[state.id]={power,reason:`Learned ${model.teacherPolicy} charging preference · ${(power/Math.max(.1,vehicle.maxKw)*100).toFixed(0)}% of vehicle AC limit; physical headroom and charger limits still apply.`};}return output;};
}

export type FitProgress={epoch:number;epochs:number;trainMse:number;validationMse:number};
export function fitNetwork(train:Sample[],validation:Sample[],options:{epochs?:number;seed?:number;hiddenUnits?:number;onProgress?:(p:FitProgress)=>void}={}):Pick<Network,'hiddenUnits'|'weightsInputHidden'|'biasHidden'|'weightsHiddenOutput'|'biasOutput'|'epochs'|'seed'>{
 const epochs=options.epochs??32,seed=options.seed??1337,hidden=options.hiddenUnits??10,inputSize=FEATURE_NAMES.length;
 if(train.length<20||validation.length<10)throw new Error('The grouped split needs at least 20 training and 10 validation examples.');
 let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const scale=.22;const w1=Array.from({length:inputSize*hidden},()=>((random()*2)-1)*scale),b1=new Array(hidden).fill(.01),w2=Array.from({length:hidden},()=>((random()*2)-1)*scale);let b2=0;
 const params=[...w1,...b1,...w2,b2],m=new Array(params.length).fill(0),v=new Array(params.length).fill(0);let step=0;
 const forward=(x:number[])=>{const h=new Array(hidden);for(let j=0;j<hidden;j++){let z=b1[j];for(let i=0;i<inputSize;i++)z+=x[i]*w1[i*hidden+j];h[j]=Math.max(0,z);}let out=b2;for(let j=0;j<hidden;j++)out+=h[j]*w2[j];return {h,y:sigmoid(out)};};
 const mse=(rows:Sample[])=>{let sum=0;for(const r of rows){const e=forward(r.x).y-r.y;sum+=e*e;}return sum/rows.length;};
 const batchSize=128;
 for(let epoch=1;epoch<=epochs;epoch++){
  const order=Array.from({length:train.length},(_,i)=>i);for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
  for(let start=0;start<order.length;start+=batchSize){const size=Math.min(batchSize,order.length-start),g1=new Array(w1.length).fill(0),gb1=new Array(hidden).fill(0),g2=new Array(hidden).fill(0);let gb2=0;
   for(let n=0;n<size;n++){const row=train[order[start+n]],{h,y}=forward(row.x),dy=2*(y-row.y)*y*(1-y)/size;gb2+=dy;for(let j=0;j<hidden;j++){g2[j]+=dy*h[j];const dz=dy*w2[j]*(h[j]>0?1:0);gb1[j]+=dz;for(let i=0;i<inputSize;i++)g1[i*hidden+j]+=dz*row.x[i];}}
   const grad=[...g1,...gb1,...g2,gb2];step++;for(let i=0;i<params.length;i++){const gi=grad[i];m[i]=.9*m[i]+.1*gi;v[i]=.999*v[i]+.001*gi*gi;const mh=m[i]/(1-Math.pow(.9,step)),vh=v[i]/(1-Math.pow(.999,step));params[i]-=.012*mh/(Math.sqrt(vh)+1e-8);}
   let at=0;for(let i=0;i<w1.length;i++)w1[i]=params[at++];for(let i=0;i<b1.length;i++)b1[i]=params[at++];for(let i=0;i<w2.length;i++)w2[i]=params[at++];b2=params[at];
  }
  options.onProgress?.({epoch,epochs,trainMse:mse(train),validationMse:mse(validation)});
 }
 return {hiddenUnits:hidden,weightsInputHidden:w1,biasHidden:b1,weightsHiddenOutput:w2,biasOutput:b2,epochs,seed};
}
export function evaluateModel(model:Network,rows:Sample[]){let abs=0,sq=0,agreement=0;for(const r of rows){const p=predictPower(model,r.x),e=p-r.y;abs+=Math.abs(e);sq+=e*e;if((p>=.12)===(r.y>=.12))agreement++;}return {mae:rows.length?abs/rows.length:0,rmse:rows.length?Math.sqrt(sq/rows.length):0,actionAgreement:rows.length?agreement/rows.length:0};}
export function isNetwork(value:unknown):value is Network{const n=value as Network;return Boolean(n&&n.schemaVersion===ML_MODEL_SCHEMA&&n.algorithm==='compact-mlp-v1'&&Array.isArray(n.features)&&n.features.length===FEATURE_NAMES.length&&n.features.every((f,i)=>f===FEATURE_NAMES[i])&&Number.isInteger(n.hiddenUnits)&&n.hiddenUnits>0&&Array.isArray(n.weightsInputHidden)&&n.weightsInputHidden.length===FEATURE_NAMES.length*n.hiddenUnits&&n.weightsInputHidden.every(Number.isFinite)&&Array.isArray(n.biasHidden)&&n.biasHidden.length===n.hiddenUnits&&n.biasHidden.every(Number.isFinite)&&Array.isArray(n.weightsHiddenOutput)&&n.weightsHiddenOutput.length===n.hiddenUnits&&n.weightsHiddenOutput.every(Number.isFinite)&&Number.isFinite(n.biasOutput)&&Boolean(n.metrics)&&Number.isFinite(n.metrics.testMae));}
