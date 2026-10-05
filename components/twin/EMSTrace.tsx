import {Activity,AlertTriangle,CheckCircle2,CloudSun,Radio,ShieldCheck,Workflow} from 'lucide-react';
import {clock,type Config,type Frame,type Vehicle} from '@/lib/twin/engine';

type Props={time:number;config:Config;frame:Frame;previous?:Frame;vehicles:Vehicle[];strategy:string};
const n=(value:number,d=1)=>value.toLocaleString('en-GB',{minimumFractionDigits:d,maximumFractionDigits:d});

export default function EMSTrace({time,config,frame,previous,vehicles,strategy}:Props){
 const minute=Math.floor(time);
 const remoteOffline=config.preset==='offline'&&minute>=600&&minute<720;
 const activeConstraint=config.preset==='capacity'&&minute>=540&&minute<960;
 const solarCorrection=config.preset==='cloud'&&minute>=720&&minute<900;
 const faultWindow=config.preset==='fault'&&minute>=600&&minute<780;
 const signal=activeConstraint?'Grid event · import allowance reduced to 50 kW (OpenADR-shaped fixture)':solarCorrection?'Solar output below forecast':faultWindow?'Charger fault reported':remoteOffline?'Remote EMS link unavailable':'No active external event';
 const constrained=activeConstraint||solarCorrection||faultWindow||remoteOffline||frame.grid>frame.limit-3;
 const activeCars=frame.cars.filter(car=>car.bay>=0&&!['Expected','Departed'].includes(car.status));
 const selected=activeCars.find(car=>faultWindow&&car.bay>=2)||activeCars.find(car=>car.power>0)||activeCars[0];
 const vehicle=selected?vehicles[selected.id]:undefined;
 const before=selected&&previous?previous.cars[selected.id]:undefined;
 const dispatchChanged=Boolean(selected&&Math.abs(selected.power-(before?.power??0))>=.1);
 const communication=selected?.status==='Fault'?'faulted':remoteOffline?'offline':'online';
 const commandState=!selected?'no connected session':communication==='offline'?'withheld · local fallback':communication==='faulted'?'blocked · charger fault':selected.power>0?'accepted':'accepted · zero-power hold';
 const measured=selected?.power??0;
 const deltaEnergy=selected&&previous?Math.max(0,selected.delivered-previous.cars[selected.id].delivered)/.9:0;
 const entries=[
  {icon:CloudSun,title:'Inputs received',status:'snapshot',detail:`snapshot-${config.seed}-${String(minute).padStart(4,'0')} · ${clock(minute)} · simulator-derived`,text:`Environment: outdoor ${n(frame.outdoor)} °C · irradiance ${n(frame.irradiance,0)} W/m² · humidity, wind and precipitation not modeled. Energy: grid ${n(frame.grid)} / ${n(frame.limit)} kW · building ${n(frame.building)} kW · PV ${n(frame.solar)} kW · battery ${n(frame.batteryKwh,0)} kWh · tariff €${n(frame.price,2)}/kWh`},
  {icon:Activity,title:'Signal assessment',status:constrained?'review':'clear',detail:signal,text:constrained?`Constraint or exception detected. Remaining import margin ${n(frame.limit-frame.grid)} kW. Keep the deterministic safety limits active.`:`No grid event or equipment exception. Current strategy: ${strategy}. Site margin ${n(frame.limit-frame.grid)} kW.`},
  {icon:Workflow,title:'Feasible dispatch',status:'validated',detail:`${strategy} · deterministic simulator`,text:`EV allocation ${n(frame.ev)} kW across ${frame.cars.filter(car=>car.power>0).length} sessions · battery ${frame.batteryPower>0?'discharge':frame.batteryPower<0?'charge':'hold'} ${n(Math.abs(frame.batteryPower))} kW. The physical engine clamps each allocation to current site and vehicle limits.`},
  {icon:Radio,title:'Virtual charger boundary',status:commandState,detail:'OCPP 2.1 Edition 2 · declared EMS fixture subset',text:!selected?'No connected EVSE/session at this minute.':communication==='offline'?`No remote command sent to EVSE-${String(selected.bay+1).padStart(2,'0')}; local load balancing remains active.`:communication==='faulted'?`Command withheld for EVSE-${String(selected.bay+1).padStart(2,'0')} · equipment state is ${selected.status}.`:dispatchChanged?`SetChargingProfile intent for EVSE-${String(selected.bay+1).padStart(2,'0')} / ${vehicle?.name}: ${n(selected.power)} kW, expires at ${clock(Math.min(1439,minute+5))}. Correlation corr-${config.seed}-${minute}-${selected.id}.`:`No setpoint change for EVSE-${String(selected.bay+1).padStart(2,'0')} / ${vehicle?.name}; existing ${n(selected.power)} kW allocation remains in force.`},
  {icon:CheckCircle2,title:'Acknowledgement and feedback',status:communication==='online'?'acknowledged · telemetry observed':communication,text:communication==='online'?`Virtual acknowledgement: ${n(selected?.power??0)} kW accepted. Measured charger power ${n(measured)} kW · ${n(deltaEnergy,3)} kWh battery energy in this minute · state ${selected?.status??'unknown'}.`:`No remote acknowledgement. Device feedback state ${selected?.status??'unknown'}; the simulator keeps that separate from requested power.`},
  {icon:ShieldCheck,title:'Reconciliation',status:communication==='online'?'closed loop updated':'fallback recorded',detail:'intent → acknowledgement → meter/state feedback',text:communication==='online'?`Requested ${n(selected?.power??0)} kW · acknowledged ${n(selected?.power??0)} kW · measured ${n(measured)} kW. ${Math.abs((selected?.power??0)-measured)<.1?'Within simulation tolerance.':'Difference recorded; replan on the next simulation step.'}`:`Remote control was not confirmed. Fallback reason and device state are visible; no requested value is counted as delivered energy.`},
 ];
 return <div className="panel ems-trace-panel">
  <div className="panel-head"><div><h2>EMS control loop · {clock(minute)}</h2><small>One-minute replay from the active scenario and virtual device boundary</small></div><span className="badge ems-virtual">VIRTUAL MODE</span></div>
  <div className="ems-notice"><AlertTriangle size={17}/><span>Deterministic assessment and scheduling with synthetic inputs. Adapter standards are modeled, but no external feed or OCPP wire adapter is connected; the acknowledgement is a local demonstration response, not a conformance or certification test.</span></div>
  <div className="ems-run-meta"><span>Scenario seed <b>{config.seed}</b></span><span>Strategy <b>{strategy}</b></span><span>Charger profile <b>OCPP 2.1 Ed. 2 · fixture subset</b></span><span>Grid-event profile <b>OpenADR 3 · fixture only</b></span><span>Remote link <b className={communication==='online'?'green':'amber'}>{communication}</b></span></div>
  <div className="ems-trace-list">{entries.map((entry,index)=>{const Icon=entry.icon;return <article className="ems-trace-row" key={entry.title}><div className="ems-step"><span>{index+1}</span><Icon size={17}/></div><div className="ems-trace-content"><div className="ems-trace-title"><h3>{entry.title}</h3><span className={`ems-status ${entry.status.includes('fault')||entry.status.includes('withheld')||entry.status==='review'?'warning':''}`}>{entry.status}</span></div><small>{entry.detail}</small><p>{entry.text}</p></div></article>;})}</div>
  <div className="ems-trace-footer">Feedback shown here comes from the simulator’s current frame. The existing engine owns the physical result; the trace records the modeled decision and virtual protocol response around it.</div>
 </div>;
}
