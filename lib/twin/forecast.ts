/** Standalone synthetic depot experiment. No ChargeWeave or market settlement. */
export type DemandDay={day:number;seed:number;features:number[];energy:number[]};
export type ForecastModel={version:1;k:number;training:DemandDay[];validationMae:number;baselineMae:number;radius:number};
export type ForecastRun={mode:string;cost:number;unmet:number;delivered:number;violations:number;mae:number;actual:number[];forecast:number[];load:number[]};
const slots=96;
function rng(seed:number){let a=seed|0;return()=>{a+=0x6D2B79F5;let t=Math.imul(a^a>>>15,1|a);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};}
export function demandDay(day:number,seed:number):DemandDay{
 const r=rng(seed*1009+day*9176),weekday=day%7,season=Math.sin(day/365*2*Math.PI),temperature=12+10*season+(r()-.5)*12;
 // Booking signal is observed before the day; actual attendance retains independent noise.
 const bookings=.3+r()*.7,attendance=Math.max(.1,bookings+(r()-.5)*.3),energy=Array(slots).fill(0);
 for(let t=24;t<72;t++){const h=t/4,shape=Math.exp(-1*((h-8.5)/1.8)**2)+.5*Math.exp(-1*((h-13)/2)**2);const expected=shape*(weekday<5?26:12)*attendance*(1+Math.max(0,12-temperature)*.025);energy[t]=r()<.15?0:Math.max(0,expected*(.5+r()));}
 return {day,seed,features:[weekday/6,Math.sin(day/365*2*Math.PI),Math.cos(day/365*2*Math.PI),temperature/25,bookings],energy};
}
export function predictDemand(training:DemandDay[],target:Pick<DemandDay,'day'|'features'>,k?:number):number[]{
 let selected:DemandDay[];
 if(k){selected=[...training].sort((a,b)=>distance(a.features,target.features)-distance(b.features,target.features)).slice(0,k);}
 else {selected=training.filter(a=>(a.day%7<5)===(target.day%7<5)&&Math.floor(a.day/91)===Math.floor(target.day/91));if(!selected.length)selected=training;}
 return Array.from({length:slots},(_,t)=>selected.reduce((s,d)=>s+d.energy[t],0)/Math.max(1,selected.length));
}
function distance(a:number[],b:number[]){return a.reduce((s,x,i)=>s+(x-b[i])**2,0);}
function mae(a:number[],b:number[]){return a.reduce((s,x,i)=>s+Math.abs(x-b[i]),0)/a.length;}
export function trainForecast(days=365,seed=42):ForecastModel{
 const training=Array.from({length:days},(_,i)=>demandDay(Math.floor(i*365/days),seed));
 const validation=Array.from({length:days},(_,i)=>demandDay(Math.floor(i*365/days),seed+7919));
 let k=3,best=Infinity;for(const candidate of [3,7,15,31]){const error=validation.reduce((s,d)=>s+mae(d.energy,predictDemand(training,d,candidate)),0)/days;if(error<best){best=error;k=candidate;}}
 const residuals=validation.flatMap(d=>{const p=predictDemand(training,d,k);return d.energy.slice(24,72).map((x,i)=>Math.abs(x-p[i+24]));}).sort((a,b)=>a-b);
 return {version:1,k,training,radius:residuals[Math.ceil(.9*residuals.length)-1],validationMae:best,baselineMae:validation.reduce((s,d)=>s+mae(d.energy,predictDemand(training,d)),0)/days};
}
export function slotCapacity(t:number){const h=t/4;return 15+8*Math.exp(-1*((h-13)/3)**2);}
export function slotPrice(t:number){const h=t/4;return .18+.18*Math.exp(-1*((h-18)/2)**2)-.09*Math.exp(-1*((h-12)/2)**2);}
/** Same reservation planner for all forecasts. It only receives actual arrivals up to now. */
export function runForecast(day:DemandDay,forecast:number[],mode:string):ForecastRun{
 const jobs:{deadline:number;remaining:number}[]=[],load=Array(slots).fill(0);let cost=0,unmet=0,delivered=0,violations=0;
 for(let now=0;now<slots;now++){
  for(const job of jobs)if(job.deadline===now){unmet+=job.remaining;job.remaining=0;}
  if(day.energy[now]>0)jobs.push({deadline:Math.min(slots,now+16),remaining:day.energy[now]});
  const free=Array.from({length:slots},(_,t)=>t<now?0:slotCapacity(t));
  // Reserve future capacity for predicted arrivals, then plan observed jobs.
  for(let arrival=now+1;arrival<Math.min(slots,now+16);arrival++){
   let remaining=forecast[arrival];const choices=Array.from({length:Math.min(16,slots-arrival)},(_,i)=>arrival+i).sort((a,b)=>slotPrice(a)-slotPrice(b)||a-b);
   for(const t of choices){const take=Math.min(free[t],remaining);free[t]-=take;remaining-=take;}
  }
  let allocated=0;for(const job of jobs.filter(j=>j.remaining>0).sort((a,b)=>a.deadline-b.deadline)){
   let remaining=job.remaining;const choices=Array.from({length:job.deadline-now},(_,i)=>now+i).sort((a,b)=>slotPrice(a)-slotPrice(b)||a-b);
   let current=0;for(const t of choices){const take=Math.min(free[t],remaining);free[t]-=take;remaining-=take;if(t===now)current+=take;}
   job.remaining-=current;allocated+=current;
  }
  load[now]=allocated;delivered+=allocated;cost+=allocated*slotPrice(now);if(allocated>slotCapacity(now)+1e-7)violations++;
 }
 unmet+=jobs.reduce((s,j)=>s+j.remaining,0);
 return {mode,cost,unmet,delivered,violations,mae:mae(day.energy,forecast),actual:day.energy,forecast,load};
}
export function benchmarkForecast(model:ForecastModel,days=365,seed=104771){
 const rows=Array.from({length:days},(_,i)=>{const day=demandDay(Math.floor(i*365/days),seed);return {day:day.day,runs:[runForecast(day,predictDemand(model.training,day),'Historical average'),runForecast(day,predictDemand(model.training,day,model.k),'Learned forecast'),runForecast(day,day.energy,'Perfect forecast reference')]};});
 const totals=rows[0].runs.map((r,j)=>({mode:r.mode,cost:rows.reduce((s,d)=>s+d.runs[j].cost,0),unmet:rows.reduce((s,d)=>s+d.runs[j].unmet,0),delivered:rows.reduce((s,d)=>s+d.runs[j].delivered,0),violations:rows.reduce((s,d)=>s+d.runs[j].violations,0),mae:rows.reduce((s,d)=>s+d.runs[j].mae,0)/days}));
 const coverage=rows.reduce((s,d)=>s+d.runs[1].actual.slice(24,72).filter((x,i)=>Math.abs(x-d.runs[1].forecast[i+24])<=model.radius).length,0)/(days*48);
 return {seed,days,rows,totals,coverage};
}
