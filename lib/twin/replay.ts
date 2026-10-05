import {defaults,simulate,validateConfig,type Config,type Frame,type Result,type Vehicle} from './engine';

export const REPLAY_VERSION='synthetic-replay-0.1.0';
export const FIXTURE_PROFILE='OCPP 2.1 Edition 2 · declared virtual fixture subset';
export type SignalKind='grid-limit'|'solar-shortfall'|'charger-fault'|'connection-loss'|'infeasible-demand';
export type DataQuality='good'|'estimated'|'stale'|'missing'|'invalid';
export type SignalOperation='upsert'|'cancel';
export type SignalEvent={
 sourceEventId:string;source:string;eventTime:string;recordedAt:string;validFrom:string;validUntil:string;
 revision:number;operation:SignalOperation;signal:SignalKind;value:number|null;unit:'kW'|'fraction'|'scenario';quality:DataQuality;
};
export type NormalizedSignal=SignalEvent&{eventTime:string;recordedAt:string;validFrom:string;validUntil:string};
export type EventDisposition={sourceEventId:string;revision:number;state:'active'|'cancelled'|'not-yet-valid'|'expired'|'superseded'|'stale'|'invalid'|'conflict';detail:string};
export type EventSnapshot={version:string;asOf:string;seed:number;activeSignals:NormalizedSignal[];dispositions:EventDisposition[];duplicateCount:number;fingerprint:string};
export type Observation={quantity:string;value:number;unit:string;observedAt:string;recordedAt:string;quality:'good';source:'synthetic-simulator';validFrom:string;validUntil:string};
export type InputSnapshot={version:string;id:string;asOf:string;seed:number;scenarioFingerprint:string;event:EventSnapshot;observations:Observation[]};
export type AssessmentMode='rules'|'unavailable'|'malformed';
export type Assessment={assessor:string;version:string;status:'assessed'|'fallback';urgency:'none'|'low'|'medium'|'high';impact:string;flexibilityKw:number;confidence:number;recommendedPolicy:'balanced'|'ems';explanation:string};
export type SignalAssessor=(snapshot:EventSnapshot,frame:Frame)=>unknown;
export type TelemetryMode='present'|'missing'|'stale';
export type PlanValidation={valid:boolean;remoteAllowed:boolean;predictedImportKw:number;importLimitKw:number;errors:string[]};
export type CommandIntent={id:string;planId:string;correlationId:string;evseId:string;sessionId:string;vehicleId:number;targetPowerKw:number;createdAt:string;expiresAt:string;createdAtMinute:number;expiresAtMinute:number};
export type Acknowledgement={messageId:string;intentId:string;correlationId:string;evseId:string;sessionId:string;status:'accepted'|'rejected'|'expired';acceptedPowerKw:number|null;receivedAt:string;latencyMinutes:number;reason:string};
export type ChargerFeedback={feedbackId:string;intentId:string;correlationId:string;evseId:string;sessionId:string;observedAt:string;measuredPowerKw:number;meterEnergyKwh:number;status:'Charging'|'PowerLimited'|'Unavailable';quality:'good'|'stale';source:'virtual-charger-meter'};
export type Reconciliation={intentId:string;requestedPowerKw:number;acknowledgedPowerKw:number|null;measuredPowerKw:number|null;meterEnergyKwh:number|null;feedbackQuality:DataQuality|'missing';state:'reconciled'|'deviation'|'rejected'|'unconfirmed';explanation:string};
export type AckMode='accepted'|'rejected'|'delayed'|'duplicate'|'missing';
export type ReplayOptions={signal?:SignalKind|null;quality?:DataQuality;assessment?:AssessmentMode;assessor?:SignalAssessor;acknowledgement?:AckMode;telemetry?:TelemetryMode;seed?:number;minute?:number;config?:Config;events?:readonly unknown[]};
export type ReplayRun={version:string;snapshot:InputSnapshot;assessment:Assessment;validation:PlanValidation;intents:CommandIntent[];acknowledgements:Acknowledgement[];feedback:ChargerFeedback[];reconciliation:Reconciliation[];ackMode:AckMode;telemetryMode:TelemetryMode;duplicatesSuppressed:number;minute:number;timeLabel:string;strategy:string;summary:{siteImportKw:number;siteLimitKw:number;chargerPowerKw:number;deliveredKwh:number;shortfallKwh:number;peakKw:number;violationMinutes:number;faultRecovered:boolean;connectionRecovered:boolean}};

const minuteMs=60_000;
const utcStart=Date.UTC(2026,5,15);
const scenarioMinutes:Record<SignalKind,number>={'grid-limit':555,'solar-shortfall':780,'charger-fault':630,'connection-loss':630,'infeasible-demand':630};
const signalPriority:Record<SignalKind,number>={'grid-limit':0,'charger-fault':1,'connection-loss':2,'solar-shortfall':3,'infeasible-demand':4};
const validQuality=(v:unknown):v is DataQuality=>['good','estimated','stale','missing','invalid'].includes(String(v));
const validSignal=(v:unknown):v is SignalKind=>['grid-limit','solar-shortfall','charger-fault','connection-loss','infeasible-demand'].includes(String(v));
const isoAtMinute=(minute:number)=>new Date(utcStart+minute*minuteMs).toISOString();
const parsed=(value:string)=>Date.parse(value);
const round=(value:number,digits=3)=>Number(value.toFixed(digits));
const stable=(value:unknown)=>JSON.stringify(value);
function hash(value:string):string{let h=2166136261;for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619)>>>0;return h.toString(16).padStart(8,'0');}

function signalUnit(signal:SignalKind):SignalEvent['unit']{return signal==='grid-limit'?'kW':signal==='solar-shortfall'?'fraction':'scenario';}
function signalValue(signal:SignalKind):number{if(signal==='grid-limit')return 50;if(signal==='solar-shortfall')return .2;return 1;}
function signalWindow(signal:SignalKind):[number,number]{if(signal==='grid-limit')return [540,960];if(signal==='solar-shortfall')return [720,900];if(signal==='connection-loss')return [600,720];if(signal==='charger-fault'||signal==='infeasible-demand')return [600,780];return [0,1440];}

export function makeFixtureSignal(signal:SignalKind,options:{minute?:number;quality?:DataQuality;revision?:number;operation?:SignalOperation;sourceEventId?:string;value?:number|null}={}):SignalEvent{
 const minute=options.minute??scenarioMinutes[signal],window=signalWindow(signal);
 const recorded=Math.max(window[0],minute-5);
 return {sourceEventId:options.sourceEventId??`fixture-${signal}-2026-06-15`,source:'synthetic-utility-fixture',eventTime:isoAtMinute(Math.max(0,window[0]-2)),recordedAt:isoAtMinute(recorded),validFrom:isoAtMinute(window[0]),validUntil:isoAtMinute(window[1]),revision:options.revision??1,operation:options.operation??'upsert',signal,value:options.value===undefined?signalValue(signal):options.value,unit:signalUnit(signal),quality:options.quality??'good'};
}

function normalizeSignal(raw:unknown):NormalizedSignal{
 if(!raw||typeof raw!=='object')throw new Error('Event must be an object.');
 const e=raw as Partial<SignalEvent>;
 if(typeof e.sourceEventId!=='string'||!e.sourceEventId.trim()||typeof e.source!=='string'||!e.source.trim())throw new Error('Event id and source are required.');
 if(!Number.isInteger(e.revision)||Number(e.revision)<1)throw new Error('Revision must be a positive integer.');
 if(e.operation!=='upsert'&&e.operation!=='cancel')throw new Error('Operation must be upsert or cancel.');
 if(!validSignal(e.signal)||!validQuality(e.quality))throw new Error('Signal kind or data quality is unsupported.');
 const times=[e.eventTime,e.recordedAt,e.validFrom,e.validUntil];
 if(times.some(t=>typeof t!=='string'||!Number.isFinite(Date.parse(t))))throw new Error('Event and validity timestamps must be parseable UTC timestamps.');
 const eventTime=new Date(parsed(e.eventTime!)).toISOString(),recordedAt=new Date(parsed(e.recordedAt!)).toISOString(),validFrom=new Date(parsed(e.validFrom!)).toISOString(),validUntil=new Date(parsed(e.validUntil!)).toISOString();
 if(parsed(validFrom)>=parsed(validUntil))throw new Error('validUntil must be later than validFrom.');
 const expectedUnit=signalUnit(e.signal);
 if(e.unit!==expectedUnit)throw new Error(`Expected ${expectedUnit} for ${e.signal}.`);
 const value=e.value;
 if(e.quality!=='missing'&&(typeof value!=='number'||!Number.isFinite(value)))throw new Error('A numeric signal value is required.');
 if(value!==null&&value!==undefined&&typeof value!=='number')throw new Error('Signal value must be numeric or missing.');
 if(e.quality==='good'&&value===null)throw new Error('A good-quality event cannot have a missing value.');
 if(e.signal==='grid-limit'&&value!==null&&value!==50)throw new Error('The virtual site profile declares a 50 kW import-limit fixture.');
 if(e.signal==='solar-shortfall'&&value!==null&&value!==.2)throw new Error('The virtual solar profile declares a 0.2 output multiplier fixture.');
 if(['charger-fault','connection-loss','infeasible-demand'].includes(e.signal)&&value!==null&&value!==1)throw new Error(`The ${e.signal} fixture value must be 1.`);
 return {sourceEventId:e.sourceEventId.trim(),source:e.source.trim(),eventTime,recordedAt,validFrom,validUntil,revision:Number(e.revision),operation:e.operation,signal:e.signal,value:value??null,unit:expectedUnit,quality:e.quality};
}

export function replaySignalEvents(rawEvents:readonly unknown[],asOf:string,seed=42):EventSnapshot{
 const now=parsed(asOf);if(!Number.isFinite(now))throw new Error('Snapshot time must be a parseable timestamp.');
 if(!Number.isInteger(seed)||seed<0||seed>100_000)throw new Error('Replay seed must be an integer from 0 to 100000.');
 const groups=new Map<string,NormalizedSignal[]>(),dispositions:EventDisposition[]=[];let duplicateCount=0;
 for(const [index,raw] of rawEvents.entries()){
  try{const event=normalizeSignal(raw);if(parsed(event.recordedAt)>now+minuteMs){dispositions.push({sourceEventId:event.sourceEventId,revision:event.revision,state:'stale',detail:'Event has a receipt time after this snapshot and has not arrived yet.'});continue;}const group=groups.get(event.sourceEventId)??[];group.push(event);groups.set(event.sourceEventId,group);}
  catch(error){const value=raw&&typeof raw==='object'?raw as Partial<SignalEvent>:undefined;dispositions.push({sourceEventId:value?.sourceEventId??`invalid-${index+1}`,revision:Number.isInteger(value?.revision)?Number(value?.revision):0,state:'invalid',detail:error instanceof Error?error.message:'Invalid event.'});}
 }
 const activeSignals:NormalizedSignal[]=[];
 for(const [sourceEventId,versions] of groups){
  const maxRevision=Math.max(...versions.map(v=>v.revision)),latest=versions.filter(v=>v.revision===maxRevision);
  const signatures=new Set(latest.map(stable));
  if(signatures.size>1){dispositions.push({sourceEventId,revision:maxRevision,state:'conflict',detail:'Conflicting payloads share the same revision; no winner was selected.'});continue;}
  const winner=latest[0];duplicateCount+=latest.length-1;
  for(const older of versions.filter(v=>v.revision<maxRevision))dispositions.push({sourceEventId,revision:older.revision,state:'superseded',detail:`Superseded by revision ${maxRevision}.`});
  if(winner.operation==='cancel'){dispositions.push({sourceEventId,revision:winner.revision,state:'cancelled',detail:'Cancellation tombstone suppresses earlier revisions.'});continue;}
  if(now<parsed(winner.validFrom)){dispositions.push({sourceEventId,revision:winner.revision,state:'not-yet-valid',detail:'Event is outside its validity window.'});continue;}
  if(now>=parsed(winner.validUntil)){dispositions.push({sourceEventId,revision:winner.revision,state:'expired',detail:'Event validity window has ended.'});continue;}
  const age=now-parsed(winner.recordedAt);
  if(winner.quality==='stale'||winner.quality==='missing'||winner.quality==='invalid'||age>30*minuteMs){dispositions.push({sourceEventId,revision:winner.revision,state:'stale',detail:'Stale, missing or invalid input is not dispatched.'});continue;}
  activeSignals.push(winner);dispositions.push({sourceEventId,revision:winner.revision,state:'active',detail:winner.quality==='estimated'?'Estimated input is active with reduced confidence.':'Valid input is active.'});
 }
 activeSignals.sort((a,b)=>signalPriority[a.signal]-signalPriority[b.signal]||a.sourceEventId.localeCompare(b.sourceEventId));
 dispositions.sort((a,b)=>a.sourceEventId.localeCompare(b.sourceEventId)||a.revision-b.revision||a.state.localeCompare(b.state));
 const canonical={version:REPLAY_VERSION,asOf:new Date(now).toISOString(),seed,activeSignals,dispositions,duplicateCount};
 return {...canonical,fingerprint:hash(stable(canonical))};
}

function presetFor(event:NormalizedSignal|undefined):Config['preset']|undefined{
 if(!event)return undefined;
 return event.signal==='grid-limit'?'capacity':event.signal==='solar-shortfall'?'cloud':event.signal==='charger-fault'?'fault':event.signal==='connection-loss'?'offline':'impossible';
}
function observation(quantity:string,value:number,unit:string,asOf:string):Observation{return {quantity,value:round(value),unit,observedAt:asOf,recordedAt:asOf,quality:'good',source:'synthetic-simulator',validFrom:asOf,validUntil:new Date(parsed(asOf)+minuteMs).toISOString()};}

export function assessSignal(eventSnapshot:EventSnapshot,frame:Frame,mode:AssessmentMode='rules'):Assessment{
 const stale=eventSnapshot.dispositions.some(d=>d.state==='stale'||d.state==='invalid'||d.state==='conflict');
 if(mode!=='rules')return {assessor:'deterministic-rules',version:'rules-1.0.0',status:'fallback',urgency:'medium',impact:'Assessment service was unavailable or returned an invalid or low-confidence result.',flexibilityKw:round(frame.ev),confidence:.25,recommendedPolicy:'balanced',explanation:'The rules-only fallback selected Load balancing. The deterministic physical limits remain active.'};
 const event=eventSnapshot.activeSignals[0];
 if(!event){return {assessor:'deterministic-rules',version:'rules-1.0.0',status:stale?'fallback':'assessed',urgency:'none',impact:stale?'Untrusted event input was suppressed; no external event is applied.':'No active external event.',flexibilityKw:round(frame.ev),confidence:stale?.35:1,recommendedPolicy:'balanced',explanation:stale?'A stale or invalid event was withheld. Load balancing remains the local fallback.':'No active signal; the synthetic site uses Load balancing.'};}
 const policy=event.signal==='connection-loss'?'balanced':'ems';
 const urgency=event.signal==='grid-limit'||event.signal==='charger-fault'?'high':event.signal==='connection-loss'?'high':'medium';
 const confidence=event.quality==='estimated'?.72:.95;
 const impact=event.signal==='grid-limit'?'Import allowance reduced to the declared 50 kW fixture.':event.signal==='solar-shortfall'?'Solar output forecast reduced to the declared 20% fixture.':event.signal==='charger-fault'?'Two simulated charging bays are unavailable until recovery.':event.signal==='connection-loss'?'Remote control is unavailable; local load balancing continues.':'Vehicle requests exceed available charging time.';
 return {assessor:'deterministic-rules',version:'rules-1.0.0',status:'assessed',urgency,impact,flexibilityKw:round(frame.ev),confidence,recommendedPolicy:policy,explanation:`${event.signal} revision ${event.revision} is ${event.quality}; ${policy==='ems'?'Deadline-aware EMS':'local Load balancing'} was selected from the replay evidence.`};
}

function isAssessment(value:unknown):value is Assessment{
 if(!value||typeof value!=='object')return false;const a=value as Partial<Assessment>;
 return typeof a.assessor==='string'&&typeof a.version==='string'&&(a.status==='assessed'||a.status==='fallback')&&['none','low','medium','high'].includes(String(a.urgency))&&typeof a.impact==='string'&&Number.isFinite(a.flexibilityKw)&&Number(a.flexibilityKw)>=0&&Number.isFinite(a.confidence)&&Number(a.confidence)>=0&&Number(a.confidence)<=1&&(a.recommendedPolicy==='balanced'||a.recommendedPolicy==='ems')&&typeof a.explanation==='string';
}

export function validateDispatch(frame:Frame,vehicles:Vehicle[],event?:NormalizedSignal):PlanValidation{
 const errors:string[]=[];
 const total=frame.cars.reduce((sum,car)=>sum+car.power,0);
 const reconstructed=frame.building+frame.ev-frame.solar-frame.batteryPower+frame.curtailed;
 if(Math.abs(total-frame.ev)>.05)errors.push('Per-session setpoints do not sum to the site EV allocation.');
 if(Math.abs(reconstructed-frame.grid)>.05)errors.push('Site power balance does not reconcile to the measured simulator frame.');
 if(frame.grid>frame.limit+.05)errors.push('Predicted import exceeds the active site import limit.');
 for(const car of frame.cars){if(car.power<=.01)continue;const vehicle=vehicles[car.id];if(!vehicle){errors.push(`Session ${car.id} has no vehicle contract.`);continue;}if(car.bay<0||['Fault','Sleeping','Queued','Arriving','Departed','Expected'].includes(car.status))errors.push(`Session ${car.id} is not in a controllable charging state.`);if(car.power>vehicle.maxKw+.01)errors.push(`Session ${car.id} exceeds the vehicle power limit.`);}
 return {valid:errors.length===0,remoteAllowed:event?.signal!=='connection-loss',predictedImportKw:round(frame.grid),importLimitKw:round(frame.limit),errors};
}

function buildIntents(frame:Frame,vehicles:Vehicle[],validation:PlanValidation,snapshotId:string,minute:number):CommandIntent[]{
 if(!validation.valid||!validation.remoteAllowed)return [];
 return frame.cars.filter(car=>car.power>.01&&car.bay>=0).map(car=>{const expires=minute+5;return {id:`intent-${snapshotId}-${car.id}`,planId:`plan-${snapshotId}`,correlationId:`corr-${snapshotId}-${car.id}`,evseId:`EVSE-${String(car.bay+1).padStart(2,'0')}`,sessionId:`session-${car.id}`,vehicleId:car.id,targetPowerKw:round(car.power),createdAt:isoAtMinute(minute),expiresAt:isoAtMinute(expires),createdAtMinute:minute,expiresAtMinute:expires};});
}

export function exerciseVirtualAdapter(intents:CommandIntent[],mode:AckMode,minute:number,observedPowers:Record<string,number>={},telemetryMode:TelemetryMode='present'):{acknowledgements:Acknowledgement[];feedback:ChargerFeedback[];duplicatesSuppressed:number}{
 const raw:Acknowledgement[]=[];const feedback:ChargerFeedback[]=[];
 for(const intent of intents){
  const delay=mode==='delayed'?3:0,receivedMinute=minute+delay,expired=receivedMinute>intent.expiresAtMinute;
  if(mode!=='missing'){
   const accepted=mode!=='rejected'&&!expired;
   const acknowledgement:Acknowledgement={messageId:`ack-${intent.id}`,intentId:intent.id,correlationId:intent.correlationId,evseId:intent.evseId,sessionId:intent.sessionId,status:expired?'expired':accepted?'accepted':'rejected',acceptedPowerKw:accepted?intent.targetPowerKw:expired?null:0,receivedAt:isoAtMinute(receivedMinute),latencyMinutes:delay,reason:expired?'Acknowledgement arrived after command expiry.':accepted?(delay?'Accepted after a simulated delay.':'Command accepted by virtual fixture.'): 'Virtual fixture rejected the requested profile.'};
   raw.push(acknowledgement);if(mode==='duplicate')raw.push({...acknowledgement});
  }
  const actual=Math.max(0,observedPowers[intent.id]??intent.targetPowerKw),metered=mode==='rejected'?actual*.4:actual*.985;
  if(telemetryMode!=='missing')feedback.push({feedbackId:`feedback-${intent.id}`,intentId:intent.id,correlationId:intent.correlationId,evseId:intent.evseId,sessionId:intent.sessionId,observedAt:isoAtMinute(minute+1),measuredPowerKw:round(metered),meterEnergyKwh:round(metered/60,6),status:mode==='rejected'?'PowerLimited':metered>.01?'Charging':'Unavailable',quality:telemetryMode==='stale'?'stale':'good',source:'virtual-charger-meter'});
 }
 const unique=new Map<string,Acknowledgement>();for(const acknowledgement of raw)if(!unique.has(acknowledgement.messageId))unique.set(acknowledgement.messageId,acknowledgement);
 return {acknowledgements:[...unique.values()],feedback,duplicatesSuppressed:raw.length-unique.size};
}

function reconcile(intents:CommandIntent[],acks:Acknowledgement[],feedback:ChargerFeedback[]):Reconciliation[]{
 return intents.map(intent=>{const ack=acks.find(a=>a.intentId===intent.id),sample=feedback.find(f=>f.intentId===intent.id),ackPower=ack?.acceptedPowerKw??null,measured=sample?.measuredPowerKw??null;
  const feedbackQuality=sample?.quality??'missing';
  if(!ack)return {intentId:intent.id,requestedPowerKw:intent.targetPowerKw,acknowledgedPowerKw:null,measuredPowerKw:measured,meterEnergyKwh:sample?.meterEnergyKwh??null,feedbackQuality,state:'unconfirmed',explanation:sample?`No acknowledgement arrived; ${sample.meterEnergyKwh.toFixed(4)} kWh is supported by ${sample.quality} meter feedback only.`:'No acknowledgement or telemetry arrived.'};
  if(ack.status==='rejected'||ack.status==='expired')return {intentId:intent.id,requestedPowerKw:intent.targetPowerKw,acknowledgedPowerKw:ackPower,measuredPowerKw:measured,meterEnergyKwh:sample?.meterEnergyKwh??null,feedbackQuality,state:ack.status==='rejected'?'rejected':'deviation',explanation:`${ack.reason} Meter feedback remains separate from the command result.`};
  if(!sample||sample.quality!=='good')return {intentId:intent.id,requestedPowerKw:intent.targetPowerKw,acknowledgedPowerKw:ackPower,measuredPowerKw:measured,meterEnergyKwh:sample?.meterEnergyKwh??null,feedbackQuality,state:'unconfirmed',explanation:`Command accepted, but ${feedbackQuality} meter feedback cannot confirm delivery.`};
  const tolerance=Math.max(.15,intent.targetPowerKw*.03),state=measured===null?'deviation':Math.abs(ackPower!-measured)<=tolerance?'reconciled':'deviation';
  return {intentId:intent.id,requestedPowerKw:intent.targetPowerKw,acknowledgedPowerKw:ackPower,measuredPowerKw:measured,meterEnergyKwh:sample?.meterEnergyKwh??null,feedbackQuality,state,explanation:state==='reconciled'?'Intent, acknowledgement and measured power agree within the fixture tolerance.':'Measured feedback differs from the accepted setpoint; review or replan.'};
 });
}

export function runSyntheticReplay(options:ReplayOptions={}):ReplayRun{
 const signal=options.signal===undefined?'grid-limit':options.signal,minute=Math.max(0,Math.min(1439,Math.floor(options.minute??(signal?scenarioMinutes[signal]:555))));
 const seed=options.seed??options.config?.seed??defaults.seed,config=validateConfig({...defaults,...options.config,seed});
 const asOf=isoAtMinute(minute),events=options.events??(signal?[makeFixtureSignal(signal,{minute,quality:options.quality??'good'})]:[]);
 const eventSnapshot=replaySignalEvents(events,asOf,seed),activeEvent=eventSnapshot.activeSignals[0];
 const preset=presetFor(activeEvent),simulation:Result=simulate({...config,preset:preset??config.preset,policy:'balanced'});
 const frame=simulation.frames[minute],assessmentMode=options.assessment??'rules';let assessment=assessSignal(eventSnapshot,frame,assessmentMode);
 if(assessmentMode==='rules'&&options.assessor){try{const candidate=options.assessor(eventSnapshot,frame);const trusted=isAssessment(candidate)&&(candidate.status==='fallback'?candidate.recommendedPolicy==='balanced':candidate.confidence>=.5);assessment=trusted?candidate as Assessment:assessSignal(eventSnapshot,frame,'malformed');}catch{assessment=assessSignal(eventSnapshot,frame,'malformed');}}
 const planned:Result=assessment.recommendedPolicy==='ems'?simulate({...config,preset:preset??config.preset,policy:'ems'}):simulation;
 const planFrame=planned.frames[minute],validation=validateDispatch(planFrame,planned.vehicles,activeEvent);
 const observations=[
  observation('grid-active-power',planFrame.grid,'kW',asOf),observation('grid-import-limit',planFrame.limit,'kW',asOf),
  observation('building-active-power',planFrame.building,'kW',asOf),observation('pv-active-power',planFrame.solar,'kW',asOf),
  observation('evse-active-power',planFrame.ev,'kW',asOf),observation('import-price',planFrame.price,'EUR/kWh',asOf),
  observation('battery-energy',planFrame.batteryKwh,'kWh',asOf),observation('connected-session-count',planFrame.cars.filter(c=>c.bay>=0&&!['Expected','Departed'].includes(c.status)).length,'session',asOf),
 ];
 const scenarioFingerprint=eventSnapshot.fingerprint,id=`snapshot-${hash(stable({version:REPLAY_VERSION,scenarioFingerprint,observations,seed,minute}))}`;
 const snapshot:InputSnapshot={version:REPLAY_VERSION,id,asOf,seed,scenarioFingerprint,event:eventSnapshot,observations};
 const intents=buildIntents(planFrame,planned.vehicles,validation,id,minute),ackMode=options.acknowledgement??'accepted',telemetryMode=options.telemetry??'present';
 const observedPowers=Object.fromEntries(intents.map(intent=>[intent.id,planFrame.cars[intent.vehicleId]?.power??0]));
 const virtual=exerciseVirtualAdapter(intents,ackMode,minute,observedPowers,telemetryMode),reconciliation=reconcile(intents,virtual.acknowledgements,virtual.feedback);
 const faultRecovered=activeEvent?.signal==='charger-fault'&&planned.events.some(e=>e.text.includes('Chargers 03 & 04 restored'));
 const connectionRecovered=activeEvent?.signal==='connection-loss'&&planned.events.some(e=>e.text.includes('Remote EMS restored'));
 return {version:REPLAY_VERSION,snapshot,assessment,validation,intents,acknowledgements:virtual.acknowledgements,feedback:virtual.feedback,reconciliation,ackMode,telemetryMode,duplicatesSuppressed:virtual.duplicatesSuppressed,minute,timeLabel:new Date(utcStart+minute*minuteMs).toISOString().slice(11,16),strategy:assessment.recommendedPolicy==='ems'?'Deadline-aware EMS':'Load balancing',summary:{siteImportKw:round(planFrame.grid),siteLimitKw:round(planFrame.limit),chargerPowerKw:round(planFrame.ev),deliveredKwh:round(planFrame.delivered),shortfallKwh:round(planFrame.shortfall),peakKw:round(planned.final.peak),violationMinutes:planned.final.violations,faultRecovered,connectionRecovered}};
}
