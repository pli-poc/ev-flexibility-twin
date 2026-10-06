import {simulate,type DispatchContext,type DispatchDecision,type Result} from './engine';
import {retail,EXPORT_PRICE} from './optimizer';
import {clip} from './neural';
import {predictDay,type SpecialistBundle} from './specialists';
import {specialistControls} from './specialist-controller';
import type {PublicDay,SpecialistCase} from './specialist-scenario';

export type ServiceSettings={quantile:number;baselineMargin:number;headroomWeight:number;mode:'slack'|'completion';fairShare?:number};
export const serviceSettings:ServiceSettings={quantile:.5,baselineMargin:0,headroomWeight:0,mode:'completion'};
export function validateServiceSettings(s:ServiceSettings){
 if(!s||![.1,.5,.8].includes(s.quantile)||![0,60,180].includes(s.baselineMargin)||![0,1].includes(s.headroomWeight)||!['slack','completion'].includes(s.mode)||(s.fairShare!==undefined&&![0,.25,.5,.75].includes(s.fairShare)))throw Error('Invalid service-controller settings.');
 return {...s};
}
/** Empirical conditional quantile, without re-sorting or changing calibration data. */
function conditionalDeparture(mean:number,now:number,sorted:number[],q:number){
 let lo=0,hi=sorted.length;while(lo<hi){const mid=(lo+hi)>>>1;if(mean+sorted[mid]<=now)lo=mid+1;else hi=mid;}
 const first=lo<sorted.length?lo:Math.max(0,sorted.length-1),last=sorted.length-1;
 const pos=first+q*(last-first),i=Math.floor(pos),fraction=pos-i;
 return mean+sorted[i]*(1-fraction)+sorted[Math.min(last,i+1)]*fraction;
}
/** This interface receives published forecasts and present observations only. */
export function serviceDispatch(d:PublicDay,m:SpecialistBundle,raw:ServiceSettings,learned=true){
 const settings=validateServiceSettings(raw),weather=learned&&settings.headroomWeight>0;
 const prediction=predictDay(d,m,['arrivals','energy',...(!learned?['departure' as const]:[]),...(!weather?['headroom' as const]:[])]);
 const residuals=learned?[...m.models.departure.residuals].sort((a,b)=>a-b):[];
 const declaredEnd=d.declared.map(v=>learned?conditionalDeparture(prediction.departures[v.id],-1,residuals,settings.quantile):v.departure-settings.baselineMargin);
 return (ctx:DispatchContext):Record<number,DispatchDecision>=>{
  const rows=ctx.available.map(s=>{const v=ctx.vehicles[s.id],need=Math.max(0,v.need-s.delivered),deadline=learned?clip(conditionalDeparture(prediction.departures[s.id],ctx.time,residuals,settings.quantile),ctx.time+2,1380):v.departure-settings.baselineMargin,minutes=need/(.9*v.maxKw)*60;
   return {s,v,need,deadline,minutes,slack:deadline-ctx.time-minutes,tier:0};
  });
  if(settings.headroomWeight){
   const connected=new Set(rows.map(r=>r.v.id)),remaining=Array(96).fill(0);
   for(let slot=Math.floor(ctx.time/15);slot<96;slot++){
    const t=slot*15+7,active=rows.filter(r=>r.deadline>t).length,future=d.declared.filter(v=>!connected.has(v.id)&&v.arrival>ctx.time&&v.arrival<=t&&declaredEnd[v.id]>t).length;
    const buffer=weather ? .5*(m.models.headroom.radius[0]+m.models.headroom.radius[1]) : 0;
    remaining[slot]=Math.max(0,d.config.grid-3-prediction.building[slot]+prediction.solar[slot]-buffer)/Math.max(1,active+future);
   }
   for(const r of rows){let opportunity=0;for(let slot=Math.floor(ctx.time/15);slot<Math.ceil(r.deadline/15);slot++){
     const minutes=Math.max(0,Math.min(r.deadline,slot*15+15)-Math.max(ctx.time,slot*15));opportunity+=minutes*Math.min(r.v.maxKw,remaining[slot])/r.v.maxKw;
    }r.slack=(1-settings.headroomWeight)*(r.deadline-ctx.time)+settings.headroomWeight*opportunity-r.minutes;
   }
  }
  if(settings.mode==='completion')for(const r of rows){
   const feasible=r.minutes<=r.deadline-ctx.time+1e-8;
   // Finish a nearly complete feasible request; then protect other feasible targets.
   r.tier=feasible?(r.minutes<=5?0:1):2;
  }
  rows.sort((a,b)=>a.tier-b.tier||(a.tier===2?a.minutes-b.minutes:a.slack-b.slack)||a.v.id-b.v.id);
  let budget=ctx.budget;const output:Record<number,DispatchDecision>={},base:Record<number,number>={};
  if(settings.fairShare){let fairBudget=budget*settings.fairShare,remaining=[...rows];
   while(remaining.length&&fairBudget>1e-8){const share=fairBudget/remaining.length,finished=remaining.filter(r=>Math.min(r.v.maxKw,r.need*60/.9)<=share);
    if(finished.length){for(const r of finished){const power=Math.min(r.v.maxKw,r.need*60/.9);base[r.v.id]=power;fairBudget-=power;budget-=power;}const ids=new Set(finished.map(r=>r.v.id));remaining=remaining.filter(r=>!ids.has(r.v.id));}
    else{if(share>=1.4)for(const r of remaining){base[r.v.id]=share;budget-=share;}break;}
   }
  }
  for(const r of rows){let target=Math.min(r.v.maxKw,r.need*60/.9);
   if(r.slack>150&&ctx.price>.3&&ctx.solar<ctx.building)target=Math.min(target,2.8);
   const allocated=base[r.v.id]??0,wanted=Math.max(0,target-allocated),extra=budget>=1.4||allocated>0||target<1.4?Math.min(wanted,budget):0,power=allocated+extra;budget-=extra;
   output[r.v.id]={power,reason:`${learned?'Forecast-informed':'Unlearned'} service controller · ${r.tier===2?'best effort after feasible targets':r.tier===0&&settings.mode==='completion'?'complete near-finished target':'departure urgency'} · measured headroom`};
  }
  return output;
 };
}
export function serviceRun(c:SpecialistCase,m:SpecialistBundle,settings:ServiceSettings,learned=true):Result{
 return simulate({...c.config,policy:'ems'},{...specialistControls(c),price:t=>retail('nl',t),exportPrice:EXPORT_PRICE,dispatch:serviceDispatch(c.public,m,settings,learned)});
}
/** Counterfactual cost uses actual weather only after the run, never during control. */
export function noEvCost(c:SpecialistCase){
 let cost=0;for(let slot=0;slot<96;slot++){
  const net=c.building[slot]-c.solar[slot];cost+=(Math.max(0,net)*retail('nl',slot*15)-Math.min(40,Math.max(0,-net))*EXPORT_PRICE)/4;
 }return cost;
}
