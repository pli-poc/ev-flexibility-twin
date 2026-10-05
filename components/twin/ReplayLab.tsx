'use client';

import Link from 'next/link';
import {useState} from 'react';
import {ArrowLeft,ArrowRight,CheckCircle2,Clock3,GitBranch,Radio,ShieldCheck,Waypoints} from 'lucide-react';
import {runSyntheticReplay,type AckMode,type AssessmentMode,type DataQuality,type ReplayRun,type SignalKind,type TelemetryMode} from '@/lib/twin/replay';
import './ReplayLab.css';

const scenarios:{value:string;label:string;signal:SignalKind|null}[]=[
 {value:'grid-limit',label:'Grid import limit · 50 kW',signal:'grid-limit'},
 {value:'solar-shortfall',label:'Solar output below forecast',signal:'solar-shortfall'},
 {value:'charger-fault',label:'Charger fault and recovery',signal:'charger-fault'},
 {value:'connection-loss',label:'Remote connection loss and recovery',signal:'connection-loss'},
 {value:'infeasible-demand',label:'Infeasible vehicle requests',signal:'infeasible-demand'},
 {value:'none',label:'No active external event',signal:null},
];
const qualities:{value:DataQuality;label:string}[]=[{value:'good',label:'Good'},{value:'estimated',label:'Estimated'},{value:'stale',label:'Stale (suppress input)'}];
const assessments:{value:AssessmentMode;label:string}[]=[{value:'rules',label:'Deterministic rules'},{value:'unavailable',label:'Assessor unavailable (fallback)'},{value:'malformed',label:'Malformed result (fallback)'}];
const responses:{value:AckMode;label:string}[]=[{value:'accepted',label:'Accepted'},{value:'rejected',label:'Rejected'},{value:'delayed',label:'Delayed response'},{value:'duplicate',label:'Duplicate response'},{value:'missing',label:'Missing acknowledgement'}];
const telemetryModes:{value:TelemetryMode;label:string}[]=[{value:'present',label:'Current meter sample'},{value:'stale',label:'Stale meter sample'},{value:'missing',label:'Missing meter sample'}];
const n=(value:number,d=1)=>value.toLocaleString('en-GB',{minimumFractionDigits:d,maximumFractionDigits:d});

function traceStatus(result:ReplayRun){
 if(!result.validation.valid)return 'withheld · safety check failed';
 if(!result.validation.remoteAllowed)return 'withheld · local fallback';
 if(!result.intents.length)return 'no command required';
 if(result.ackMode==='missing')return 'acknowledgement missing';
 if(result.ackMode==='rejected')return 'rejected by virtual fixture';
 if(result.ackMode==='delayed')return 'accepted after delay';
 return result.ackMode==='duplicate'?'accepted · duplicate suppressed':'accepted';
}

export default function ReplayLab(){
 const [scenario,setScenario]=useState('grid-limit'),[quality,setQuality]=useState<DataQuality>('good'),[assessment,setAssessment]=useState<AssessmentMode>('rules'),[response,setResponse]=useState<AckMode>('accepted'),[telemetry,setTelemetry]=useState<TelemetryMode>('present'),[seed,setSeed]=useState('42');
 const [result,setResult]=useState<ReplayRun>(()=>runSyntheticReplay({signal:'grid-limit'}));
 const run=()=>setResult(runSyntheticReplay({signal:scenarios.find(x=>x.value===scenario)?.signal??null,quality,assessment,acknowledgement:response,telemetry,seed:Number(seed)}));
 const event=result.snapshot.event.activeSignals[0];
 return <main className="replay-page">
  <header className="replay-header">
   <Link className="replay-brand" href="/roadmap/"><span><Waypoints size={18}/></span><b>FUTURE EV</b><i/>Energy Twin</Link>
   <nav aria-label="Simulator pages"><Link href="/roadmap/">Development roadmap</Link><Link className="replay-header-home" href="/"><ArrowLeft size={14}/> Simulator</Link></nav>
  </header>
  <div className="replay-content">
   <section className="replay-hero">
    <div className="replay-eyebrow"><span/> SYNTHETIC REFERENCE IMPLEMENTATION</div>
    <h1>Deterministic event<br/><em>replay lab.</em></h1>
    <p>Follow one versioned signal through assessment, a physically checked plan, a virtual charger response, measured feedback and reconciliation.</p>
    <div className="replay-guardrail"><ShieldCheck size={18}/><span>Synthetic fixtures only. Nothing is sent to a real grid, site or charger.</span></div>
   </section>
   <section className="replay-workbench" aria-label="Replay controls and result">
    <form className="replay-controls" onSubmit={event=>{event.preventDefault();run();}}>
     <div className="replay-section-kicker">SCENARIO INPUT</div>
     <label>Scenario fixture<select aria-label="Scenario fixture" value={scenario} onChange={e=>setScenario(e.target.value)}>{scenarios.map(x=><option value={x.value} key={x.value}>{x.label}</option>)}</select></label>
     <div className="replay-control-pair">
      <label>Event quality<select aria-label="Input quality" value={quality} onChange={e=>setQuality(e.target.value as DataQuality)}>{qualities.map(x=><option value={x.value} key={x.value}>{x.label}</option>)}</select></label>
      <label>Assessor<select aria-label="Assessment mode" value={assessment} onChange={e=>setAssessment(e.target.value as AssessmentMode)}>{assessments.map(x=><option value={x.value} key={x.value}>{x.label}</option>)}</select></label>
     </div>
     <label>Virtual charger response<select aria-label="Virtual charger response" value={response} onChange={e=>setResponse(e.target.value as AckMode)}>{responses.map(x=><option value={x.value} key={x.value}>{x.label}</option>)}</select></label>
     <label>Meter telemetry<select aria-label="Meter telemetry" value={telemetry} onChange={e=>setTelemetry(e.target.value as TelemetryMode)}>{telemetryModes.map(x=><option value={x.value} key={x.value}>{x.label}</option>)}</select></label>
     <label>Replay seed<input aria-label="Replay seed" inputMode="numeric" type="number" min="0" max="100000" step="1" value={seed} onChange={e=>setSeed(e.target.value)}/></label>
     <button className="replay-run" type="submit"><GitBranch size={16}/> Run deterministic replay <ArrowRight size={16}/></button>
     <div className="replay-control-note"><Clock3 size={14}/> Fixed simulator clock · {result.timeLabel} · seed {result.snapshot.seed}</div>
    </form>
    <div className="replay-results" aria-live="polite">
     <div className="replay-results-top"><div><div className="replay-section-kicker">REPLAY RESULT</div><h2>One trace, end to end.</h2></div><span className="replay-version">{result.version}</span></div>
     <div className="replay-snapshot"><div><span>INPUT SNAPSHOT</span><b>{result.snapshot.id}</b></div><small>Fingerprint {result.snapshot.scenarioFingerprint} · {result.snapshot.event.duplicateCount} duplicate event(s) suppressed</small></div>
     <ol className="replay-trace">
      <li><div className="replay-step-icon"><Radio size={16}/></div><div className="replay-step-content"><div className="replay-step-title"><h3>Event received and normalized</h3><span className="replay-chip">{event?`revision ${event.revision}`:'no active event'}</span></div><p>{event?`${event.signal} · ${event.quality} quality · source ${event.source} · valid ${event.validFrom.slice(11,16)}–${event.validUntil.slice(11,16)} UTC`:'No active event was applied. Simulator observations are still versioned and time-stamped.'}</p><small>{result.snapshot.observations.length} synthetic observations · source, event time, recorded time, unit and validity retained</small></div></li>
      <li><div className="replay-step-icon"><CheckCircle2 size={16}/></div><div className="replay-step-content"><div className="replay-step-title"><h3>Signal assessment</h3><span className={`replay-chip ${result.assessment.status==='fallback'?'is-warn':''}`}>{result.assessment.status}</span></div><p>{result.assessment.impact} {result.assessment.explanation}</p><small>{result.assessment.urgency} urgency · {n(result.assessment.flexibilityKw)} kW currently flexible · {Math.round(result.assessment.confidence*100)}% rule confidence</small></div></li>
      <li><div className="replay-step-icon"><ShieldCheck size={16}/></div><div className="replay-step-content"><div className="replay-step-title"><h3>Plan and safety validation</h3><span className={`replay-chip ${result.validation.valid?'is-good':'is-warn'}`}>{result.validation.valid?'validated':'withheld'}</span></div><p>{result.strategy} · import {n(result.validation.predictedImportKw)} / {n(result.validation.importLimitKw)} kW. {result.validation.errors.join(' ')||'Site power balance, session setpoints, equipment state and limits checked independently.'}</p><small>Remote command boundary: {result.validation.remoteAllowed?'available for this fixture':'blocked; local fallback remains active'}</small></div></li>
      <li><div className="replay-step-icon"><ArrowRight size={16}/></div><div className="replay-step-content"><div className="replay-step-title"><h3>Protocol-neutral command intent</h3><span className="replay-chip">{result.intents.length} intent(s)</span></div>{result.intents.length?<div className="replay-command-list">{result.intents.slice(0,3).map(intent=><div key={intent.id}><b>{intent.evseId} · {intent.sessionId}</b><span>{n(intent.targetPowerKw)} kW · expires {intent.expiresAt.slice(11,16)} UTC</span></div>)}{result.intents.length>3&&<small>+ {result.intents.length-3} additional session intents</small>}</div>:<p>No remote command is issued because the link is unavailable, the safety check withheld dispatch, or no session needs power.</p>}<small>Correlation IDs and expiry are recorded before the virtual adapter responds.</small></div></li>
      <li><div className="replay-step-icon"><Radio size={16}/></div><div className="replay-step-content"><div className="replay-step-title"><h3>Virtual charger response</h3><span className={`replay-chip ${result.ackMode==='rejected'||result.ackMode==='missing'?'is-warn':'is-good'}`}>{traceStatus(result)}</span></div><p>{result.acknowledgements.length} acknowledgement(s) · {result.duplicatesSuppressed} duplicate response(s) suppressed · {result.feedback.length} separate telemetry sample(s).</p><small>{FIXTURE_LABEL} · fixture response mode: {result.ackMode}</small></div></li>
      <li><div className="replay-step-icon"><CheckCircle2 size={16}/></div><div className="replay-step-content"><div className="replay-step-title"><h3>Measured feedback and reconciliation</h3><span className="replay-chip">{result.reconciliation.length} reconciled record(s)</span></div>{result.reconciliation.length?<div className="replay-reconcile-list">{result.reconciliation.slice(0,3).map(x=><div key={x.intentId}><b>{n(x.requestedPowerKw)} kW requested</b><span>{x.acknowledgedPowerKw===null?'ack unknown':`${n(x.acknowledgedPowerKw)} kW accepted`} · {x.measuredPowerKw===null?'no meter sample':`${n(x.measuredPowerKw)} kW measured`} · {x.meterEnergyKwh===null?'no energy sample':`${n(x.meterEnergyKwh,4)} kWh meter energy`}</span><small>{x.state} · feedback {x.feedbackQuality} · {x.explanation}</small></div>)}</div>:<p>No command was sent, so there is no command-linked feedback to reconcile.</p>}<small>Accepted power is not treated as delivered energy; metered power and energy remain separate observations.</small></div></li>
     </ol>
     <div className="replay-outcome-grid"><div><span>SIMULATED SITE</span><b>{n(result.summary.siteImportKw)} / {n(result.summary.siteLimitKw)} kW</b></div><div><span>EV CHARGING</span><b>{n(result.summary.chargerPowerKw)} kW</b></div><div><span>DEPARTURE SHORTFALL</span><b>{n(result.summary.shortfallKwh)} kWh</b></div><div><span>RECOVERY EVIDENCE</span><b>{result.summary.faultRecovered?'Charger restored':result.summary.connectionRecovered?'Link restored':'See scenario trace'}</b></div></div>
    </div>
   </section>
   <footer className="replay-footer"><Link href="/roadmap/"><ArrowLeft size={14}/> Development roadmap</Link><span>VIRTUAL FIXTURE ONLY · NOT A DEVICE CONFORMANCE TEST</span></footer>
  </div>
 </main>;
}

const FIXTURE_LABEL='OCPP 2.1 Edition 2 · declared virtual subset';
