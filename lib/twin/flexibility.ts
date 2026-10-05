import {simulate, defaults, type Config, type DispatchContext, type DispatchDecision} from './engine';
import {modelDispatch, type Network} from './ml';

export type ProductId='tariff'|'congestion'|'afrr'|'fcr'|'mfrr';
export type Product={id:ProductId;name:string;role:string;minimumKw:number;responseSeconds:number;durationMinutes:number;symmetric:boolean;local:boolean;description:string};
// Educational assumptions, deliberately not live market qualification rules.
export const products:Product[]=[
{id:'tariff',name:'Implicit tariff flexibility',role:'Supplier / BRP',minimumKw:0,responseSeconds:900,durationMinutes:15,symmetric:false,local:false,description:'Avoid expensive intervals without selling a reserve commitment.'},
{id:'congestion',name:'Local congestion relief',role:'Virtual DSO / CSP',minimumKw:100,responseSeconds:300,durationMinutes:15,symmetric:false,local:true,description:'Only delivery behind the requested grid connection counts.'},
{id:'afrr',name:'aFRR',role:'Virtual TSO / BSP / BRP',minimumKw:1000,responseSeconds:300,durationMinutes:15,symmetric:false,local:false,description:'Directional reserve; qualification and availability blocks are separate requirements.'},
{id:'fcr',name:'FCR',role:'Virtual TSO / BSP',minimumKw:1000,responseSeconds:30,durationMinutes:30,symmetric:true,local:false,description:'Symmetric frequency response. This minute-resolution AC simulator cannot demonstrate FCR compliance.'},
{id:'mfrr',name:'mFRR / incident reserve profile',role:'Virtual TSO / BSP',minimumKw:1000,responseSeconds:900,durationMinutes:60,symmetric:false,local:false,description:'Illustrative reserve profile; actual mFRR variants and contract periods must be configured separately.'}
];
export type FlexOptions={product:ProductId;seed:number;start:number;duration:number;requestKw:number;poolSites:number;consent:number;latencySeconds:number;failure:'none'|'fault'|'offline'|'early';connection:string;requestedConnection:string;qualified:boolean;edge:boolean;capacityPrice:number;energyPrice:number;penaltyPrice:number;aggregatorFee:number;reservedKw:number;baselineBias:number};
export const flexDefaults:FlexOptions={product:'congestion',seed:42,start:600,duration:15,requestKw:100,poolSites:10,consent:.8,latencySeconds:60,failure:'none',connection:'NL-DEPOT-A',requestedConnection:'NL-DEPOT-A',qualified:true,edge:false,capacityPrice:8,energyPrice:120,penaltyPrice:200,aggregatorFee:.15,reservedKw:0,baselineBias:0};
export function validateFlex(o:FlexOptions){if(!products.some(p=>p.id===o.product))throw Error('Unknown product');const bounds:Record<string,[number,number]>={seed:[0,100000],start:[0,1439],duration:[1,240],requestKw:[0,20000],poolSites:[1,100],consent:[0,1],latencySeconds:[0,1800],capacityPrice:[0,10000],energyPrice:[0,10000],penaltyPrice:[0,10000],aggregatorFee:[0,1],reservedKw:[0,20000],baselineBias:[-.5,.5]};for(const [key,[min,max]] of Object.entries(bounds)){const v=Number(o[key as keyof FlexOptions]);if(!Number.isFinite(v)||v<min||v>max)throw Error(`Invalid ${key}`);}if(![o.start,o.duration,o.poolSites,o.seed].every(Number.isInteger)||o.start+o.duration>1440)throw Error('Invalid time window or pool');if(!['none','fault','offline','early'].includes(o.failure)||!o.connection||!o.requestedConnection||typeof o.qualified!=='boolean'||typeof o.edge!=='boolean')throw Error('Invalid scenario');}
const round=(v:number)=>Math.round(v*1000)/1000;
export function runFlexibility(o:FlexOptions,model?:Network){
 validateFlex(o);const product=products.find(p=>p.id===o.product)!;
 const config:Config={...defaults,preset:'article',grid:250,solar:0,seed:o.seed};
 const policy=model?modelDispatch(model):(ctx:DispatchContext)=>{let budget=ctx.budget;const decisions:Record<number,DispatchDecision>={};for(const s of [...ctx.available].sort((a,b)=>ctx.vehicles[a.id].departure-ctx.vehicles[b.id].departure||a.id-b.id)){const v=ctx.vehicles[s.id];const power=Math.min(v.maxKw,Math.max(0,v.need-s.delivered)*60/.9,budget);budget-=power;decisions[s.id]={power,reason:'Deterministic departure-priority reference'};}return decisions;};
 const baseline=simulate(config,{dispatch:policy});const window=baseline.frames.slice(o.start,o.start+o.duration);
 const eligible=(id:number)=>((Math.imul(id+1,1103515245)+o.seed)>>>0)/4294967296<o.consent;
 const capacities=window.map(f=>f.cars.filter(s=>eligible(s.id)).reduce((a,s)=>a+s.power,0)*o.poolSites);
 const upward=window.map(f=>Math.max(0,Math.min(f.limit-f.grid,f.cars.filter(s=>eligible(s.id)&&s.status==='Charging').reduce((a,s)=>a+baseline.vehicles[s.id].maxKw-s.power,0)))*o.poolSites);
 const available=Math.max(0,Math.min(...capacities)-o.reservedKw),increase=Math.min(...upward);
 const reasons:string[]=[];
 if(o.product!=='tariff'&&o.requestKw<product.minimumKw)reasons.push(`Below illustrative ${product.minimumKw} kW minimum`);
 if(product.local&&o.connection!==o.requestedConnection)reasons.push('Grid connection does not match congestion location');
 if(o.product!=='tariff'&&!o.qualified)reasons.push('Virtual market qualification missing');
 if(o.duration<product.durationMinutes)reasons.push('Requested duration is shorter than profile endurance');
 if(o.latencySeconds>product.responseSeconds)reasons.push('Control latency exceeds response allowance');
 if(product.symmetric&&increase<o.requestKw)reasons.push('Insufficient symmetric increase headroom');
 if(product.id==='fcr'){if(!o.edge)reasons.push('Local frequency response capability missing');reasons.push('60-second engine cannot verify a 30-second FCR response');}
 if(o.requestKw>available)reasons.push('Insufficient uncommitted, consenting baseline load throughout window');
 const accepted=reasons.length===0&&o.product!=='tariff';
 const actual=simulate(config,{vehicleTransform:vs=>vs.map(v=>({...v,departure:o.failure==='early'&&v.id<4?Math.min(v.departure,o.start+3):v.departure})),dispatch:ctx=>{const d=policy(ctx);const active=accepted&&ctx.time>=o.start+Math.ceil(o.latencySeconds/60)&&ctx.time<o.start+o.duration;let reduction=active?o.requestKw/o.poolSites:0;
 for(const s of [...ctx.available].sort((a,b)=>ctx.vehicles[b.id].departure-ctx.vehicles[a.id].departure)){const v=ctx.vehicles[s.id];const decision=d[s.id]??{power:0,reason:'No policy allocation'};let power=decision.power;
 // Unexpected departure is a physical disconnect, identically applied to both policies.
 if(o.product==='tariff'&&ctx.price>.25){const floor=Math.max(0,v.need-s.delivered)/(Math.max(1,v.departure-ctx.time)*.9)*60;power=Math.min(power,Math.max(1.4,floor));}
 if(o.failure==='fault'&&ctx.time>=o.start+3&&ctx.time<o.start+o.duration&&s.id<2)power=0;
 const offline=o.failure==='offline'&&ctx.time>=o.start+3&&ctx.time<o.start+o.duration;
 if(active&&eligible(s.id)&&!offline){const remaining=Math.max(0,v.need-s.delivered),safeFloor=remaining/(Math.max(1,v.departure-ctx.time)*.9)*60;const reducible=Math.max(0,power-safeFloor);const cut=Math.min(reduction,reducible);power-=cut;reduction-=cut;}
 if(power>0&&power<1.4)power=0; // Simplified AC minimum, with pause/resume.
 d[s.id]={power,reason:active?'Flex activation with departure energy guard':decision.reason};}return d;}});
 const evidence=window.map((b,i)=>{const a=actual.frames[o.start+i];const baselineKw=b.grid*o.poolSites;const settlementBaselineKw=baselineKw*(1+o.baselineBias);const actualKw=a.grid*o.poolSites;const deliveredKw=accepted?Math.max(0,Math.min(o.requestKw,settlementBaselineKw-actualKw)):0;return {minute:b.time,baselineKw:round(baselineKw),settlementBaselineKw:round(settlementBaselineKw),actualKw:round(actualKw),requestedKw:accepted?o.requestKw:0,deliveredKw:round(deliveredKw),shortfallKw:round(accepted?o.requestKw-deliveredKw:0)};});
 const deliveredKwh=evidence.reduce((s,r)=>s+r.deliveredKw/60,0),shortfallKwh=evidence.reduce((s,r)=>s+r.shortfallKw/60,0);
 const capacityRevenue=accepted?o.requestKw/1000*o.duration/60*o.capacityPrice:0,energyRevenue=deliveredKwh/1000*o.energyPrice,penalty=shortfallKwh/1000*o.penaltyPrice,fee=(capacityRevenue+energyRevenue)*o.aggregatorFee;
 const incrementalChargingCost=(actual.final.cost-baseline.final.cost)*o.poolSites;
 return {schemaVersion:'ev-flexibility-report/1',synthetic:true,marketRules:'illustrative-unverified',resolutionSeconds:60,policy:model?'trained-ml':'departure-priority',modelFingerprint:model?.datasetFingerprint??null,options:{...o},product,availableKw:round(available),increaseKw:round(increase),accepted,reasons,evidence,settlement:{capacityRevenue:round(capacityRevenue),energyRevenue:round(energyRevenue),penalty:round(penalty),aggregatorFee:round(fee),incrementalChargingCost:round(incrementalChargingCost),netValue:round(capacityRevenue+energyRevenue-penalty-fee-incrementalChargingCost)},metrics:{deliveredKwh:round(deliveredKwh),shortfallKwh:round(shortfallKwh),departureShortfallKwh:round(actual.final.shortfall*o.poolSites),baselineDepartureShortfallKwh:round(baseline.final.shortfall*o.poolSites),responseDelaySeconds:Math.ceil(o.latencySeconds/60)*60},audit:[{state:'forecast',minute:o.start-15,detail:'Counterfactual policy baseline frozen before activation; no future failure information used in commitment.'},{state:accepted?'committed':o.product==='tariff'?'implicit':'rejected',minute:o.start-5,detail:accepted?'Uncommitted capacity reserved for this single activation':reasons.join('; ')||'No explicit market bid'},{state:'activation',minute:o.start,detail:accepted?'Virtual activation issued':'No market command issued'},{state:'measurement',minute:o.start+o.duration,detail:'Minute-resolution synthetic grid metering; baseline bias shown separately'},{state:'settlement',minute:o.start+o.duration,detail:'Illustrative prices only; shortfalls and incremental charging costs included'}]};
}
