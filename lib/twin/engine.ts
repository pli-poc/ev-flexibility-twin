export type Policy = 'ems' | 'balanced' | 'immediate';
export type Config = { preset: string; policy: Policy; grid: number; solar: number; demand: number; battery: boolean; seed: number; chargers: number; flexible: boolean; dayOfYear?:number };
export const defaults: Config = {preset:'office',policy:'ems',grid:100,solar:80,demand:1,battery:false,seed:42,chargers:20,flexible:false,dayOfYear:111};
export const presets = [
 {id:'office',name:'A working day',description:'Employees, visitors and fleet vans share a busy workplace.'},
 {id:'cloud',name:'Clouds over the campus',description:'Solar falls unexpectedly between 12:00 and 15:00.'},
 {id:'cold',name:'Cold morning',description:'Heating demand competes with the morning arrival wave.'},
 {id:'fleet',name:'Fleet turnaround',description:'Vans return between rounds with tight departure deadlines.'},
 {id:'capacity',name:'Restricted connection',description:'Import capacity is restricted to 50 kW from 09:00 to 16:00.'},
 {id:'fault',name:'Charger outage',description:'Chargers 03 and 04 go offline from 10:00 to 13:00.'},
 {id:'offline',name:'EMS connection lost',description:'Remote control is unavailable 10:00–12:00; local limiting continues.'},
 {id:'sleep',name:'Vehicle will not resume',description:'One vehicle stops accepting power at 11:00; support restores it at 12:00.'},
 {id:'impossible',name:'Too much, too soon',description:'High energy requests and short stays expose infeasible promises.'},
 {id:'article',name:'The 20-vehicle example',description:'20 vehicles each request 15 kWh between 09:00 and 17:00.'}
];
export type Vehicle = {id:number;name:string;kind:'Employee'|'Visitor'|'Fleet';arrival:number;departure:number;need:number;initial:number;capacity:number;maxKw:number;color:string};
export type CarState = {id:number;bay:number;parkedAt:number;delivered:number;power:number;status:string;reason:string};
export type Event = {time:number;text:string;type:'info'|'warning'|'success';owner:string};
export type Frame = {time:number;building:number;base:number;hvac:number;task:number;outdoor:number;irradiance:number;solar:number;curtailed:number;grid:number;limit:number;ev:number;batteryPower:number;batteryKwh:number;temp:number;price:number;cars:CarState[];ready:number;departed:number;shortfall:number;cost:number;importKwh:number;exportKwh:number;delivered:number;peak:number;violations:number;excess:number;queue:number;comfort:number;taskEnergy:number};
export type Result = {config:Config;vehicles:Vehicle[];frames:Frame[];events:Event[];final:Frame};
export const clock=(m:number)=>`${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(Math.floor(m%60)).padStart(2,'0')}`;
export const tariff=(t:number)=>t<420?.16:t<600?.32:t<960?.19:t<1200?.36:.18;
function rng(seed:number){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
export function vehiclesFor(c:Config):Vehicle[]{const random=rng(c.seed);const colors=['#b8c8d8','#d9dbcf','#326d8b','#efb36b','#5cb7a5','#8590bd'];const list:Vehicle[]=[];const add=(kind:Vehicle['kind'],arrival:number,departure:number,need:number)=>{let id=list.length;list.push({id,name:`${kind==='Fleet'?'Van':'EV'} ${String(id+1).padStart(2,'0')}`,kind,arrival,departure,need,initial:kind==='Fleet'?18:20,capacity:kind==='Fleet'?80:60,maxKw:id%7===0?7.4:11,color:colors[id%colors.length]});};
 if(c.preset==='article'){for(let i=0;i<20;i++)add('Employee',540,1020,15);list.forEach(v=>v.maxKw=11);return list;}
 for(let i=0;i<16;i++){const a=450+Math.floor(random()*110);add('Employee',a,960+Math.floor(random()*150),12+Math.round(random()*14));}
 for(let i=0;i<12;i++){const a=550+Math.floor(random()*380);add('Visitor',a,a+70+Math.floor(random()*100),6+Math.round(random()*10));}
 for(let i=0;i<(c.preset==='fleet'?12:5);i++){const a=620+Math.floor(random()*160);add('Fleet',a,a+90+Math.floor(random()*50),18+Math.round(random()*12));}
 if(c.preset==='impossible')list.forEach(v=>{v.need=35;v.departure=v.arrival+75;});
 return list;
}
export function validateConfig(raw:unknown):Config {const c=raw as Config;if(!c||!presets.some(p=>p.id===c.preset)||!['ems','balanced','immediate'].includes(c.policy)||!Number.isFinite(c.grid)||c.grid<20||c.grid>250||!Number.isFinite(c.solar)||c.solar<0||c.solar>160||!Number.isFinite(c.demand)||c.demand<.5||c.demand>2||!Number.isInteger(c.seed)||c.seed<0||c.seed>100000||!Number.isInteger(c.chargers)||c.chargers<4||c.chargers>20||typeof c.battery!=='boolean'||typeof c.flexible!=='boolean'||(c.dayOfYear!==undefined&&(!Number.isInteger(c.dayOfYear)||c.dayOfYear<0||c.dayOfYear>364)))throw new Error('Invalid scenario. Check capacity, solar, demand, seed, date and charger values.');return {...c};}
// All strategies execute through the same vehicle, site, storage and fault model.
export type DispatchContext = {
 time:number; vehicles:Vehicle[]; available:CarState[]; budget:number;
 building:number; solar:number; batteryPower:number; batteryKwh:number; limit:number; price:number; outdoor:number; irradiance:number; config:Config;
};
export type DispatchDecision = {power:number;reason:string};
export type SimulationOptions = {
 price?:(minute:number)=>number;
 exportPrice?:number;
 vehicleTransform?:(vehicles:Vehicle[])=>Vehicle[];
 declaredVehicles?:Vehicle[];
 communicationUnavailable?:(minute:number)=>boolean;
 powerTransform?:(context:DispatchContext,powers:Record<number,DispatchDecision>)=>Record<number,DispatchDecision>;
 dispatch?:(context:DispatchContext)=>Record<number,DispatchDecision>;
};
export function simulate(input:Config,options:SimulationOptions={}):Result{
 const price=options.price??tariff,exportPrice=options.exportPrice??.07;
 const c=validateConfig(input),vehicles=options.vehicleTransform?options.vehicleTransform(vehiclesFor(c)):vehiclesFor(c),events:Event[]=[],frames:Frame[]=[],cars:CarState[]=vehicles.map(v=>({id:v.id,bay:-1,parkedAt:-1,delivered:0,power:0,status:'Expected',reason:'Not on site yet'}));
 const observedVehicles=options.declaredVehicles??vehicles;
 let battery=50,temp=21,ready=0,departed=0,shortfall=0,cost=0,importKwh=0,exportKwh=0,delivered=0,peak=0,violations=0,excess=0,comfort=0,taskEnergy=0;
 const emit=(time:number,text:string,type:Event['type']='info',owner='Charging operator')=>events.push({time,text,type,owner});
 for(let t=0;t<1440;t++){
  for(const v of vehicles){const s=cars[v.id];s.power=0;if(t===v.departure){s.status='Departed';departed++;const gap=Math.max(0,v.need-s.delivered);shortfall+=gap;if(gap<.05)ready++;emit(t,`${v.name} departed · ${gap<.05?'target met':gap.toFixed(1)+' kWh short'}`,gap<.05?'success':'warning');}
   if(t===v.arrival){s.status='Queued';s.reason='Waiting for a free charging space';emit(t,`${v.name} arrived · ${v.need} kWh requested · leaves ${clock(v.departure)}`);}}
  // Departure releases a space. Parking movements take two simulated minutes.
  const used=new Set(cars.filter(s=>s.status!=='Expected'&&s.status!=='Departed'&&s.bay>=0).map(s=>s.bay));
  const waiting=cars.filter(s=>s.status==='Queued').sort((a,b)=>vehicles[a.id].arrival-vehicles[b.id].arrival||a.id-b.id);
  for(const s of waiting){let b=0;while(used.has(b)&&b<c.chargers)b++;if(b>=c.chargers)break;s.bay=b;s.parkedAt=t;used.add(b);s.status='Arriving';s.reason='Driving to assigned charger';}
  const seasonal=c.dayOfYear===undefined?null:c.dayOfYear;
  const daylightHours=seasonal===null?14:Math.round((12+4*Math.cos(2*Math.PI*(seasonal-172)/365))*10)/10;
  const sunrise=780-daylightHours*30;
  const daylight=Math.max(0,Math.sin((t-sunrise)/(daylightHours*60)*Math.PI));
  const cloudFactor=c.preset==='cloud'&&t>=720&&t<900?.2:1;
  const irradiance=1000*daylight*cloudFactor;
  let solar=Math.min(c.solar*.875,c.solar*(irradiance/1000)*.88);
  const occupied=t>=450&&t<1110;
  const base=(occupied?23+5*Math.sin((t-450)/660*Math.PI):13)*c.demand;
  const cold=c.preset==='cold';
  const seasonalMean=seasonal===null?(cold?2:13):9+8*Math.cos(2*Math.PI*(seasonal-200)/365)-(cold?6:0);
  const outdoor=seasonalMean+(seasonal===null?5:4)*daylight;
  const internalHeat=occupied?3:1;
  const targetTemp=occupied?(c.flexible&&price(t)>.3?20:21):18;
  // Single-zone heat balance. Effective envelope loss scales with building demand.
  const thermalResistance=.3/c.demand;
  let hvac=Math.max(0,Math.min(35*c.demand,((targetTemp-outdoor)/thermalResistance-internalHeat+(targetTemp-temp)*24)/3));
  temp+=((outdoor-temp)/thermalResistance+internalHeat+hvac*3)/28/60;
  if(occupied)comfort+=(Math.max(0,20-temp)+Math.max(0,temp-25))/60;
  let task=t>=600&&t<720?10*c.demand:0;
  if(c.flexible)task=t>=720&&t<960&&taskEnergy<20*c.demand?Math.min(10*c.demand,(20*c.demand-taskEnergy)*60):0;
  taskEnergy+=task/60;
  const building=base+hvac+task,limit=c.preset==='capacity'&&t>=540&&t<960?Math.min(50,c.grid):c.grid;
  let bp=0;
  // Storage starts at 50 kWh and never discharges below that boundary; comparison has no free initial depletion.
  if(c.battery){if(solar>building)bp=-Math.min(50,solar-building,(90-battery)*60/.95);else if(building>limit-5)bp=Math.min(50,building-limit+5,(battery-50)*60*.95);}
  const eligible=cars.filter(s=>s.bay>=0&&s.status!=='Departed'&&t>=s.parkedAt+2&&t<vehicles[s.id].departure&&s.delivered<vehicles[s.id].need-.00001);
  const faulty=(s:CarState)=>c.preset==='fault'&&(s.bay===2||s.bay===3)&&t>=600&&t<780;
  const sleeping=(s:CarState)=>c.preset==='sleep'&&s.id===31&&t>=660&&t<720;
  const available=eligible.filter(s=>!faulty(s)&&!sleeping(s));
  const offline=(c.preset==='offline'&&t>=600&&t<720)||(options.communicationUnavailable?.(t)??false);
  const policy=offline?'balanced':c.policy;
  let budget=policy==='immediate'?1e6:Math.max(0,limit-3-building+solar+bp);
  if(c.battery&&available.length&&bp>=0){const wanted=Math.min(available.length*8,80);const extra=Math.min(50-bp,Math.max(0,wanted-budget),(battery-50)*60*.95-bp);if(extra>0){bp+=extra;budget+=extra;}}
  const custom=options.dispatch&&!offline?options.dispatch({time:t,vehicles:observedVehicles,available,budget,building,solar,batteryPower:bp,batteryKwh:battery,limit,price:price(t),outdoor,irradiance,config:c}):undefined;
  const cap=(s:CarState)=>Math.min(vehicles[s.id].maxKw,(vehicles[s.id].need-s.delivered)*60/.9);
  if(custom){
   // A planner requests power; the physical controller enforces current headroom.
   const ordered=[...available].sort((a,b)=>observedVehicles[a.id].departure-observedVehicles[b.id].departure||a.id-b.id);
   for(const s of ordered){const want=custom[s.id]?.power??0;s.power=Math.min(cap(s),Math.max(0,Number.isFinite(want)?want:0),budget);budget-=s.power;}
  }else if(policy==='balanced'){
   let rem=[...available].sort((a,b)=>((a.id+Math.floor(t/10))%vehicles.length)-((b.id+Math.floor(t/10))%vehicles.length));
   while(rem.length&&budget>1e-8){const share=budget/rem.length;let progressed=false;for(const s of [...rem]){if(cap(s)<=share){s.power=cap(s);budget-=s.power;rem=rem.filter(x=>x!==s);progressed=true;}}
    if(!progressed){if(share>=1.4){rem.forEach(s=>s.power=share);budget=0;}else{for(const s of rem){if(budget<1.4)break;s.power=Math.min(cap(s),budget,vehicles[s.id].maxKw);budget-=s.power;}break;}}}
  }else{
   const slack=(s:CarState)=>observedVehicles[s.id].departure-t-(vehicles[s.id].need-s.delivered)/(.9*vehicles[s.id].maxKw)*60;
   const ordered=[...available].sort((a,b)=>policy==='ems'?slack(a)-slack(b)||a.id-b.id:a.id-b.id);
   for(const s of ordered){let target=cap(s);if(policy==='ems'&&slack(s)>150&&price(t)>.3&&solar<building)target=Math.min(target,2.8);if(budget>=1.4||target<1.4){s.power=Math.min(target,budget);budget-=s.power;}}
  }
  if(options.powerTransform){
   const planned:Record<number,DispatchDecision>={};for(const s of available)planned[s.id]={power:s.power,reason:custom?.[s.id]?.reason??'Strategy allocation'};
   const adjusted=options.powerTransform({time:t,vehicles:observedVehicles,available,budget:Math.max(0,limit-3-building+solar+bp),building,solar,batteryPower:bp,batteryKwh:battery,limit,price:price(t),outdoor,irradiance,config:c},planned);
   for(const s of available){const v=adjusted[s.id];if(v&&Number.isFinite(v.power)){s.power=Math.min(s.power,Math.max(0,v.power));s.reason=v.reason;if(custom)custom[s.id]={power:s.power,reason:v.reason};}}
  }
  for(const s of eligible){const v=vehicles[s.id];if(faulty(s)){s.status='Fault';s.reason='Charger unavailable until 13:00';}else if(sleeping(s)){s.status='Sleeping';s.reason='Vehicle not accepting power · recovery 12:00';}else{s.status=s.power>0?'Charging':'Paused';s.reason=custom?.[s.id]?.reason??(s.power>0?(policy==='ems'?'Allocated by departure urgency and site headroom':policy==='balanced'?'Fair share of current site headroom':'Immediate maximum charging'):'Waiting for available site capacity');}const add=s.power*.9/60;s.delivered+=add;delivered+=add;if(s.delivered>=v.need-.00001){s.status='Ready';s.reason='Requested energy delivered · parked until departure';}}
  for(const s of cars){const v=vehicles[s.id];if(t>=s.parkedAt+2&&s.parkedAt>=0&&t<v.departure&&s.delivered>=v.need-.00001)s.status='Ready';}
  const ev=cars.reduce((a,s)=>a+s.power,0);
  if(bp<0)battery+=-bp*.95/60;else battery-=bp/.95/60;
  const raw=building+ev-solar-bp,curtailed=Math.max(0,-raw-40);solar-=curtailed;const grid=raw+curtailed;
  importKwh+=Math.max(0,grid)/60;exportKwh+=Math.max(0,-grid)/60;cost+=(Math.max(0,grid)*price(t)-Math.max(0,-grid)*exportPrice)/60;peak=Math.max(peak,grid);
  if(grid>limit+.0001){violations++;excess+=(grid-limit)/60;}
  if(t===600&&c.preset==='fault')emit(t,'Chargers 03 & 04 unavailable · service visit in progress','warning');
  if(t===780&&c.preset==='fault')emit(t,'Chargers 03 & 04 restored','success');
  if(t===600&&offline)emit(t,'Remote EMS offline · local load balancing active','warning','EMS support');
  if(t===660&&options.communicationUnavailable?.(t))emit(t,'Telemetry stale · local load balancing active','warning','EMS support');
  if(t===690&&options.communicationUnavailable?.(t-1))emit(t,'Telemetry restored · planning resumed','success','EMS support');
  if(t===720&&c.preset==='offline')emit(t,'Remote EMS restored','success','EMS support');
  if(t===660&&c.preset==='sleep')emit(t,'Van 32 stopped accepting power · support notified','warning');
  if(t===720&&c.preset==='sleep')emit(t,'Van 32 recovery attempted at departure','success');
  if(t===720&&c.preset==='cloud')emit(t,'Solar below forecast · charging allocations revised','warning','Facility manager');
  if(t===540&&c.preset==='capacity')emit(t,'Site import allowance reduced to 50 kW','warning','Facility manager');
  for(const s of eligible){const v=vehicles[s.id];if(t===v.departure-30&&s.delivered<v.need-.1)emit(t,`${v.name} leaves in 30 min · ${(v.need-s.delivered).toFixed(1)} kWh still needed`, 'warning');}
  frames.push({time:t,building,base,hvac,task,outdoor,irradiance,solar,curtailed,grid,limit,ev,batteryPower:bp,batteryKwh:battery,temp,price:price(t),cars:cars.map(s=>({...s})),ready,departed,shortfall,cost,importKwh,exportKwh,delivered,peak,violations,excess,queue:cars.filter(s=>s.status==='Queued').length,comfort,taskEnergy});
 }
 return{config:c,vehicles,frames,events,final:frames[1439]};
}
