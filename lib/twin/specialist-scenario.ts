import {defaults,type Config,type Vehicle} from './engine';
import {clip,randomFor} from './neural';
export type SpecialistCondition='normal'|'tight'|'fault'|'offline'|'stale';
export type DriverSignal={id:number;habit:number;trip:number;shift:number};
export type PublicDay={day:number;config:Config;declared:Vehicle[];drivers:DriverSignal[];bookings:number[];trip:number[];fleet:number[];building:number[];solar:number[];cloud:number;activity:number};
export type SpecialistCase={day:number;seed:number;condition:SpecialistCondition;config:Config;public:PublicDay;actual:Vehicle[];building:number[];solar:number[]};
export const specialistConditions:SpecialistCondition[]=['normal','tight','fault','offline','stale'];
const colors=['#b8c8d8','#5cb7a5','#8590bd','#efb36b','#326d8b'];
function daylight(day:number,minute:number){const hours=12+4*Math.cos(2*Math.PI*(day-172)/365),rise=780-hours*30;return clip(Math.sin((minute-rise)/(hours*60)*Math.PI),0,1);}
/** A separate labelled fixture. Ex-ante hints explain recurring patterns but do not expose random truth. */
export function specialistScenario(day:number,seed:number,condition:SpecialistCondition='normal',override?:Config):SpecialistCase{
 const rng=randomFor(seed+day*7919),activity=.7+.5*rng(),cloud=rng(),config:Config=override??{...defaults,seed:seed%100001,dayOfYear:day,preset:condition==='fault'?'fault':condition==='offline'?'offline':'office',grid:condition==='tight'?55:85,solar:condition==='tight'?30:70,chargers:condition==='tight'?12:20,demand:1,battery:false};
 const actual:Vehicle[]=[],declared:Vehicle[]=[],drivers:DriverSignal[]=[],bookings=Array(96).fill(0),trip=Array(96).fill(0),fleet=Array(96).fill(0);
 for(let id=0;id<18;id++){
  const kind:Vehicle['kind']=id<10?'Employee':id<14?'Visitor':'Fleet',habit=id%5/4,distance=8+28*rng(),shift=day%7===4?1:0;
  const nominalArrival=Math.round(kind==='Employee'?480+id*7:kind==='Visitor'?660+(id-10)*75:600+(id-14)*100),nominalDeparture=kind==='Employee'?1050:nominalArrival+(kind==='Fleet'?180:150);
  const arrival=Math.round(clip(nominalArrival+(rng()-.5)*30,420,1150)),early=kind==='Employee'?Math.round(40+habit*260+shift*45):Math.round(habit*45),departure=Math.round(clip(nominalDeparture-early+(rng()-.5)*60,arrival+100,1300));
  const need=Math.round(clip((kind==='Fleet'?13:kind==='Visitor'?4:5)+distance*.45+activity*3+(rng()-.5)*5,5,32)*10)/10;
  const v:Vehicle={id,name:`${kind==='Fleet'?'Van':'EV'} ${String(id+1).padStart(2,'0')}`,kind,arrival,departure,need,initial:20,capacity:kind==='Fleet'?80:60,maxKw:id%7===0?7.4:11,color:colors[id%colors.length]};actual.push(v);declared.push({...v,arrival:nominalArrival,departure:nominalDeparture,need:kind==='Fleet'?24:kind==='Visitor'?10:16});drivers.push({id,habit,trip:distance,shift});
  // A booking is known in advance; actual jitter and actual energy are hidden.
  const slot=Math.floor(nominalArrival/15);bookings[slot]++;trip[slot]+=distance;fleet[slot]+=kind==='Fleet'?1:0;
 }
 for(let s=0;s<96;s++){trip[s]=bookings[s]?trip[s]/bookings[s]:18;fleet[s]=bookings[s]?fleet[s]/bookings[s]:0;}
 const building:number[]=[],solar:number[]=[],forecastBuilding:number[]=[],forecastSolar:number[]=[],weatherNoise=(rng()-.5)*.18,loadNoise=(rng()-.5)*4;
 for(let s=0;s<96;s++){
  const t=s*15+7,light=daylight(day,t),occupied=t>=450&&t<1110,base=(occupied?28+5*Math.sin((t-450)/660*Math.PI):14)*config.demand,cold=6*(1-Math.cos(2*Math.PI*(day-200)/365));
  forecastBuilding.push(base+cold);forecastSolar.push(config.solar*light*.78);
  building.push(clip(base+cold+(occupied?activity*9:1)+loadNoise+1.5*Math.sin(s*.8+seed),0,75));
  solar.push(clip(config.solar*light*(.94-.65*cloud+weatherNoise)+config.solar*.035*light*Math.sin(s*.55+seed),0,config.solar));
 }
 return {day,seed,condition,config,public:{day,config,declared,drivers,bookings,trip,fleet,building:forecastBuilding,solar:forecastSolar,cloud,activity},actual,building,solar};
}
export const seasonalCases=(days:number,seed:number)=>Array.from({length:days},(_,i)=>specialistScenario(Math.floor(i*365/days),seed));
export function departureFeatures(d:PublicDay,v:Vehicle){const s=d.drivers[v.id];return [v.departure/1440,(v.departure-v.arrival)/720,s.habit,s.shift,v.kind==='Employee'?1:0,v.kind==='Fleet'?1:0,Math.sin(d.day/365*2*Math.PI),Math.cos(d.day/365*2*Math.PI)];}
export function arrivalFeatures(d:PublicDay,slot:number){return [Math.sin(slot/96*2*Math.PI),Math.cos(slot/96*2*Math.PI),d.bookings[slot]/3,(d.bookings[slot-1]??0)/3,(d.bookings[slot+1]??0)/3,d.activity,Math.sin(d.day/365*2*Math.PI),Math.cos(d.day/365*2*Math.PI)];}
export function energyFeatures(d:PublicDay,slot:number){return [d.trip[slot]/40,d.fleet[slot],slot>=44&&slot<=62?1:0,d.activity,Math.sin(d.day/365*2*Math.PI),Math.cos(d.day/365*2*Math.PI)];}
export function headroomFeatures(d:PublicDay,slot:number){return [d.building[slot]/80,d.solar[slot]/160,d.cloud,d.activity,Math.sin(slot/96*2*Math.PI),Math.cos(slot/96*2*Math.PI),Math.sin(d.day/365*2*Math.PI),Math.cos(d.day/365*2*Math.PI)];}
