const test=require('node:test');const assert=require('node:assert/strict');
const {makeFixtureSignal,replaySignalEvents,runSyntheticReplay,validateDispatch,exerciseVirtualAdapter}=require('../.test-build/replay');
const {defaults,simulate}=require('../.test-build/engine');
const minuteTime=m=>new Date(Date.UTC(2026,5,15)+m*60_000).toISOString();

test('fixed event streams produce the same versioned snapshot regardless of arrival order',()=>{
 const grid=makeFixtureSignal('grid-limit'),solar=makeFixtureSignal('solar-shortfall');
 const a=replaySignalEvents([grid,solar,grid],minuteTime(780),42),b=replaySignalEvents([grid,solar,grid].reverse(),minuteTime(780),42);
 assert.equal(a.fingerprint,b.fingerprint);assert.deepEqual(a.activeSignals,b.activeSignals);assert.equal(a.duplicateCount,1);
 const first=runSyntheticReplay({events:[grid,solar,grid],minute:780,seed:42}),second=runSyntheticReplay({events:[grid,solar,grid].reverse(),minute:780,seed:42});
 assert.equal(first.snapshot.id,second.snapshot.id);assert.deepEqual(first.assessment,second.assessment);
});

test('revisions replace only the source event and a cancellation suppresses earlier revisions',()=>{
 const original=makeFixtureSignal('grid-limit'),updated={...original,revision:2,recordedAt:minuteTime(590),validFrom:minuteTime(570),validUntil:minuteTime(700)};
 const during=replaySignalEvents([updated,original],minuteTime(600),7);
 assert.equal(during.activeSignals.length,1);assert.equal(during.activeSignals[0].revision,2);assert.ok(during.dispositions.some(x=>x.state==='superseded'));
 const afterWindow=replaySignalEvents([original,updated],minuteTime(720),7);assert.equal(afterWindow.activeSignals.length,0);
 const cancelled={...updated,revision:3,operation:'cancel'};const afterCancel=replaySignalEvents([updated,cancelled,original],minuteTime(600),7);
 assert.equal(afterCancel.activeSignals.length,0);assert.ok(afterCancel.dispositions.some(x=>x.state==='cancelled'));
});

test('stale, future-recorded and malformed events are suppressed with explicit provenance',()=>{
 const stale={...makeFixtureSignal('grid-limit'),recordedAt:minuteTime(500)},future={...makeFixtureSignal('solar-shortfall'),recordedAt:minuteTime(900)};
 const snapshot=replaySignalEvents([stale,future,{sourceEventId:'bad'}],minuteTime(555),42);
 assert.equal(snapshot.activeSignals.length,0);assert.ok(snapshot.dispositions.some(x=>x.state==='stale'));assert.ok(snapshot.dispositions.some(x=>x.state==='invalid'));
 const current=makeFixtureSignal('grid-limit'),lateRevision={...current,revision:2,recordedAt:minuteTime(600)};
 const outOfOrder=replaySignalEvents([lateRevision,current],minuteTime(555),42);assert.equal(outOfOrder.activeSignals[0].revision,1);
 const replay=runSyntheticReplay({signal:'grid-limit',quality:'stale'});assert.equal(replay.assessment.status,'fallback');assert.equal(replay.assessment.recommendedPolicy,'balanced');assert.equal(replay.snapshot.event.activeSignals.length,0);
});

test('same-revision conflicts have no winner and the safety validator rejects over-limit plans',()=>{
 const original=makeFixtureSignal('grid-limit'),conflict={...original,recordedAt:minuteTime(551)};const stream=replaySignalEvents([original,conflict],minuteTime(555),42);
 assert.equal(stream.activeSignals.length,0);assert.ok(stream.dispositions.some(x=>x.state==='conflict'));
 const result=simulate({...defaults,preset:'capacity',policy:'immediate'}),frame=structuredClone(result.frames[555]);frame.grid=frame.limit+10;
 const check=validateDispatch(frame,result.vehicles,original);assert.equal(check.valid,false);assert.ok(check.errors.some(x=>x.includes('import limit')));
});

test('unavailable or malformed assessment falls back to deterministic load balancing',()=>{
 for(const mode of ['unavailable','malformed']){const result=runSyntheticReplay({signal:'grid-limit',assessment:mode});assert.equal(result.assessment.status,'fallback');assert.equal(result.assessment.recommendedPolicy,'balanced');assert.equal(result.strategy,'Load balancing');assert.equal(result.validation.valid,true);}
});

test('replaceable assessor results are structured; malformed output falls back safely',()=>{
 const recommendation={assessor:'test-assessor',version:'test-1',status:'assessed',urgency:'high',impact:'Fixture recommendation.',flexibilityKw:8,confidence:.8,recommendedPolicy:'ems',explanation:'Structured test recommendation.'};
 const accepted=runSyntheticReplay({signal:'grid-limit',assessor:()=>recommendation});assert.equal(accepted.assessment.assessor,'test-assessor');assert.equal(accepted.assessment.recommendedPolicy,'ems');
 const rejected=runSyntheticReplay({signal:'grid-limit',assessor:()=>({recommendedPolicy:'immediate'})});assert.equal(rejected.assessment.status,'fallback');assert.equal(rejected.assessment.recommendedPolicy,'balanced');
 const lowConfidence=runSyntheticReplay({signal:'grid-limit',assessor:()=>({...recommendation,confidence:.2})});assert.equal(lowConfidence.assessment.status,'fallback');assert.equal(lowConfidence.assessment.recommendedPolicy,'balanced');
 const thrown=runSyntheticReplay({signal:'grid-limit',assessor:()=>{throw new Error('fixture failure');}});assert.equal(thrown.assessment.status,'fallback');assert.equal(thrown.assessment.recommendedPolicy,'balanced');
});

test('virtual accepted, rejected, delayed, duplicate and missing acknowledgements remain distinct from meter feedback',()=>{
 const outputs=new Map();
 for(const acknowledgement of ['accepted','rejected','delayed','duplicate','missing']){
  const result=runSyntheticReplay({signal:'grid-limit',acknowledgement});assert.ok(result.validation.valid);assert.ok(result.intents.length>0);assert.equal(result.feedback.length,result.intents.length);outputs.set(acknowledgement,result);
 }
 const accepted=outputs.get('accepted'),rejected=outputs.get('rejected'),delayed=outputs.get('delayed'),duplicate=outputs.get('duplicate'),missing=outputs.get('missing');
 assert.equal(accepted.reconciliation[0].state,'reconciled');assert.equal(rejected.reconciliation[0].state,'rejected');
 assert.equal(delayed.acknowledgements[0].latencyMinutes,3);assert.ok(delayed.acknowledgements[0].receivedAt>delayed.intents[0].createdAt);
 assert.equal(duplicate.duplicatesSuppressed,duplicate.intents.length);assert.equal(duplicate.acknowledgements.length,duplicate.intents.length);
 assert.equal(missing.acknowledgements.length,0);assert.ok(missing.reconciliation.every(x=>x.state==='unconfirmed'&&x.measuredPowerKw>0));
 assert.notEqual(rejected.reconciliation[0].meterEnergyKwh,accepted.reconciliation[0].meterEnergyKwh);
});

test('stale or missing telemetry cannot confirm delivery, and late replies expire',()=>{
 const stale=runSyntheticReplay({signal:'grid-limit',acknowledgement:'accepted',telemetry:'stale'});
 assert.ok(stale.reconciliation.every(x=>x.state==='unconfirmed'&&x.feedbackQuality==='stale'));
 const missing=runSyntheticReplay({signal:'grid-limit',acknowledgement:'accepted',telemetry:'missing'});
 assert.equal(missing.feedback.length,0);assert.ok(missing.reconciliation.every(x=>x.state==='unconfirmed'&&x.feedbackQuality==='missing'&&x.acknowledgedPowerKw>0));
 const intent={id:'expires-test',planId:'plan-test',correlationId:'corr-test',evseId:'EVSE-01',sessionId:'session-1',vehicleId:0,targetPowerKw:7,createdAt:minuteTime(620),expiresAt:minuteTime(625),createdAtMinute:620,expiresAtMinute:625};
 const late=exerciseVirtualAdapter([intent],'delayed',623,{'expires-test':7});assert.equal(late.acknowledgements[0].status,'expired');assert.equal(late.acknowledgements[0].acceptedPowerKw,null);
});

test('connection loss uses local fallback; charger recovery and infeasible service remain visible',()=>{
 const offline=runSyntheticReplay({signal:'connection-loss'});assert.equal(offline.validation.remoteAllowed,false);assert.equal(offline.intents.length,0);assert.equal(offline.summary.connectionRecovered,true);
 const fault=runSyntheticReplay({signal:'charger-fault'});assert.equal(fault.summary.faultRecovered,true);assert.equal(fault.validation.valid,true);
 const impossible=runSyntheticReplay({signal:'infeasible-demand'});assert.ok(impossible.summary.shortfallKwh>0);assert.equal(impossible.validation.valid,true);
});

test('estimated signal quality is retained while confidence is reduced',()=>{
 const result=runSyntheticReplay({signal:'solar-shortfall',quality:'estimated'});assert.equal(result.snapshot.event.activeSignals[0].quality,'estimated');assert.equal(result.assessment.confidence,.72);assert.ok(result.snapshot.observations.every(o=>o.source==='synthetic-simulator'&&o.observedAt===o.recordedAt));
});
