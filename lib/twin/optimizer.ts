import {clock,simulate,validateConfig,type Config,type DispatchContext,type DispatchDecision,type Result} from './engine';

export type AdvancedPolicy='cheap'|'peak'|'total';
export type Market='nl'|'flanders'|'wallonia'|'brussels';
export type OptimizerConfig={policy:AdvancedPolicy;market:Market;peak:number;existingMonthlyPeakKw?:number;capacityRateEurPerKwMonth?:number};
export const optimizerDefaults:OptimizerConfig={policy:'total',market:'nl',peak:85,existingMonthlyPeakKw:85,capacityRateEurPerKwMonth:0};
export const advancedPolicies=[
 {id:'cheap' as const,name:'Cheapest energy',description:'Ranks available quarter-hours by modeled energy cost; no claim of a global optimum.'},
 {id:'peak' as const,name:'Peak-aware',description:'Spreads charging around a preferred peak; urgency can require exceeding that preference.'},
 {id:'total' as const,name:'Total-cost-aware',description:'A rule-based trade-off between energy price, preferred peak and departure needs.'}
];
export const markets=[{id:'nl' as const,name:'Netherlands'},{id:'flanders' as const,name:'Flanders'},{id:'wallonia' as const,name:'Wallonia'},{id:'brussels' as const,name:'Brussels'}];
export const EXPORT_PRICE=.07;
export function validateOptimizer(raw:unknown):OptimizerConfig{
 const v=raw as OptimizerConfig;
 if(!v||!advancedPolicies.some(p=>p.id===v.policy)||!markets.some(m=>m.id===v.market)||!Number.isFinite(v.peak)||v.peak<0||v.peak>250)throw new Error('Invalid optimizer strategy, market or preferred peak.');
 const existing=v.existingMonthlyPeakKw??v.peak,rate=v.capacityRateEurPerKwMonth??0;
 if(!Number.isFinite(existing)||existing<0||existing>1000||!Number.isFinite(rate)||rate<0||rate>100)throw new Error('Invalid monthly peak baseline or capacity rate.');
 return {policy:v.policy,market:v.market,peak:v.peak,existingMonthlyPeakKw:existing,capacityRateEurPerKwMonth:rate};
}
// Synthetic weekday tariff shapes, excluding VAT. Not sourced prices or customer bills.
export function retail(m:Market,minute:number):number{
 const h=Math.floor(minute/15)/4;
 const wholesale=.075+.055*Math.sin((h-7)/24*Math.PI*2)+.045*Math.exp(-Math.pow((h-19)/2.3,2))-.035*Math.exp(-Math.pow((h-13)/2.5,2));
 const network=m==='wallonia'?((h>=11&&h<17)||h>=22||h<7?.025:.085):m==='brussels'?(h>=7&&h<22?.065:.028):.035;
 return Math.max(.02,wholesale+.095+network);
}
export type OptimizerResult=Result&{optimizer:OptimizerConfig;explanations:Record<number,string>};

/** Connected vehicles only; rebuild each quarter or when the active set changes.
 * Perfect synthetic building/PV forecast; future battery discharge is not assumed.
 * The shared physical engine applies faults, queuing, storage and current import limits.
 */
export function simulateOptimized(input:Config,raw:OptimizerConfig,preparedForecast?:Result):OptimizerResult{
 const c=validateConfig(input),opt=validateOptimizer(raw),price=(t:number)=>retail(opt.market,t);
 const forecast=preparedForecast??simulate({...c,policy:'balanced'},{price,exportPrice:EXPORT_PRICE});
 let signature='',plans:Record<number,Float64Array>={},gaps:Record<number,number>={};
 const dispatch=(ctx:DispatchContext):Record<number,DispatchDecision>=>{
  const key=`${Math.floor(ctx.time/15)}:${ctx.available.map(s=>`${s.id}:${s.bay}`).join(',')}`;
  const requestedNow=ctx.available.reduce((sum,s)=>sum+(plans[s.id]?.[ctx.time]??0),0);
  if(key!==signature||requestedNow>ctx.budget+1e-6){
   signature=key;plans={};gaps={};
   const physical=new Float64Array(1440),preferred=new Float64Array(1440),load=new Float64Array(1440);
   for(let t=ctx.time;t<1440;t++){
    const f=forecast.frames[t],net=f.building-f.solar-f.curtailed;
    physical[t]=Math.max(0,f.limit-3-net);
    preferred[t]=Math.min(physical[t],Math.max(0,opt.peak-3-net));
   }
   // Use measured capacity for the immediate action, including the local battery controller.
   physical[ctx.time]=ctx.budget;
   preferred[ctx.time]=Math.min(ctx.budget,Math.max(0,opt.peak-3-ctx.building+ctx.solar+ctx.batteryPower));
   for(const s of [...ctx.available].sort((a,b)=>ctx.vehicles[a.id].departure-ctx.vehicles[b.id].departure||a.id-b.id)){
    const v=ctx.vehicles[s.id],plan=new Float64Array(1440);plans[v.id]=plan;
    let remaining=Math.max(0,v.need-s.delivered)/.9;
    const candidates:{start:number;end:number;score:number}[]=[];
    for(let start=ctx.time;start<v.departure;){
     const end=Math.min(v.departure,(Math.floor(start/15)+1)*15),f=forecast.frames[start];
     const net=f.building-f.solar-f.curtailed+load[start];
     const marginal=net<0?Math.min(price(start),net< -40?0:EXPORT_PRICE):price(start);
     const score=opt.policy==='peak'?Math.max(0,net)/Math.max(1,opt.peak)+price(start)*.05:opt.policy==='total'?marginal+.4*Math.max(0,net+v.maxKw-opt.peak)/Math.max(1,opt.peak):marginal;
     candidates.push({start,end,score});start=end;
    }
    candidates.sort((a,b)=>a.score-b.score||a.start-b.start);
    const allowed=(t:number)=>!(c.preset==='fault'&&(s.bay===2||s.bay===3)&&t>=600&&t<780)&&!(c.preset==='sleep'&&s.id===31&&t>=660&&t<720);
    const fill=(soft:boolean)=>{
     for(const slot of candidates){
      if(remaining<1e-9)break;
      for(let t=slot.start;t<slot.end&&remaining>1e-9;t++){
       if(!allowed(t))continue;
       const head=soft?Math.min(physical[t],preferred[t]):physical[t];
       const kw=Math.max(0,Math.min(v.maxKw-plan[t],head,remaining*60));
       plan[t]+=kw;physical[t]-=kw;preferred[t]=Math.max(0,preferred[t]-kw);load[t]+=kw;remaining-=kw/60;
      }
     }
    };
    fill(opt.policy!=='cheap');if(remaining>1e-9)fill(false);
    gaps[v.id]=Math.max(0,remaining*.9);
   }
  }
  const output:Record<number,DispatchDecision>={};
  for(const s of ctx.available){
   const v=ctx.vehicles[s.id],plan=plans[s.id],power=plan?.[ctx.time]??0;
   let next=-1;if(plan)for(let t=ctx.time+1;t<v.departure;t++)if(plan[t]>1e-6){next=t;break;}
   const plannedBattery=plan?plan.slice(ctx.time,v.departure).reduce((sum,kw)=>sum+kw*.9/60,0):0;
   const missing=Math.max(0,v.need-s.delivered-plannedBattery);
   const risk=missing>.05;
   output[s.id]={power,reason:risk?`Departure at risk: current plan is ${missing.toFixed(1)} kWh short; charging uses available capacity.`:power>0?`Charging under ${advancedPolicies.find(p=>p.id===opt.policy)!.name.toLowerCase()} scheduling; target achievable under the current forecast.`:`Deferred; ${next>=0?'planned resume '+clock(next):'no further charging slot'} under the current forecast. Rechecked at the next plan update.`};
  }
  return output;
 };
 const result=simulate({...c,policy:'ems'},{price,exportPrice:EXPORT_PRICE,dispatch});
 const explanations:Record<number,string>={};
 for(const v of result.vehicles)explanations[v.id]=`Declared departure ${clock(v.departure)}; ${v.need} kWh requested. Current state and forecast, not a guaranteed future outcome.`;
 return {...result,optimizer:opt,explanations};
}
