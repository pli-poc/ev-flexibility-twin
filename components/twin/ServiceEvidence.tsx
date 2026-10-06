'use client';
import {useEffect,useMemo,useState} from 'react';
import {ResponsiveContainer,LineChart,Line,XAxis,YAxis,CartesianGrid,Tooltip} from 'recharts';
import {clock} from '../../lib/twin/engine';
import {isSpecialistBundle,type SpecialistBundle} from '../../lib/twin/specialists';
import {specialistScenario,type SpecialistCondition} from '../../lib/twin/specialist-scenario';
import {specialistRun} from '../../lib/twin/specialist-controller';
import {serviceRun,type ServiceSettings} from '../../lib/twin/service-hybrid';

type Metric={policy:string;ready:number;visits:number;unmet:number;cost:number;unitCost:number;violations:number};
type Interval={meanAdvantage:number;low:number;high:number};
type Gate={reference:string;accepted:boolean;checks:Record<string,boolean>};
type Evidence={
 schema:string;filename:string;modelSha256:string;scenarios:number;visits:number;
 protocol:{testSeeds:number[];testDays:number[];conditions:SpecialistCondition[]};
 selection:{learned:{settings:ServiceSettings};unlearned:{settings:ServiceSettings};fixed:{policy:string}};
 totals:Metric[];slices:{condition:string;totals:Metric[]}[];
 comparisons:Record<string,{ready:Interval;unmet:Interval}>;
 acceptance:{accepted:boolean;gates:Gate[]};
};
const names:Record<string,string>={immediate:'Immediate (uncontrolled)',balanced:'Load balancing',ems:'Deadline-aware EMS',cheap:'Cheapest energy',peak:'Peak-aware',total:'Total-cost-aware','hybrid-ai':'Forecast-informed hybrid','hybrid-no-ai':'Independently tuned hybrid without AI','hybrid-ablated':'Same hybrid, AI switched off'};
const checks:Record<string,string>={safe:'Zero grid violations',moreReady:'At least 1 percentage point more completed charges',lowerUnmet:'Less unmet energy',affordable:'At most 1% higher EV cost per delivered kWh',conditionService:'No service regression in any condition',positiveReadyInterval:'Positive completion confidence interval',positiveUnmetInterval:'Positive unmet-energy confidence interval'};
const base=process.env.NEXT_PUBLIC_BASE_PATH??'';
const number=(n:number,d=0)=>n.toLocaleString('en-GB',{minimumFractionDigits:d,maximumFractionDigits:d});
const signed=(n:number,d=0)=>`${n>=0?'+':''}${number(n,d)}`;

export default function ServiceEvidence(){
 const [evidence,setEvidence]=useState<Evidence>(),[error,setError]=useState(''),[reference,setReference]=useState('hybrid-ablated');
 const [model,setModel]=useState<SpecialistBundle>(),[loading,setLoading]=useState(false),[seed,setSeed]=useState(12203),[day,setDay]=useState(35),[condition,setCondition]=useState<SpecialistCondition>('normal');
 useEffect(()=>{let active=true;(async()=>{try{
  const response=await fetch(`${base}/models/service-proof.json`);if(!response.ok)throw Error('Service evidence unavailable.');
  const data=await response.json();if(data.schema!=='ev-service-summary/1'||data.filename!=='service-balanced-evidence.json'||!data.acceptance?.gates||!data.totals?.some((r:Metric)=>r.policy==='hybrid-ai'))throw Error('Invalid service evidence.');
  if(active){setEvidence(data);setSeed(data.protocol.testSeeds[0]);setDay(data.protocol.testDays[0]);}
 }catch(e){if(active)setError(String(e));}})();return()=>{active=false;};},[]);
 async function loadReplay(){if(!evidence)return;setLoading(true);setError('');try{
  const response=await fetch(`${base}/models/specialist-reference.json`);if(!response.ok)throw Error('Frozen replay model unavailable.');
  const data=await response.json();if(!isSpecialistBundle(data.model))throw Error('Invalid frozen replay model.');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data.model)));
  const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==evidence.modelSha256)throw Error('Replay model does not match the frozen experiment.');setModel(data.model);
 }catch(e){setError(String(e));}finally{setLoading(false);}}
 const replay=useMemo(()=>{if(!model||!evidence)return;
  const c=specialistScenario(day,seed,condition),ai=serviceRun(c,model,evidence.selection.learned.settings);
  const fixed=reference==='balanced'?specialistRun(c,model,'balanced'):serviceRun(c,model,reference==='hybrid-no-ai'?evidence.selection.unlearned.settings:evidence.selection.learned.settings,false);
  return {ai,fixed,chart:ai.frames.filter((_,i)=>i%15===0).map(f=>({time:f.time,ai:f.grid,reference:fixed.frames[f.time].grid,limit:f.limit}))};
 },[model,evidence,day,seed,condition,reference]);
 if(!evidence)return <section className="flex-card service-proof"><h2>Does forecasting improve charging?</h2><p role={error?'alert':'status'}>{error||'Loading the frozen service experiment…'}</p></section>;
 const ai=evidence.totals.find(r=>r.policy==='hybrid-ai')!,ref=evidence.totals.find(r=>r.policy===reference)!;
 const reduction=(ref.unmet-ai.unmet)/ref.unmet*100,costChange=(ai.unitCost/ref.unitCost-1)*100,ci=evidence.comparisons[reference],gate=evidence.acceptance.gates.find(g=>g.reference===reference)!;
 return <section className="flex-card service-proof" aria-label="Frozen service evidence">
  <p className="eyebrow">FROZEN SERVICE TEST · DEPARTURE FORECASTING</p>
  <h2>Does forecasting improve charging?</h2>
  <p>{number(evidence.scenarios)} paired synthetic scenarios and {number(evidence.visits)} visits, covering every weekday, four seasonal windows and five conditions. Settings were selected on validation before testing eight new seed populations. The selected hybrid uses one departure network and reserves 25% of available power for a fair share before prioritising completions.</p>
  <div className="specialist-verdict"><b>{evidence.acceptance.accepted?'Overall gate passed on this fixture.':'Forecast benefit demonstrated; overall gate not passed.'}</b> The departure predictor improves the identical hybrid. Against load balancing, the hybrid completes more charges, but its unmet-energy advantage is inconclusive and normal/stale conditions regress. Under tight capacity, the separately tuned unlearned hybrid completes more charges. The existing operating default is retained.</div>
  <label>Compare the forecast-informed hybrid with<select aria-label="Service proof comparison" value={reference} onChange={e=>setReference(e.target.value)}>{['hybrid-ablated','hybrid-no-ai','balanced'].map(id=><option key={id} value={id}>{names[id]}</option>)}</select></label>
  <div className="flex-metrics service-proof-metrics">
   <div><small>Completed charges gained</small><b>{signed(ai.ready-ref.ready)}</b><span>{signed((ai.ready-ref.ready)/evidence.visits*100,2)} percentage points</span></div>
   <div><small>{reduction>=0?'Less':'More'} unmet energy</small><b>{number(Math.abs(reduction),2)}%</b><span>{number(Math.abs(ref.unmet-ai.unmet),1)} kWh difference</span></div>
   <div><small>AI grid violation minutes</small><b>{number(ai.violations)}</b><span>Present measurements cap dispatch</span></div>
   <div><small>EV cost per delivered kWh</small><b>{signed(costChange,3)}%</b><span>AI {number(ai.unitCost*100,3)} cents / battery kWh</span></div>
  </div>
  <p>95% paired bootstrap intervals, resampling eight whole seeds: completed-charge advantage [{number(ci.ready.low,3)}, {number(ci.ready.high,3)}] visits/scenario; unmet-energy advantage [{number(ci.unmet.low,3)}, {number(ci.unmet.high,3)}] kWh/scenario. Positive favours AI. An interval spanning zero is inconclusive.</p>
  <details><summary>Acceptance checks and condition results · {gate.accepted?'passed':'not passed'} against this reference</summary>
   <ul className="service-checks">{Object.entries(gate.checks).map(([key,passed])=><li key={key}><b>{passed?'Pass':'Not passed'}</b> · {checks[key]??key}</li>)}</ul>
   <div className="flex-table"><table><caption>Each condition has {number(evidence.visits/5)} visits. Positive differences favour AI.</caption><thead><tr><th>Condition</th><th>Completed charges gained</th><th>Unmet kWh avoided</th></tr></thead><tbody>{evidence.slices.map(s=>{const a=s.totals.find(r=>r.policy==='hybrid-ai')!,b=s.totals.find(r=>r.policy===reference)!;return <tr key={s.condition}><th>{s.condition}</th><td>{signed(a.ready-b.ready)}</td><td>{signed(b.unmet-a.unmet,1)}</td></tr>;})}</tbody></table></div>
  </details>
  <details><summary>Compare all six strategies and both unlearned hybrids</summary><div className="flex-table"><table><caption>Same visits, weather and physical limits. Uncontrolled charging violates the grid allowance and cannot qualify as a safe reference.</caption><thead><tr><th>Controller</th><th>Ready / visits</th><th>Unmet kWh</th><th>Site energy €</th><th>EV cents / battery kWh</th><th>Violation min</th></tr></thead><tbody>{evidence.totals.map(r=><tr key={r.policy} className={r.policy==='hybrid-ai'?'selector-highlight':''}><th>{names[r.policy]}</th><td>{number(r.ready)} / {number(r.visits)}</td><td>{number(r.unmet,1)}</td><td>{number(r.cost,2)}</td><td>{number(r.unitCost*100,3)}</td><td>{number(r.violations)}</td></tr>)}</tbody></table></div></details>
  <details className="service-replay"><summary>Inspect a paired charging day</summary>
   <p>Replay any test day with the frozen model. Both controllers see the same measured headroom and connected requests; future actual departures and weather stay hidden from dispatch. A single day can favour either controller.</p>
   {!model&&<button className="btn" disabled={loading} onClick={loadReplay}>{loading?'Loading frozen model…':'Load paired service replay'}</button>}
   {replay&&<><div className="service-replay-controls">
    <label>Seed<select aria-label="Service replay seed" value={seed} onChange={e=>setSeed(Number(e.target.value))}>{evidence.protocol.testSeeds.map(s=><option key={s} value={s}>{s}</option>)}</select></label>
    <label>Day of year<select aria-label="Service replay day" value={day} onChange={e=>setDay(Number(e.target.value))}>{evidence.protocol.testDays.map(d=><option key={d} value={d}>{d+1}</option>)}</select></label>
    <label>Condition<select aria-label="Service replay condition" value={condition} onChange={e=>setCondition(e.target.value as SpecialistCondition)}>{evidence.protocol.conditions.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
   </div><div className="flex-table"><table aria-label="Paired service replay results"><thead><tr><th>Controller</th><th>Ready / visits</th><th>Unmet kWh</th><th>Site energy €</th><th>Violation min</th></tr></thead><tbody>{[[names['hybrid-ai'],replay.ai],[names[reference],replay.fixed]].map(([label,result])=>{const r=result as typeof replay.ai;return <tr key={label as string}><th>{label as string}</th><td>{r.final.ready} / {r.final.departed}</td><td>{number(r.final.shortfall,2)}</td><td>{number(r.final.cost,2)}</td><td>{r.final.violations}</td></tr>;})}</tbody></table></div>
   <div className="flex-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={replay.chart}><CartesianGrid stroke="#293644"/><XAxis dataKey="time" tickFormatter={clock}/><YAxis/><Tooltip labelFormatter={t=>clock(Number(t))} contentStyle={{background:'var(--popover)',border:'1px solid var(--border)'}}/><Line name="Forecast-informed hybrid" dataKey="ai" stroke="#70e3bb" dot={false} isAnimationActive={false}/><Line name={names[reference]} dataKey="reference" stroke="#91a7fc" dot={false} isAnimationActive={false}/><Line name="Grid allowance" dataKey="limit" stroke="#e9eef4" strokeDasharray="3 3" dot={false} isAnimationActive={false}/></LineChart></ResponsiveContainer></div><p>Net grid power in kW. Mint: forecast-informed hybrid; purple: selected reference; dashed: import allowance.</p></>}
   {error&&<p role="alert">{error}</p>}
  </details>
  <p>Incremental EV cost subtracts a same-weather no-EV site bill, then divides by battery energy delivered. This does not prove savings at identical service. Results apply to this synthetic fixture; real charger data and driver outcomes are the next validation step.</p>
  <div className="service-proof-links"><a className="btn" href={`${base}/models/${evidence.filename}`} download>Download full service evidence</a><a className="btn" href="https://github.com/pli-poc/ev-flexibility-twin/blob/main/docs/service-hybrid-controller.md" target="_blank" rel="noreferrer">Method and both test rounds</a></div>
 </section>;
}
